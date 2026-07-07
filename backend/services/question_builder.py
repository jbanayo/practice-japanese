"""
Builds quiz items where the CORRECT ANSWER and DISTRACTORS are chosen by
our own code from verified reference data — never by the LLM. The LLM's
only job is to write a natural example sentence containing the given word,
in its base/dictionary form (unconjugated, so the reading can't drift).

This fixes the failure mode where the model picked a real-but-wrong reading
as "correct" (e.g. marking 遠's on-reading えん as correct in a context that
grammatically needed the kun-reading とお.い). By computing the answer key
ourselves, that class of error becomes impossible.
"""

import random
import re

from services.reference_data import get_random_vocab, get_random_kanji


def _first_segment(text: str) -> str:
    """Takes the first clause of a comma/semicolon-separated meaning/reading string."""
    parts = re.split(r"[,;]", text)
    return parts[0].strip()


def _has_kanji(text: str) -> bool:
    """True if the string contains at least one CJK ideograph."""
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def build_vocab_items(level: str, count: int) -> list[dict]:
    """
    Returns `count` items, each with:
      id, word, reading, meaning, question_type ('meaning' or 'reading'),
      correct_answer, distractors (3 wrong-but-real answers)
    """
    # Fetch extra entries beyond `count` to use as a distractor pool.
    pool = get_random_vocab(level, count + 12)
    if len(pool) < count + 4:
        raise ValueError(
            f"Not enough {level} vocab entries for a batch of {count} "
            f"(need at least {count + 4}, found {len(pool)})"
        )

    correct_entries = pool[:count]
    distractor_pool = pool[count:]

    items = []
    for i, entry in enumerate(correct_entries):
        # Kana-only words (no kanji) have reading == word, so a "reading"
        # question would be trivial/degenerate — always test meaning instead.
        if _has_kanji(entry["word"]):
            question_type = "meaning" if i % 2 == 0 else "reading"
        else:
            question_type = "meaning"

        correct_answer = (
            _first_segment(entry["meaning"]) if question_type == "meaning"
            else entry["reading"]
        )

        distractor_source = random.sample(distractor_pool, min(3, len(distractor_pool)))
        distractors = [
            _first_segment(d["meaning"]) if question_type == "meaning" else d["reading"]
            for d in distractor_source
        ]

        items.append({
            "id": i + 1,
            "word": entry["word"],
            "reading": entry["reading"],
            "meaning": entry["meaning"],
            "question_type": question_type,
            "correct_answer": correct_answer,
            "distractors": distractors,
        })

    return items


def build_kanji_items(level: str, count: int) -> list[dict]:
    """
    Returns `count` items, each with:
      id, character, reading, meaning, question_type ('meaning' or 'reading'),
      correct_answer, distractors (3 wrong-but-real answers)

    For reading questions, prefers kun-reading (more distinguishing for
    learners) and falls back to on-reading if no kun-reading exists.
    """
    pool = get_random_kanji(level, count + 12)
    if len(pool) < count + 4:
        raise ValueError(
            f"Not enough {level} kanji entries for a batch of {count} "
            f"(need at least {count + 4}, found {len(pool)})"
        )

    correct_entries = pool[:count]
    distractor_pool = pool[count:]

    def primary_reading(entry: dict) -> str:
        if entry["kun_readings"]:
            return _first_segment(entry["kun_readings"])
        return _first_segment(entry["on_readings"])

    items = []
    for i, entry in enumerate(correct_entries):
        question_type = "meaning" if i % 2 == 0 else "reading"
        correct_answer = (
            _first_segment(entry["meanings"]) if question_type == "meaning"
            else primary_reading(entry)
        )

        distractor_source = random.sample(distractor_pool, min(3, len(distractor_pool)))
        distractors = [
            _first_segment(d["meanings"]) if question_type == "meaning" else primary_reading(d)
            for d in distractor_source
        ]

        items.append({
            "id": i + 1,
            "character": entry["character"],
            "reading": primary_reading(entry),
            "meaning": _first_segment(entry["meanings"]),
            "question_type": question_type,
            "correct_answer": correct_answer,
            "distractors": distractors,
        })

    return items


def assemble_final_questions(items: list[dict], sentences_by_id: dict) -> list[dict]:
    """
    Combines backend-computed correct answers/distractors with the model's
    generated sentences into final quiz question objects. Shuffles options
    and computes correct_option ourselves — never trusts the model for this.
    """
    questions = []
    for item in items:
        sentence_data = sentences_by_id.get(item["id"], {})
        sentence = sentence_data.get("sentence", "")
        explanation = sentence_data.get("explanation", "")

        target = item.get("word") or item.get("character")
        if item["question_type"] == "meaning":
            question_line = f"「{target}」の意味は何ですか。"
        else:
            question_line = f"「{target}」の読み方は何ですか。"

        options = item["distractors"] + [item["correct_answer"]]
        random.shuffle(options)
        correct_option = options.index(item["correct_answer"])

        questions.append({
            "id": item["id"],
            "prompt": f"{sentence}\n{question_line}" if sentence else question_line,
            "options": options,
            "correct_option": correct_option,
            "explanation": explanation or f"正解: {item['correct_answer']}",
            "topic": target,
        })

    return questions
