# Backend Setup (Step 1 of the project)

This is just the Ollama bridge — no frontend yet. Goal right now: confirm
Qwen2.5 reliably generates valid, well-formed JLPT questions before we build
any UI around it.

## Setup

```bash
cd japanese-exam-app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Make sure Ollama is running and the model is pulled:

```bash
ollama pull qwen2.5:7b-instruct
ollama serve   # if not already running as a service
```

## Run

```bash
python app.py
```

Should start on `http://localhost:5000`.

## Test it

Health check:
```bash
curl http://localhost:5000/health
```

Generate 5 N4 grammar questions:
```bash
curl -X POST http://localhost:5000/generate \
  -H "Content-Type: application/json" \
  -d '{"level": "N4", "category": "grammar", "count": 5}'
```

Try each category to compare quality:
```bash
curl -X POST http://localhost:5000/generate -H "Content-Type: application/json" -d '{"level": "N5", "category": "vocabulary", "count": 5}'
curl -X POST http://localhost:5000/generate -H "Content-Type: application/json" -d '{"level": "N3", "category": "kanji", "count": 5}'
```

## What to check when you test

1. **Speed** — time how long a 5-question batch takes. If it's uncomfortably
   slow, try switching `DEFAULT_MODEL` in `services/ollama_client.py` to
   `qwen2.5:3b-instruct` and compare.
2. **JSON validity** — the backend already validates structure and will
   return a 502 with an error message if the model messes up the format.
   If you see 502s often, that's a sign the prompt needs tightening (I can
   iterate on `prompt_templates.py` based on what you see).
3. **Question quality** — are the grammar points/vocab/kanji actually
   appropriate for the JLPT level? Read a few by eye. This is the thing
   most likely to need prompt tweaks once you see real output.
4. **Duplicate topics** — check the `"topic"` field across a batch to see
   if the model repeats itself despite being told not to.

## Report back

Once you've run a few test batches, let me know:
- Which model felt better (7b vs 3b), speed-wise
- Any 502 errors (paste the error message)
- Whether question quality looked right for the level

Then we move to Step 2: the frontend config panel + wiring it to this endpoint.
