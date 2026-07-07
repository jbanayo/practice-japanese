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


def get_random_vocab(level: str, count: int) -> list[dict]:
    """Returns up to `count` random vocab entries for the given JLPT level."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT word, reading, meaning FROM vocab
               WHERE jlpt_level = ?
               ORDER BY RANDOM() LIMIT ?""",
            (level.upper(), count),
        )
        return [
            {"word": w, "reading": r, "meaning": m}
            for w, r, m in cur.fetchall()
        ]
    finally:
        conn.close()


def get_random_kanji(level: str, count: int) -> list[dict]:
    """Returns up to `count` random kanji entries for the given JLPT level."""
    conn = _get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT character, on_readings, kun_readings, meanings FROM kanji
               WHERE jlpt_level = ?
               ORDER BY RANDOM() LIMIT ?""",
            (level.upper(), count),
        )
        return [
            {"character": c, "on_readings": on, "kun_readings": kun, "meanings": m}
            for c, on, kun, m in cur.fetchall()
        ]
    finally:
        conn.close()
