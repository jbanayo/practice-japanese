"""
Annotates generated sentences with furigana (ruby readings) ONLY for words
that are harder than the session's target level — the tested word itself,
and anything at-or-below the target level, stays flat text so the person is
forced to read it.

Uses the SAME reference DB we already built for vocab/kanji grounding (no
new download needed) via a simple greedy longest-match "dictionary lookup"
against our own vocab + kanji tables — not a real tokenizer, but a
reasonable approximation given we already control what level of vocabulary
should appear unassisted.
"""

import re
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "reference.db"

# N1 is hardest, N5 is easiest — lower number = harder.
LEVEL_RANK = {"N1": 1, "N2": 2, "N3": 3, "N4": 4, "N5": 5}

_vocab_index = None  # word -> {"reading":, "level_rank":}
_kanji_index = None  # character -> {"reading":, "level_rank":}
_max_vocab_len = 1


def _has_kanji(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def _load_indexes():
    """Lazily loads the full vocab/kanji tables into memory once. The
    dataset is small (a few thousand rows), so this is cheap."""
    global _vocab_index, _kanji_index, _max_vocab_len
    if _vocab_index is not None:
        return

    _vocab_index = {}
    _kanji_index = {}
    _max_vocab_len = 1

    if not DB_PATH.exists():
        # No reference DB yet — furigana annotation degrades to a no-op
        # rather than crashing generation.
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        for word, reading, jlpt_level in cur.execute(
            "SELECT word, reading, jlpt_level FROM vocab"
        ):
            if word not in _vocab_index and _has_kanji(word):
                _vocab_index[word] = {
                    "reading": reading,
                    "level_rank": LEVEL_RANK.get(jlpt_level, 3),
                }
                _max_vocab_len = max(_max_vocab_len, len(word))

        for character, kun, on, jlpt_level in cur.execute(
            "SELECT character, kun_readings, on_readings, jlpt_level FROM kanji"
        ):
            reading = (kun or on or "").split(",")[0].strip()
            _kanji_index[character] = {
                "reading": reading,
                "level_rank": LEVEL_RANK.get(jlpt_level, 3),
            }
    finally:
        conn.close()


def annotate_sentence(sentence: str, target_level: str, target_word: str) -> list:
    """
    Returns a list of segments: [{"text": str, "furigana": str|None}, ...]
    - target_word never gets furigana (must be read unassisted)
    - words/kanji at or below target_level (i.e. same difficulty or easier)
      never get furigana
    - words/kanji HARDER than target_level get furigana from our reference data
    - anything not found in our reference data is left as-is (we can't
      annotate what we don't have verified readings for)
    """
    _load_indexes()
    target_rank = LEVEL_RANK.get(target_level.upper(), 3)

    raw_segments = []
    i = 0
    n = len(sentence)

    while i < n:
        # 1. Target word always wins, always flat — checked first so it's
        #    never accidentally annotated even if it also exists in our dict.
        if target_word and sentence.startswith(target_word, i):
            raw_segments.append({"text": target_word, "furigana": None})
            i += len(target_word)
            continue

        # 2. Greedy longest match against known vocab words.
        matched_len = 0
        for length in range(min(_max_vocab_len, n - i), 0, -1):
            candidate = sentence[i:i + length]
            if candidate in _vocab_index:
                entry = _vocab_index[candidate]
                furigana = entry["reading"] if entry["level_rank"] < target_rank else None
                raw_segments.append({"text": candidate, "furigana": furigana})
                matched_len = length
                break
        if matched_len:
            i += matched_len
            continue

        # 3. Fallback: single kanji lookup.
        ch = sentence[i]
        if _has_kanji(ch) and ch in _kanji_index:
            entry = _kanji_index[ch]
            furigana = entry["reading"] if entry["level_rank"] < target_rank else None
            raw_segments.append({"text": ch, "furigana": furigana})
            i += 1
            continue

        # 4. Unknown character (kana, punctuation, or unrecognized kanji) — flat.
        raw_segments.append({"text": ch, "furigana": None})
        i += 1

    # Merge adjacent plain-text segments for cleaner output.
    merged = []
    for seg in raw_segments:
        if merged and merged[-1]["furigana"] is None and seg["furigana"] is None:
            merged[-1]["text"] += seg["text"]
        else:
            merged.append(dict(seg))

    return merged
