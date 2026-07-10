"""
Pulls random, verified vocab/kanji entries from the local reference DB
(built by scripts/build_reference_db.py) for a given JLPT level. These are
fed into the generation prompt as ground truth so the LLM writes original
sentences around REAL facts instead of inventing readings/meanings.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "reference.db"


class ReferenceDataError(Exception):
    pass


def _get_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise ReferenceDataError(
            f"Reference DB not found at {DB_PATH}. "
            f"Run 'python scripts/build_reference_db.py' first."
        )
    return sqlite3.connect(DB_PATH)


def get_random_vocab(level: str, count: int, exclude_words: list[str] = None) -> list[dict]:
    """Returns up to `count` random vocab entries for the given JLPT level,
    optionally excluding words already seen (used by 'generate new' mode)."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        exclude_words = exclude_words or []
        placeholders = ",".join("?" * len(exclude_words))
        exclude_clause = f"AND word NOT IN ({placeholders})" if exclude_words else ""
        cur.execute(
            f"""SELECT word, reading, meaning, pos_category FROM vocab
                WHERE jlpt_level = ? {exclude_clause}
                ORDER BY RANDOM() LIMIT ?""",
            (level.upper(), *exclude_words, count),
        )
        return [
            {"word": w, "reading": r, "meaning": m, "pos_category": p}
            for w, r, m, p in cur.fetchall()
        ]
    finally:
        conn.close()


def get_random_kanji(level: str, count: int, exclude_words: list[str] = None) -> list[dict]:
    """Returns up to `count` random kanji entries for the given JLPT level,
    optionally excluding characters already seen (used by 'generate new' mode)."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        exclude_words = exclude_words or []
        placeholders = ",".join("?" * len(exclude_words))
        exclude_clause = f"AND character NOT IN ({placeholders})" if exclude_words else ""
        cur.execute(
            f"""SELECT character, on_readings, kun_readings, meanings FROM kanji
                WHERE jlpt_level = ? {exclude_clause}
                ORDER BY RANDOM() LIMIT ?""",
            (level.upper(), *exclude_words, count),
        )
        return [
            {"character": c, "on_readings": on, "kun_readings": kun, "meanings": m}
            for c, on, kun, m in cur.fetchall()
        ]
    finally:
        conn.close()


def get_vocab_by_words(level: str, words: list[str]) -> list[dict]:
    """Exact lookup for specific words — used by 'review' mode to fetch
    verified data for words the person has already seen before."""
    if not words:
        return []
    conn = _get_connection()
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(words))
        cur.execute(
            f"""SELECT word, reading, meaning, pos_category FROM vocab
                WHERE jlpt_level = ? AND word IN ({placeholders})""",
            (level.upper(), *words),
        )
        # De-duplicate in case the same word appears more than once in the source data
        seen = {}
        for w, r, m, p in cur.fetchall():
            if w not in seen:
                seen[w] = {"word": w, "reading": r, "meaning": m, "pos_category": p}
        return list(seen.values())
    finally:
        conn.close()


def get_kanji_by_characters(level: str, characters: list[str]) -> list[dict]:
    """Exact lookup for specific kanji — used by 'review' mode."""
    if not characters:
        return []
    conn = _get_connection()
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(characters))
        cur.execute(
            f"""SELECT character, on_readings, kun_readings, meanings FROM kanji
                WHERE jlpt_level = ? AND character IN ({placeholders})""",
            (level.upper(), *characters),
        )
        seen = {}
        for c, on, kun, m in cur.fetchall():
            if c not in seen:
                seen[c] = {"character": c, "on_readings": on, "kun_readings": kun, "meanings": m}
        return list(seen.values())
    finally:
        conn.close()
