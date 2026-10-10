# PRACTICE 日本語 🎌

context: I developed this app while studying for N4. I failed the exam tho, but this app is (foundation wise) good. With more AI developments, this app performs better. Check it out! 

**A local-first Japanese language practice app powered by your own PC.**

No cloud APIs, no accounts, no subscription — a local LLM (via [Ollama](https://ollama.com)) generates fresh, never-repeating practice questions and conversation scenarios, verified against real dictionary data so the AI never has to grade its own homework.

This is **v1.0** — the first version being released publicly. It's a personal project that grew a lot during development, and it's now open for others to run, learn from, and contribute to.

---

## ✨ Features

- **Adaptive Mastery Quiz** (Vocabulary & Kanji, N5–N1) — an Anki-style loop: answer one question at a time, wrong answers get requeued with reshuffled options, repeat until you hit 100% on the batch.
- **Verified, not hallucinated** — for Vocabulary and Kanji, the correct answer and multiple-choice distractors are computed from a real, verified reference dataset (JMdict / KANJIDIC2), never decided by the AI. The LLM's only job is writing a natural example sentence around a word we already know the answer to. This is the core design principle of the whole app — see [Architecture](#-architecture) below.
- **Furigana assist** — words harder than your current level get automatic reading help; your target word and everything at-or-below your level stays unassisted, so you're actually reading Japanese, not being handed the answer.
- **Smart distractors** — wrong answers share the same real part-of-speech as the correct one (verb options only mix with other verbs, particles with particles, etc.), so you can't eliminate answers just by "shape."
- **Generate New vs. Review Past** — Review pulls your weakest/oldest words and writes fresh sentences for them (real spaced repetition, not identical replays).
- **Conversation Practice** — choice-based daily-life scenarios (ordering food, asking directions, phone calls) with hand-verified phrase pairs; the AI only varies the NPC's dialogue wording, never which choice is "more natural." Conversations save locally so you can replay them later for free (zero extra AI calls).
- **Flashcard deck** — swipe/browse through everything you've already learned, no AI call at all.
- **Stats dashboard** — words learned per level, streak tracking, and optional AI-quality ratings (✓ Good / ~ Off / ✗ Broken / ★ Gem) broken down by which model generated them.
- **Runs on modest hardware** — the LLM does a short burst of work per session, then idles. Built and tested on a low-spec laptop, not a gaming rig.
- **100% local & private** — your practice history, mastery stats, and conversation transcripts never leave your machine (IndexedDB in the browser + SQLite on the backend).

---

## 🏗 Architecture

```
frontend/   React (Vite) — all UI, IndexedDB for local progress/history
backend/    Flask — bridges the frontend to Ollama, owns the reference DB
```

The one idea worth understanding before you dig into the code: **the LLM is never the source of truth for what's "correct."** Early in development, letting the model both write a question *and* decide the right answer produced confidently wrong output (bad grammar, mismarked correct answers) with nothing to catch it. The fix was to always ground correctness in real data:

- **Vocabulary/Kanji** — correct answers and distractors come from a local SQLite database built from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) and [KANJIDIC2](https://www.edrdg.org/kanjidic/kanjidic2.html) (via the [jlpt-word-list](https://github.com/elzup/jlpt-word-list), [kanji-data](https://github.com/davidluzgouveia/kanji-data), and [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) projects). The AI only writes the example sentence around a word we've already verified.
- **Conversation scenarios** — every phrase pair, correctness judgment, and explanation is hand-curated (see `backend/services/scenario_data.py`). The AI only varies the NPC's line of dialogue, with a graceful fallback to the static curated line if Ollama is unreachable.
- **Grammar** — currently the one exception: fully AI-generated with no verification step, and it shows — it's disabled in the UI ("coming soon") pending a proper fix. See [Known Limitations](#-known-limitations--roadmap).

---

## 🛠 Prerequisites

- **[Ollama](https://ollama.com)** installed and running
- **Python 3.10+**
- **Node.js 18+** and npm
- **git**

Pull a model once Ollama is installed:
```bash
ollama pull qwen2.5:7b-instruct
```
This was the model used during development. Larger/smaller models should work too — you can pick from any locally-pulled model in the app's Settings page once it's running.

---

## 🚀 Setup

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/practice-nihongo.git
cd practice-nihongo
```

### 2. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Build the local reference database (one-time — downloads and processes open dictionary data, ~15MB total, takes a minute or two):
```bash
python scripts/build_reference_db.py
```

Start the backend:
```bash
python app.py
```
Runs on `http://localhost:5000`. Leave this running in its own terminal.

### 3. Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`).

Make sure Ollama (`ollama serve`) and the backend are both running before you generate anything.

---

## ⚙️ Configuration

Everything is configured from within the app itself — no `.env` files to edit:

- **Settings** page: pick which locally-pulled Ollama model to use, switch color themes, adjust zoom/display scale, or clear all local data.
- Level, category, session size, and Generate New/Review Past are chosen fresh each session on the Setup screen.

---

## 📁 Project Structure

```
backend/
  app.py                    Flask routes
  services/
    ollama_client.py         Talks to Ollama, validates its JSON output
    question_builder.py      Computes correct answers/distractors from reference data
    reference_data.py        Queries against the local SQLite DB
    furigana.py               Annotates sentences with reading assistance
    scenario_data.py          Curated conversation scenario bank
    prompt_templates.py       All LLM prompts live here
  scripts/
    build_reference_db.py     One-time setup: builds the local reference DB
  data/
    reference.db               Generated by the script above (not in git)

frontend/
  src/
    App.jsx                   Top-level routing/state
    db.js                      IndexedDB wrapper (all local persistence)
    api.js                      Backend API client
    components/                 One file per screen/widget
```

---

## 🐛 Known Limitations & Roadmap

- **Grammar category** is built but disabled — it needs a real conjugation-rule engine to reach the same reliability as Vocab/Kanji, rather than trusting the LLM's grammar directly.
- **Conversation practice** currently only covers N5–N4–N3 with a handful of curated scenarios; N2/N1 and a larger scenario library are natural next additions (see `ROADMAP.md`).
- Multi-provider AI support (ChatGPT/Claude alongside Ollama) is a planned future direction — the backend already isolates "the LLM's only job is writing text" into single functions, so adding a provider should mean writing one new function, not a redesign.

Full details and reasoning in [`ROADMAP.md`](./ROADMAP.md).

---

## 🤝 Contributing

Contributions welcome! Good places to start:
- Anything in the Roadmap above, especially the Grammar rework or expanding the conversation scenario bank (see `backend/services/scenario_data.py` for the format — every phrase needs to be verified, real, natural Japanese, not invented).
- Bug reports and UX feedback are just as valuable as code.

Open an issue before starting significant work so effort isn't duplicated. When adding scenario/vocabulary content, please only add phrases you're genuinely confident are correct and natural — this app's whole design philosophy is "verified over convenient," and low-quality curated data is worse than no data.

---

## 📜 License & Attribution

This project depends on the following open datasets — attribution preserved per their licenses:
- **JMdict / KANJIDIC2** — [Electronic Dictionary Research and Development Group](https://www.edrdg.org/), CC BY-SA 4.0
- **[jlpt-word-list](https://github.com/elzup/jlpt-word-list)** — MIT License
- **[kanji-data](https://github.com/davidluzgouveia/kanji-data)** — MIT License
- **[jmdict-simplified](https://github.com/scriptin/jmdict-simplified)** — CC BY-SA 4.0

This project itself doesn't yet have a LICENSE file — add one before accepting external contributions or relying on others reusing it. MIT is a common, permissive choice for a project like this, but it's your call.
