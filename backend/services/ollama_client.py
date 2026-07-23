"""
Thin wrapper around the local Ollama API.
Handles the request, strips any accidental markdown fences, parses JSON,
and validates the shape before handing it back to the Flask layer.
"""

import json
import re
import requests

OLLAMA_GENERATE_URL = "http://localhost:11434/api/generate"
OLLAMA_TAGS_URL = "http://localhost:11434/api/tags"
DEFAULT_MODEL = "qwen2.5:7b-instruct"

# Backwards-compat alias (used elsewhere in this file below)
OLLAMA_URL = OLLAMA_GENERATE_URL


class GenerationError(Exception):
    pass


def list_available_models() -> list[str]:
    """
    Returns the list of model names currently pulled/available in the
    person's local Ollama install (e.g. ["qwen2.5:7b-instruct", "llama3:8b"]).
    Returns an empty list (rather than raising) if Ollama isn't reachable —
    the settings UI can show a clear "Ollama not running" message either way.
    """
    try:
        response = requests.get(OLLAMA_TAGS_URL, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException:
        return []

    data = response.json()
    return [m["name"] for m in data.get("models", [])]


def _strip_code_fences(text: str) -> str:
    """Some models wrap JSON in ```json ... ``` even when told not to. Strip it."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


BLANK_RE = re.compile(r"_+")

# Particles that commonly get duplicated between the sentence template and
# the answer option (observed bug: sentence has "__たら" as fixed text, and
# the "correct" option also ends in "たら", producing "帰ったらたら").
GRAMMAR_PARTICLES = [
    "なければ", "ければ", "たら", "れば", "ても", "しまう", "ような", "そう", "ば", "と",
]


def _has_duplicate_particle(prompt_text: str, correct_answer: str) -> bool:
    """Detects the sentence/option duplication bug for grammar questions."""
    match = BLANK_RE.search(prompt_text)
    if not match:
        return False
    after_blank = prompt_text[match.end():match.end() + 10]
    for particle in GRAMMAR_PARTICLES:
        if correct_answer.endswith(particle) and after_blank.startswith(particle):
            return True
    return False


def _validate_questions(data: dict, expected_count: int) -> list:
    if "questions" not in data or not isinstance(data["questions"], list):
        raise GenerationError("Response missing 'questions' array")

    questions = data["questions"]
    if len(questions) == 0:
        raise GenerationError("Model returned zero questions")

    for i, q in enumerate(questions):
        required_keys = {"prompt", "options", "correct_option", "explanation"}
        missing = required_keys - set(q.keys())
        if missing:
            raise GenerationError(f"Question {i} missing keys: {missing}")
        if not isinstance(q["options"], list) or len(q["options"]) != 4:
            raise GenerationError(f"Question {i} does not have exactly 4 options")
        for opt in q["options"]:
            if "_" in opt or "," in opt or "、" in opt:
                raise GenerationError(
                    f"Question {i} has a malformed option (contains stray "
                    f"underscore/comma instead of a clean word): {opt!r}"
                )
        if not isinstance(q["correct_option"], int) or not (0 <= q["correct_option"] <= 3):
            raise GenerationError(f"Question {i} has invalid correct_option: {q['correct_option']}")

        correct_answer = q["options"][q["correct_option"]]
        if _has_duplicate_particle(q["prompt"], correct_answer):
            raise GenerationError(
                f"Question {i} has a duplicated grammar particle between the "
                f"sentence template and the correct answer (e.g. '...たら' + "
                f"'帰ったら' -> '帰ったらたら'). Sentence: {q['prompt']!r}, "
                f"answer: {correct_answer!r}. Retry the request."
            )

        # normalize id if missing
        q["id"] = q.get("id", i + 1)

    return questions


def generate_questions(prompt: str, expected_count: int, model: str = DEFAULT_MODEL,
                        timeout: int = 120) -> list:
    """
    Calls Ollama with the given prompt, forces JSON output, validates the
    result shape, and returns a list of question dicts.

    Raises GenerationError if the model output can't be parsed or validated.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "format": "json",   # forces Ollama to constrain output to valid JSON
        "stream": False,
        "options": {
            "temperature": 0.7,
        },
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        response.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise GenerationError(
            "Could not connect to Ollama at localhost:11434. "
            "Is the Ollama service running? (try: ollama serve)"
        )
    except requests.exceptions.Timeout:
        raise GenerationError(f"Ollama did not respond within {timeout}s")
    except requests.exceptions.HTTPError as e:
        raise GenerationError(f"Ollama returned an error: {e}")

    raw_output = response.json().get("response", "")
    cleaned = _strip_code_fences(raw_output)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise GenerationError(f"Model did not return valid JSON: {e}\nRaw output: {raw_output[:500]}")

    return _validate_questions(data, expected_count)


def _validate_sentence_items(data: dict) -> list:
    if "items" not in data or not isinstance(data["items"], list):
        raise GenerationError("Response missing 'items' array")

    items = data["items"]
    if len(items) == 0:
        raise GenerationError("Model returned zero items")

    for i, item in enumerate(items):
        required_keys = {"id", "sentence", "explanation"}
        missing = required_keys - set(item.keys())
        if missing:
            raise GenerationError(f"Item {i} missing keys: {missing}")
        if not str(item["sentence"]).strip():
            raise GenerationError(f"Item {i} has an empty sentence")

        # NEW: legitimate Japanese text never contains Latin letters —
        # loanwords get written in katakana, not English script. Any a-z/A-Z
        # in the sentence means the model leaked English into it.
        if re.search(r"[a-zA-Z]", item["sentence"]):
            raise GenerationError(
                f"Item {i} has English text leaked into the Japanese sentence: "
                f"{item['sentence']!r}. Retry the request."
            )

    return items


def generate_sentences(prompt: str, model: str = DEFAULT_MODEL,
                        timeout: int = 120) -> dict:
    """
    Calls Ollama to generate example sentences only (no options/correct
    answers — those are computed by question_builder.py from verified data).
    Returns a dict mapping id -> {"sentence":, "explanation":}.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.7},
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        response.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise GenerationError(
            "Could not connect to Ollama at localhost:11434. "
            "Is the Ollama service running? (try: ollama serve)"
        )
    except requests.exceptions.Timeout:
        raise GenerationError(f"Ollama did not respond within {timeout}s")
    except requests.exceptions.HTTPError as e:
        raise GenerationError(f"Ollama returned an error: {e}")

    raw_output = response.json().get("response", "")
    cleaned = _strip_code_fences(raw_output)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise GenerationError(f"Model did not return valid JSON: {e}\nRaw output: {raw_output[:500]}")

    items = _validate_sentence_items(data)
    return {item["id"]: item for item in items}
