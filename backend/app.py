"""
Minimal Flask backend that bridges the frontend to the local Ollama instance.

Run with:
    python app.py

Test with:
    curl -X POST http://localhost:5000/generate \
      -H "Content-Type: application/json" \
      -d '{"level": "N4", "category": "vocabulary", "count": 5, "mode": "new"}'

Modes for vocabulary/kanji:
- "new" (default): random words not seen before. Optionally pass
  exclude_words (words the frontend already has stats for) to reduce repeats.
- "review": pass review_words (exact words the frontend selected, e.g. by
  weakest mastery / oldest last-seen). Fetches verified data for those exact
  words and generates fresh example sentences for them.

Architecture note:
- grammar: model generates full questions (options + correct_option) since
  there's no verified reference DB for grammar patterns to ground against.
- vocabulary / kanji: correct answers and distractors are computed by our
  OWN code from verified reference data (see services/question_builder.py).
  The model's only job is writing a natural example sentence — it never
  grades its own answer. This fixes the failure mode where the model would
  pick a real-but-contextually-wrong answer as "correct".
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

from services.prompt_templates import build_generation_prompt, build_sentence_prompt, build_scenario_npc_prompt
from services.ollama_client import (
    generate_questions, generate_sentences, list_available_models,
    GenerationError, DEFAULT_MODEL,
)
from services.question_builder import build_vocab_items, build_kanji_items, assemble_final_questions
from services.reference_data import get_vocab_by_words, get_kanji_by_characters
from services.scenario_data import get_random_scenario, get_scenario_by_id, list_scenario_summaries
from services.furigana import annotate_sentence

app = Flask(__name__)
CORS(app)  # allow the frontend (different port during dev) to call this API

VALID_LEVELS = {"N5", "N4", "N3", "N2", "N1"}
VALID_CATEGORIES = {"grammar", "vocabulary", "kanji"}
VALID_COUNTS = {5, 10, 15}
VALID_MODES = {"new", "review"}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/models", methods=["GET"])
def models():
    """Lists locally-available Ollama models, for the Settings page's model
    picker. Returns an empty list (not an error) if Ollama isn't reachable —
    the frontend shows an appropriate message either way."""
    available = list_available_models()
    return jsonify({
        "available_models": available,
        "default_model": DEFAULT_MODEL,
        "ollama_reachable": len(available) > 0,
    })


@app.route("/generate", methods=["POST"])
def generate():
    body = request.get_json(force=True, silent=True) or {}

    level = str(body.get("level", "")).upper()
    category = str(body.get("category", "")).lower()
    count = body.get("count", 5)
    mode = str(body.get("mode", "new")).lower()
    exclude_words = body.get("exclude_words") or []
    review_words = body.get("review_words") or []
    model = str(body.get("model") or DEFAULT_MODEL)

    # --- validation ---
    if level not in VALID_LEVELS:
        return jsonify({"error": f"Invalid level. Must be one of {sorted(VALID_LEVELS)}"}), 400
    if category not in VALID_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of {sorted(VALID_CATEGORIES)}"}), 400
    if count not in VALID_COUNTS:
        return jsonify({"error": f"Invalid count. Must be one of {sorted(VALID_COUNTS)}"}), 400
    if mode not in VALID_MODES:
        return jsonify({"error": f"Invalid mode. Must be one of {sorted(VALID_MODES)}"}), 400
    if mode == "review" and not review_words:
        return jsonify({"error": "mode='review' requires a non-empty review_words list"}), 400

    if category == "grammar":
        prompt = build_generation_prompt(level=level, category=category, count=count)
        try:
            questions = generate_questions(prompt=prompt, expected_count=count, model=model)
        except GenerationError as e:
            return jsonify({"error": str(e)}), 502

    else:
        # vocabulary / kanji: WE determine correct answers + distractors.
        try:
            if category == "vocabulary":
                if mode == "review":
                    items = build_vocab_items(level=level, review_words=review_words)
                else:
                    items = build_vocab_items(level=level, count=count, exclude_words=exclude_words)
            else:
                if mode == "review":
                    items = build_kanji_items(level=level, review_words=review_words)
                else:
                    items = build_kanji_items(level=level, count=count, exclude_words=exclude_words)
        except ValueError as e:
            return jsonify({"error": str(e)}), 502

        prompt = build_sentence_prompt(level=level, category=category, items=items)
        try:
            sentences_by_id = generate_sentences(prompt=prompt, model=model)
        except GenerationError as e:
            return jsonify({"error": str(e)}), 502

        questions = assemble_final_questions(items, sentences_by_id, level)

    return jsonify({
        "level": level,
        "category": category,
        "mode": mode,
        "model_used": model,
        "count": len(questions),
        "questions": questions,
    })


@app.route("/lookup", methods=["POST"])
def lookup():
    """
    Plain data lookup for the flashcard deck — no LLM call, no generation,
    just fetching verified reading/meaning for a list of already-known words
    straight from the reference DB. Used for reviewing past words as a
    swipeable deck, separate from the exam/quiz flow.
    """
    body = request.get_json(force=True, silent=True) or {}
    level = str(body.get("level", "")).upper()
    category = str(body.get("category", "")).lower()
    words = body.get("words") or []

    if level not in VALID_LEVELS:
        return jsonify({"error": f"Invalid level. Must be one of {sorted(VALID_LEVELS)}"}), 400
    if category not in {"vocabulary", "kanji"}:
        return jsonify({"error": "category must be 'vocabulary' or 'kanji'"}), 400
    if not words:
        return jsonify({"cards": []})

    if category == "vocabulary":
        entries = get_vocab_by_words(level, words)
        cards = [
            {"word": e["word"], "reading": e["reading"], "meaning": e["meaning"]}
            for e in entries
        ]
    else:
        entries = get_kanji_by_characters(level, words)
        cards = [
            {
                "word": e["character"],
                "reading": e["kun_readings"] or e["on_readings"],
                "meaning": e["meanings"],
            }
            for e in entries
        ]

    return jsonify({"cards": cards})


VALID_SCENARIO_LEVELS = {"N5", "N4", "N3"}  # N2/N1 parked, per roadmap


@app.route("/scenarios", methods=["GET"])
def scenarios():
    """Lightweight list of available conversation scenarios, optionally filtered by level."""
    level = request.args.get("level")
    return jsonify({"scenarios": list_scenario_summaries(level)})


@app.route("/scenarios/random", methods=["GET"])
def random_scenario():
    """
    Returns one full curated scenario at random, optionally filtered by
    ?level=N5|N4|N3 and ?model=<ollama model name>. The phrase choices/
    correctness/explanations are ALWAYS the fixed curated data — never
    touched by the LLM. We attempt to replace each step's NPC dialogue
    line with a fresh AI-generated one (pure flavor text, nothing graded)
    for variety; if Ollama is unreachable or the output looks broken, we
    silently keep the curated static line instead — same safety-net
    pattern used everywhere else.

    Each step also gets furigana-annotated segments (situation_segments)
    for the dialogue line, so the frontend can reveal readings for review
    after the person answers — same furigana engine used for quiz questions.
    """
    level = request.args.get("level")
    model = request.args.get("model") or DEFAULT_MODEL
    scenario = get_random_scenario(level)
    if scenario is None:
        return jsonify({"error": f"No scenarios available for level '{level}' yet"}), 404

    scenario = dict(scenario)  # shallow copy so we don't mutate the curated bank
    scenario["steps"] = [dict(step) for step in scenario["steps"]]
    scenario["ai_dialogue_used"] = False
    scenario["model_used"] = None

    try:
        prompt = build_scenario_npc_prompt(scenario["level"], scenario["npc_role"], scenario["steps"])
        lines_by_id = generate_sentences(prompt=prompt, model=model)
        if len(lines_by_id) == len(scenario["steps"]):
            for i, step in enumerate(scenario["steps"]):
                new_line = lines_by_id.get(i + 1, {}).get("sentence", "").strip()
                if new_line:
                    step["situation_jp"] = new_line
            scenario["ai_dialogue_used"] = True
            scenario["model_used"] = model
    except GenerationError:
        pass  # fall back to the curated static lines already in place

    # Furigana: no target word to exempt here (unlike quiz questions), so
    # the whole dialogue line gets annotated based on difficulty vs level.
    for step in scenario["steps"]:
        step["situation_segments"] = annotate_sentence(step["situation_jp"], scenario["level"], "")

    return jsonify(scenario)


@app.route("/scenarios/<scenario_id>", methods=["GET"])
def scenario_by_id(scenario_id):
    scenario = get_scenario_by_id(scenario_id)
    if scenario is None:
        return jsonify({"error": f"No scenario found with id '{scenario_id}'"}), 404
    return jsonify(scenario)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
