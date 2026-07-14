"""
Builds prompts for the local Ollama model to generate JLPT-style questions.
Designed to force strict, parseable JSON output — no free text, no markdown fences.

v2 changes (based on real output review):
- Grammar points are now sampled from a curated per-level pool instead of
  letting the model invent freely — this fixes both repetition (model kept
  defaulting to the same "~と" pattern) and factual drift.
- Kanji questions are restricted to two reliable types (reading / meaning)
  instead of open-ended "recognition" questions, which produced nonsense
  (e.g. a "which kanji has two 人 stacked" question with no valid answer).
- Explicit rule against mixing English words into the Japanese sentence
  (model was inserting stray English like "annunciated" mid-sentence).
"""

# Curated grammar point pools per level. Not exhaustive — enough to force
# variety within a single batch. Extend these lists over time as you notice
# gaps or want more coverage.
GRAMMAR_POOLS = {
    "N5": [
        "〜たい (want to)", "〜ながら (while doing)", "〜てもいいです (permission)",
        "〜てはいけません (prohibition)", "〜ことができます (ability)",
        "〜前に / 〜後で (before/after)", "〜ましょう (let's)",
        "〜でしょう (probably)", "〜つもりです (intend to)", "〜とき (when)",
    ],
    "N4": [
        "〜と (natural consequence conditional)", "〜たら (conditional)",
        "〜ば (conditional)", "〜そうです (looks like / hearsay)",
        "〜てしまう (completion/regret)", "〜てみる (try doing)",
        "〜ようになる (change of state)", "〜すぎる (excessive)",
        "〜させる (causative)", "〜られる (passive)", "〜なければならない (must)",
        "〜のに (despite)",
    ],
    "N3": [
        "〜わけだ (it follows that)", "〜おかげで (thanks to)",
        "〜せいで (because of, negative)", "〜ば〜ほど (the more... the more...)",
        "〜つつ (while / although)", "〜あげく (as a result of, negative)",
        "〜ものの (although)", "〜次第 (as soon as / depending on)",
        "〜に違いない (must be)", "〜わりに (considering)",
    ],
    "N2": [
        "〜にもかかわらず (despite)", "〜を通じて (through/via)",
        "〜に伴い (accompanying)", "〜きらいがある (tendency to)",
        "〜べきだ (should)", "〜ことなく (without doing)",
        "〜に反して (contrary to)", "〜たとたん (the moment that)",
        "〜だけあって (precisely because)", "〜にしては (considering that)",
    ],
    "N1": [
        "〜べからず (must not, formal)", "〜が早いか (no sooner than)",
        "〜ずにはおかない (cannot help but)", "〜なくして (without)",
        "〜たりとも (not even)", "〜きらいがある (tendency toward)",
        "〜にたえない (cannot bear to)", "〜てやまない (never stop doing)",
        "〜をおいて (except for)", "〜ものを (if only... but)",
    ],
}

KANJI_QUESTION_TYPES = [
    "reading: show a kanji or kanji-compound word in a sentence, ask for its correct reading in hiragana",
    "meaning: show a kanji or kanji-compound word, ask for its correct English meaning",
]

def _vocab_guidance(vocab_entries: list[dict]) -> str:
    entries_str = "; ".join(
        f"{e['word']} ({e['reading']}) = {e['meaning']}" for e in vocab_entries
    )
    return (
        f"Test the following REAL, VERIFIED vocabulary words — use these exact "
        f"words, readings, and meanings, do not substitute your own: {entries_str}. "
        f"Create ONE question per word, using it in a natural sentence with a "
        f"blank, or asking for its correct reading/meaning. Use each word only once."
    )


def _kanji_guidance(kanji_entries: list[dict]) -> str:
    entries_str = "; ".join(
        f"{e['character']} (on: {e['on_readings']}, kun: {e['kun_readings']}, "
        f"meaning: {e['meanings']})"
        for e in kanji_entries
    )
    types_str = "; ".join(KANJI_QUESTION_TYPES)
    return (
        f"Test the following REAL, VERIFIED kanji — use these exact readings and "
        f"meanings, do not substitute your own: {entries_str}. "
        f"Each question must be ONLY one of these two types: {types_str}. "
        f"Create ONE question per kanji. Use each kanji only once."
    )


def _grammar_guidance(level: str, count: int) -> str:
    pool = GRAMMAR_POOLS.get(level.upper(), GRAMMAR_POOLS["N4"])
    pool_str = ", ".join(pool)
    return (
        f"Test grammar points chosen from this pool of real JLPT {level.upper()} "
        f"grammar patterns: {pool_str}. "
        f"You MUST select {count} DIFFERENT patterns from this pool (do not repeat "
        f"the same pattern twice in this batch, and do not invent patterns outside "
        f"this list). Each question presents a natural sentence with a blank; the "
        f"4 options are grammar forms that could fill it.\n\n"
        f"OPTION FORMAT — READ CAREFULLY: each option must be ONLY the exact word(s) "
        f"that get typed into the blank. Nothing else. No commas, no punctuation, no "
        f"blank markers (no underscores), no particles written separately.\n"
        f"Example of a fully correct question:\n"
        f'  sentence: "友達が来たら、一緒に映画に行きましょう。" with the target phrase '
        f'blanked out as: "友達が______、一緒に映画に行きましょう。"\n'
        f'  options: ["来たら", "来れば", "来ても", "来るので"]\n'
        f"  correct_option: 0\n"
        f"Notice each option is a single clean word — the particle (たら/れば/ても/ので) "
        f"is INSIDE the option text, and does NOT also appear separately in the sentence. "
        f"The sentence contains the blank and nothing else related to the answer."
    )


SENTENCE_JSON_SCHEMA_EXAMPLE = """{
  "items": [
    {
      "id": 1,
      "sentence": "A natural JLPT-level example sentence in Japanese, using the given word/kanji in its EXACT base form (do not conjugate it, do not add okurigana endings). Written entirely in Japanese script.",
      "explanation": "One short sentence in English explaining how the word is used in this sentence. English only."
    }
  ]
}"""


def build_sentence_prompt(level: str, category: str, items: list[dict]) -> str:
    """
    Builds a prompt asking the model ONLY to write natural example sentences
    for a pre-selected list of real words/kanji. The model does NOT choose
    correct answers, options, or distractors — those are computed by
    question_builder.py from verified reference data. This prevents the
    model from marking a real-but-contextually-wrong answer as correct.
    """
    category = category.lower()

    lines = []
    for item in items:
        target = item.get("word") or item.get("character")
        lines.append(
            f"id {item['id']}: word/kanji = {target}, reading = {item['reading']}, "
            f"meaning = {item['meaning']}"
        )
    items_str = "\n".join(lines)

    prompt = f"""You are writing example sentences for a JLPT {level.upper()} {category.upper()} exam. For each of the following {len(items)} words/kanji, write ONE natural, level-appropriate example sentence that uses it correctly. Use the word in its EXACT base form as given — do not conjugate verbs, do not add okurigana, do not change the reading in any way.

Words/kanji to use:
{items_str}

Rules:
- One sentence per id, using that exact word/kanji unconjugated.
- Sentences must be written ENTIRELY in Japanese script (hiragana/katakana/kanji). Never insert English words into a Japanese sentence.
- Do NOT use backslashes or any escape characters in the sentence. Do NOT include blanks or underscores — write the complete sentence with the word included.
- Explanations must be written ONLY in English. Never use Chinese or any other language.
- Difficulty must match JLPT {level.upper()} level.
- Return ONLY valid JSON. No markdown code fences, no preamble, no commentary.

Respond in exactly this JSON structure:
{SENTENCE_JSON_SCHEMA_EXAMPLE}

Generate the {len(items)} sentences now."""

    return prompt


JSON_SCHEMA_EXAMPLE = """{
  "questions": [
    {
      "id": 1,
      "prompt": "The question text shown to the user, written ENTIRELY in Japanese script (hiragana/katakana/kanji) with a ______ blank if applicable. Do not mix in any English words.",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_option": 0,
      "explanation": "Short explanation of why the correct answer is correct, in English",
      "topic": "Short tag for the specific grammar point / word / kanji being tested"
    }
  ]
}"""


def build_generation_prompt(level: str, category: str, count: int,
                             vocab_entries: list[dict] = None,
                             kanji_entries: list[dict] = None) -> str:
    """
    level: one of N5, N4, N3, N2, N1
    category: one of grammar, vocabulary, kanji
    count: number of questions to generate in this batch
    vocab_entries: required for category="vocabulary" — real entries from reference_data.get_random_vocab()
    kanji_entries: required for category="kanji" — real entries from reference_data.get_random_kanji()
    """
    category = category.lower()

    if category == "grammar":
        guidance = _grammar_guidance(level, count)
    elif category == "kanji":
        if not kanji_entries:
            raise ValueError("kanji_entries required for category='kanji'")
        guidance = _kanji_guidance(kanji_entries)
    else:
        if not vocab_entries:
            raise ValueError("vocab_entries required for category='vocabulary'")
        guidance = _vocab_guidance(vocab_entries)

    prompt = f"""You are a JLPT exam question generator. Generate exactly {count} unique multiple-choice questions for JLPT level {level.upper()}, category: {category.upper()}.

{guidance}

Rules:
- Each question must have exactly 4 options.
- correct_option is the ZERO-BASED INDEX (0, 1, 2, or 3) of the correct answer in the options array.
- The Japanese sentence/prompt text must be written ENTIRELY in Japanese script. NEVER insert English words into the middle of a Japanese sentence.
- Do NOT use backslashes or any escape characters. Write blanks as exactly six underscores (______) with no backslash before or between them.
- Explanations must be written ONLY in English. Never use Chinese, Korean, or any language other than English in the explanation field.
- Keep explanations concise (1-2 sentences).
- Difficulty must match JLPT {level.upper()} level specifically — not easier, not harder.
- Verify every fact (readings, meanings, grammar usage) is accurate before including it. Do not guess.
- Return ONLY valid JSON. No markdown code fences, no preamble, no commentary.

Respond in exactly this JSON structure:
{JSON_SCHEMA_EXAMPLE}

Generate the {count} questions now."""

    return prompt


def build_scenario_npc_prompt(level: str, npc_role: str, steps: list[dict]) -> str:
    """
    Asks the model to write fresh dialogue lines for a conversation
    scenario's NPC — flavor text only. This is safe to let the LLM handle
    because nothing here is graded: the phrase CHOICES, which one is more
    natural, and why are all fixed curated data (see scenario_data.py) that
    this prompt never touches. The model only varies what the NPC says to
    set up each step, given the fixed meaning that line must communicate.
    """
    items_str = "\n".join(
        f'id {i + 1}: must communicate (in English): "{step["situation"]}"'
        for i, step in enumerate(steps)
    )

    prompt = f"""You are writing spoken dialogue lines for a Japanese conversation practice app, JLPT {level.upper()} level. The speaker is: {npc_role}.

For each numbered item below, write ONE natural, conversational Japanese line this {npc_role} would say to communicate the given meaning. Match JLPT {level.upper()} vocabulary and grammar difficulty — not harder, not easier.

{items_str}

Rules:
- Write ONLY the spoken Japanese line for each id — natural spoken dialogue, not a formal written sentence.
- Written ENTIRELY in Japanese script. Never insert English words into the line.
- Do NOT use backslashes or any escape characters.
- Return ONLY valid JSON. No markdown code fences, no preamble, no commentary.

Respond in exactly this JSON structure:
{{
  "items": [
    {{"id": 1, "sentence": "the Japanese dialogue line", "explanation": "brief English recap of what was communicated"}}
  ]
}}

Generate the {len(steps)} lines now."""

    return prompt
