# Contributing to PRACTICE 日本語

Thanks for considering contributing! This project is maintained by [@jbanayo](https://github.com/jbanayo), and all changes go through review before merging — see [How PRs get reviewed](#how-prs-get-reviewed) below.

## Before you start

Open an issue describing what you want to work on *before* writing a lot of code, especially for anything nontrivial. This avoids duplicate effort and lets us agree on approach first — particularly important for anything touching correctness-critical data (see below).

## The one rule that matters most

**The AI is never the source of truth for what's "correct."** This is the core design principle of the whole app, and it's easy to accidentally undo without realizing it.

- If you're touching `question_builder.py`, `reference_data.py`, or `scenario_data.py`: the correct answer, distractors, and any "this is more natural than that" judgment must come from verified data (JMdict/KANJIDIC2, or your own hand-checked phrases) — **never** from asking the LLM to decide. The LLM's only allowed job is writing surface text (an example sentence, a line of dialogue) around a fact we already know is true.
- If you're adding conversation scenarios (`scenario_data.py`): every phrase, reading, and translation must be something you're genuinely confident is correct, natural, textbook-level Japanese — not something that sounds plausible. A wrong scenario phrase teaches someone something socially wrong with false confidence, which is worse than not having that scenario at all.
- If you're touching prompt templates: read `services/prompt_templates.py` first. Several rules in there (no backslash-escaping, English-only explanations, no duplicated grammar particles) exist because we hit those exact bugs in production and had to add explicit guardrails. Don't remove a rule without understanding what it was protecting against.

If you're not sure whether something you're building falls into "needs verification" territory, ask in the issue first.

## Local setup

Follow the [README setup instructions](./README.md#-setup) to get both the backend and frontend running. There's no separate contributor-only setup — it's the same as running the app normally.

## Testing your changes

There's no automated test suite yet (a good first contribution, if you're interested!). In the meantime:

- **Backend changes**: test the specific function/endpoint you touched with a quick Python script or `curl` before opening a PR — show your testing in the PR description. If you added a new prompt or generation path, paste a few real example outputs so reviewers can sanity-check quality, the same way this project's own development history worked (lots of "generate a batch, inspect it, fix what's wrong" iteration).
- **Frontend changes**: run `npm run build` and confirm it completes with no errors. If your change affects a specific screen's logic (not just styling), a quick manual click-through is expected before requesting review.

## Code style

- Match the existing style in the file you're editing rather than introducing a new pattern — this codebase intentionally stays plain (no heavy frameworks, minimal dependencies) to keep it usable on low-spec hardware.
- Comments should explain *why*, not *what* — especially for anything related to the verified-data principle above. Future contributors need to understand the reasoning to avoid reintroducing old bugs.
- Keep PRs focused. A PR that fixes one bug or adds one feature is much easier to review than one that bundles several unrelated changes.

## How PRs get reviewed

This repo requires review before anything merges to `main`. Practically:
1. Fork the repo, make your change on a branch, open a PR.
2. Describe what you changed, why, and how you tested it.
3. A maintainer reviews for correctness, fit with the project's design principles, and quality — this can take a little time, since quality review is the whole point.
4. You may be asked for changes before merge. This isn't a rejection — it's the same bar the project holds its own code to.

## Reporting bugs / suggesting features

Open an issue. For bugs, include: what you did, what you expected, what actually happened, and (if relevant) the actual model output that looked wrong — real examples are much more useful than descriptions.

For feature ideas, check [`ROADMAP.md`](./ROADMAP.md) first — it may already be a known, planned direction with context on why it's not built yet.
