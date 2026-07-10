"""
Downloads open, MIT/CC-BY-SA-licensed Japanese reference data and builds a
local SQLite database used to ground the LLM's question generation in real,
verified facts (instead of letting it hallucinate readings/meanings/POS).

Sources:
- Vocabulary:      https://github.com/elzup/jlpt-word-list (MIT license)
- Kanji:           https://github.com/davidluzgouveia/kanji-data (MIT license)
- Part-of-speech:  https://github.com/scriptin/jmdict-simplified (CC BY-SA 4.0,
                    built from the JMdict project by the Electronic Dictionary
                    Research and Development Group)

Run this once during setup, and again any time you want to refresh the data:
    python scripts/build_reference_db.py

NOTE ON THE POS DOWNLOAD STEP: this fetches ~11MB (jmdict-eng-*.json.tgz) via
the GitHub API to find the current release, then downloads and parses it.
This is the one part of this script that wasn't tested end-to-end before
shipping (sandboxed dev environment couldn't reach the release asset host) —
if this step behaves unexpectedly, the printed diagnostics below should make
it clear what happened so it can be fixed.
"""

import csv
import io
import json
import re
import sqlite3
import tarfile
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DATA_DIR / "reference.db"

VOCAB_CSV_URL_TEMPLATE = (
    "https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/{level}.csv"
)
KANJI_JSON_URL = (
    "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
)
JMDICT_RELEASES_API = (
    "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
)

VOCAB_LEVELS = ["n1", "n2", "n3", "n4", "n5"]


def _fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "japanese-exam-app"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def _fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "japanese-exam-app"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _fetch_json(url: str) -> dict:
    return json.loads(_fetch_text(url))


# ---------------------------------------------------------------------------
# Part-of-speech data (for distractor similarity — e.g. don't mix a particle
# in with verb options as wrong answers, since that's an easy giveaway).
# ---------------------------------------------------------------------------

def find_jmdict_eng_download_url() -> str:
    """Finds the current jmdict-eng-*.json.tgz asset (full English JMdict,
    NOT the 'common' subset, NOT the 'examples' variant, NOT the giant
    furigana+pitch-accent extended version we don't need)."""
    print(f"Checking latest jmdict-simplified release: {JMDICT_RELEASES_API}")
    release = _fetch_json(JMDICT_RELEASES_API)
    pattern = re.compile(r"^jmdict-eng-[\d.+\-]+\.json\.tgz$")
    for asset in release.get("assets", []):
        if pattern.match(asset["name"]):
            print(f"Found asset: {asset['name']} ({asset['size'] / 1024 / 1024:.1f} MB)")
            return asset["browser_download_url"]
    raise RuntimeError(
        "Could not find a jmdict-eng-*.json.tgz asset in the latest "
        "jmdict-simplified release. The release asset naming may have "
        "changed — check https://github.com/scriptin/jmdict-simplified/releases/latest"
    )


def download_and_parse_jmdict(url: str) -> dict:
    print(f"Downloading: {url}")
    raw = _fetch_bytes(url)
    print(f"Downloaded {len(raw) / 1024 / 1024:.1f} MB, extracting...")

    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        json_member = next(
            (m for m in tar.getmembers() if m.name.endswith(".json")), None
        )
        if json_member is None:
            raise RuntimeError("No .json file found inside the downloaded archive")
        f = tar.extractfile(json_member)
        print(f"Parsing {json_member.name} ({json_member.size / 1024 / 1024:.1f} MB)...")
        data = json.load(f)

    word_count = len(data.get("words", []))
    print(f"Parsed {word_count} JMdict word entries")
    return data


def classify_pos(tags: list) -> str:
    """Maps a JMdict part-of-speech tag to a broad category used for
    distractor matching. Uses only the FIRST tag of the first sense as the
    primary indicator — words can have multiple senses/tags, but for
    distractor-matching purposes we just need a reasonable single bucket."""
    if not tags:
        return "other"
    tag = tags[0]

    if tag.startswith("v"):  # v1, v5k, v5r, vs, vk, vz, vi, vt, etc.
        return "verb"
    if tag.startswith("adj-"):  # adj-i, adj-na, adj-no, adj-t, etc.
        return "adjective"
    if tag == "prt":
        return "particle"
    if tag.startswith("adv"):  # adv, adv-to
        return "adverb"
    if tag == "conj":
        return "conjunction"
    if tag == "int":
        return "interjection"
    if tag in ("n", "pn", "num") or (tag.startswith("n-")):
        # noun, pronoun, numeral, and noun subtypes (n-adv, n-pr, n-suf, n-t, etc.)
        # — lumped together since they behave similarly as distractor options
        return "noun"
    return "other"


def build_word_pos_map(jmdict_data: dict) -> dict:
    """Builds a dict mapping word text (kanji or kana form) -> POS category,
    using the first sense encountered for each word. Doesn't overwrite an
    existing mapping — JMdict lists more common words/senses first, so the
    first mapping seen for a given text is preferentially kept."""
    word_pos_map = {}
    for word in jmdict_data.get("words", []):
        senses = word.get("sense", [])
        if not senses:
            continue
        category = classify_pos(senses[0].get("partOfSpeech", []))

        for form in word.get("kanji", []) + word.get("kana", []):
            text = form.get("text")
            if text and text not in word_pos_map:
                word_pos_map[text] = category

    return word_pos_map


# ---------------------------------------------------------------------------
# Vocab table (now includes pos_category)
# ---------------------------------------------------------------------------

def build_vocab_table(conn: sqlite3.Connection, word_pos_map: dict):
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS vocab")
    cur.execute("""
        CREATE TABLE vocab (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            reading TEXT,
            meaning TEXT,
            jlpt_level TEXT NOT NULL,
            pos_category TEXT NOT NULL DEFAULT 'other'
        )
    """)

    total = 0
    matched = 0
    category_counts = {}

    for level in VOCAB_LEVELS:
        url = VOCAB_CSV_URL_TEMPLATE.format(level=level)
        print(f"Fetching vocab: {url}")
        text = _fetch_text(url)
        reader = csv.reader(io.StringIO(text))
        level_label = level.upper()

        rows = []
        for row in reader:
            if len(row) < 3:
                continue
            word, reading, meaning = row[0].strip(), row[1].strip(), row[2].strip()
            if not word:
                continue
            if word.lower() == "expression":  # skip header row
                continue

            pos_category = word_pos_map.get(word, "other")
            if pos_category != "other":
                matched += 1
            category_counts[pos_category] = category_counts.get(pos_category, 0) + 1

            rows.append((word, reading, meaning, level_label, pos_category))

        cur.executemany(
            """INSERT INTO vocab (word, reading, meaning, jlpt_level, pos_category)
               VALUES (?, ?, ?, ?, ?)""",
            rows,
        )
        print(f"  -> {len(rows)} entries for {level_label}")
        total += len(rows)

    conn.commit()
    print(f"Vocab table built: {total} total entries")
    print(f"POS match rate: {matched}/{total} ({100 * matched / total:.1f}%) matched a known part-of-speech")
    print(f"POS category breakdown: {category_counts}")


# ---------------------------------------------------------------------------
# Kanji table (unchanged from before)
# ---------------------------------------------------------------------------

def build_kanji_table(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS kanji")
    cur.execute("""
        CREATE TABLE kanji (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character TEXT NOT NULL,
            on_readings TEXT,
            kun_readings TEXT,
            meanings TEXT,
            jlpt_level TEXT
        )
    """)

    print(f"Fetching kanji: {KANJI_JSON_URL}")
    data = _fetch_json(KANJI_JSON_URL)

    rows = []
    for character, entry in data.items():
        jlpt_new = entry.get("jlpt_new")
        if jlpt_new is None:
            continue
        level_label = f"N{jlpt_new}"

        on_readings = ", ".join(entry.get("readings_on") or [])
        kun_readings = ", ".join(entry.get("readings_kun") or [])
        meanings = ", ".join(entry.get("meanings") or [])

        rows.append((character, on_readings, kun_readings, meanings, level_label))

    cur.executemany(
        """INSERT INTO kanji (character, on_readings, kun_readings, meanings, jlpt_level)
           VALUES (?, ?, ?, ?, ?)""",
        rows,
    )
    conn.commit()
    print(f"Kanji table built: {len(rows)} total entries")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        print("=== Fetching part-of-speech data (for distractor matching) ===")
        try:
            jmdict_url = find_jmdict_eng_download_url()
            jmdict_data = download_and_parse_jmdict(jmdict_url)
            word_pos_map = build_word_pos_map(jmdict_data)
            print(f"Built POS map with {len(word_pos_map)} unique word forms\n")
        except Exception as e:
            print(f"WARNING: Could not fetch/parse POS data ({e})")
            print("Continuing without POS data — distractors will fall back to "
                  "random selection (the previous behavior) rather than "
                  "part-of-speech matching.\n")
            word_pos_map = {}

        print("=== Building vocab table ===")
        build_vocab_table(conn, word_pos_map)
        print("\n=== Building kanji table ===")
        build_kanji_table(conn)
    finally:
        conn.close()
    print(f"\nDone. Reference DB written to: {DB_PATH}")


if __name__ == "__main__":
    main()
