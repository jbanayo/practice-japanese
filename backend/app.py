"""
Minimal Flask backend that bridges the frontend to the local Ollama instance.

Run with:
    python app.py

Test with:
    curl -X POST http://localhost:5000/generate \
      -H "Content-Type: application/json" \
      -d '{"level": "N4", "category": "grammar", "count": 5}'

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

from services.prompt_templates import build_generation_prompt, build_sentence_prompt
from services.ollama_client import generate_questions, generate_sentences, GenerationError
from services.question_builder import build_vocab_items, build_kanji_items, assemble_final_questions

app = Flask(__name__)
CORS(app)  # allow the frontend (different port during dev) to call this API

VALID_LEVELS = {"N5", "N4", "N3", "N2", "N1"}
VALID_CATEGORIES = {"grammar", "vocabulary", "kanji"}
VALID_COUNTS = {5, 10, 15}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/generate", methods=["POST"])
def generate():
    body = request.get_json(force=True, silent=True) or {}

    level = str(body.get("level", "")).upper()
    category = str(body.get("category", "")).lower()
    count = body.get("count", 5)

    # --- validation ---
    if level not in VALID_LEVELS:
        return jsonify({"error": f"Invalid level. Must be one of {sorted(VALID_LEVELS)}"}), 400
    if category not in VALID_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of {sorted(VALID_CATEGORIES)}"}), 400
    if count not in VALID_COUNTS:
        return jsonify({"error": f"Invalid count. Must be one of {sorted(VALID_COUNTS)}"}), 400

    if category == "grammar":
        prompt = build_generation_prompt(level=level, category=category, count=count)
        try:
            questions = generate_questions(prompt=prompt, expected_count=count)
        except GenerationError as e:
            return jsonify({"error": str(e)}), 502

    else:
        # vocabulary / kanji: WE determine correct answers + distractors.
        try:
            if category == "vocabulary":
                items = build_vocab_items(level=level, count=count)
            else:
                items = build_kanji_items(level=level, count=count)
        except ValueError as e:
            return jsonify({"error": str(e)}), 502

        prompt = build_sentence_prompt(level=level, category=category, items=items)
        try:
            sentences_by_id = generate_sentences(prompt=prompt)
        except GenerationError as e:
            return jsonify({"error": str(e)}), 502

        questions = assemble_final_questions(items, sentences_by_id)

    return jsonify({
        "level": level,
        "category": category,
        "count": len(questions),
        "questions": questions,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
