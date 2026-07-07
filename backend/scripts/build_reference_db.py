"""
Downloads open, MIT-licensed Japanese reference data and builds a local
SQLite database used to ground the LLM's question generation in real,
verified facts (instead of letting it hallucinate readings/meanings).

Sources:
- Vocabulary: https://github.com/elzup/jlpt-word-list (MIT license)
- Kanji:      https://github.com/davidluzgouveia/kanji-data (MIT license)

Run this once during setup, and again any time you want to refresh the data:
    python scripts/build_reference_db.py
"""

import csv
import io
import json
import sqlite3
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

VOCAB_LEVELS = ["n1", "n2", "n3", "n4", "n5"]


def _fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read().decode("utf-8")


def _fetch_json(url: str) -> dict:
    return json.loads(_fetch_text(url))


def build_vocab_table(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS vocab")
    cur.execute("""
        CREATE TABLE vocab (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            reading TEXT,
            meaning TEXT,
            jlpt_level TEXT NOT NULL
        )
    """)

    total = 0
    for level in VOCAB_LEVELS:
        url = VOCAB_CSV_URL_TEMPLATE.format(level=level)
        print(f"Fetching vocab: {url}")
        text = _fetch_text(url)
        reader = csv.reader(io.StringIO(text))
        level_label = level.upper()  # "n3" -> "N3"

        rows = []
        for row in reader:
            if len(row) < 3:
                continue
            word, reading, meaning = row[0].strip(), row[1].strip(), row[2].strip()
            if not word:
                continue
            if word.lower() == "expression":  # skip header row
                continue
            rows.append((word, reading, meaning, level_label))

        cur.executemany(
            "INSERT INTO vocab (word, reading, meaning, jlpt_level) VALUES (?, ?, ?, ?)",
            rows,
        )
        print(f"  -> {len(rows)} entries for {level_label}")
        total += len(rows)

    conn.commit()
    print(f"Vocab table built: {total} total entries")


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
            continue  # skip kanji with no JLPT level mapping
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
        build_vocab_table(conn)
        build_kanji_table(conn)
    finally:
        conn.close()
    print(f"\nDone. Reference DB written to: {DB_PATH}")


if __name__ == "__main__":
    main()
