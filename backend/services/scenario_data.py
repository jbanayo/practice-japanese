"""
Curated daily-conversation scenarios for choice-based practice.

Design principle (Path A, per conversation with the user): unlike the
LLM-generation pipeline elsewhere in this app, scenario content here is
NOT generated or judged by the LLM. Every phrase, translation, and "which
choice is more natural" judgment is hand-verified by us. This sidesteps the
exact failure mode that made the grammar category unreliable — an LLM
confidently marking a wrong answer as "correct" with nothing to check it
against. "Random scenario generation" means randomly SELECTING from this
curated bank, not LLM-authoring new content.

Each scenario is a short LINEAR sequence of decision points (not a full
branching tree — keeps the curation effort bounded while still testing
phrase-choice judgment at each step). Whichever option the person picks,
the scenario continues to the same next step; we just track how many
"more natural" choices they made for an end-of-scenario summary.

Extending this file: add a new dict to SCENARIOS following the same shape.
Keep phrases to common, textbook-verified daily Japanese (Genki/Minna no
Nihongo register) — this is exactly the kind of content where an unverified
guess could teach someone something socially wrong, so only add phrases
you're actually confident about.
"""

SCENARIOS = [
    {
        "id": "restaurant_order",
        "title": "Ordering at a Restaurant",
        "title_jp": "レストランで注文する",
        "level": "N5",
        "steps": [
            {
                "situation": "A staff member greets you at the entrance of a restaurant.",
                "situation_jp": "店員さんが入り口で挨拶しています。",
                "choice_a": {"phrase": "二人です。", "reading": "ふたりです。", "translation": "Two people."},
                "choice_b": {"phrase": "すみません、二人なんですが。", "reading": "すみません、ふたりなんですが。", "translation": "Excuse me, it's for two people."},
                "better_choice": "b",
                "explanation": "Both communicate the same information, but 「すみません」softens the request and 「〜なんですが」is the natural, polite way Japanese speakers phrase this to staff — 「二人です」alone can sound abrupt.",
            },
            {
                "situation": "The waiter brings menus and asks if you're ready to order.",
                "situation_jp": "店員さんがメニューを持ってきて、注文を聞きます。",
                "choice_a": {"phrase": "これください。", "reading": "これください。", "translation": "This one, please."},
                "choice_b": {"phrase": "これ、お願いします。", "reading": "これ、おねがいします。", "translation": "This one, please."},
                "better_choice": "b",
                "explanation": "Both are correct and commonly used — 「お願いします」is slightly more polite and versatile than 「ください」, and is the safer default in service settings.",
            },
            {
                "situation": "You've finished eating and want the bill.",
                "situation_jp": "食べ終わって、会計をお願いしたいです。",
                "choice_a": {"phrase": "お会計、お願いします。", "reading": "おかいけい、おねがいします。", "translation": "Check, please."},
                "choice_b": {"phrase": "払います。", "reading": "はらいます。", "translation": "I will pay."},
                "better_choice": "a",
                "explanation": "「お会計お願いします」is the standard, natural phrase used to ask for the bill. 「払います」just states an intention to pay and isn't how you'd actually request the check.",
            },
        ],
    },
    {
        "id": "asking_directions",
        "title": "Asking for Directions",
        "title_jp": "道を尋ねる",
        "level": "N5",
        "steps": [
            {
                "situation": "You want to ask a stranger on the street for help.",
                "situation_jp": "道で知らない人に声をかけたいです。",
                "choice_a": {"phrase": "ちょっと聞きたいんだけど。", "reading": "ちょっときたいんだけど。", "translation": "Hey, I want to ask something."},
                "choice_b": {"phrase": "すみません、ちょっとよろしいですか。", "reading": "すみません、ちょっとよろしいですか。", "translation": "Excuse me, do you have a moment?"},
                "better_choice": "b",
                "explanation": "「すみません」+ 「よろしいですか」is the standard polite way to approach a stranger. The casual 「〜だけど」form is fine between friends but too informal for someone you don't know.",
            },
            {
                "situation": "You want to ask where the station is.",
                "situation_jp": "駅がどこにあるか聞きたいです。",
                "choice_a": {"phrase": "駅はどこですか。", "reading": "えきはどこですか。", "translation": "Where is the station?"},
                "choice_b": {"phrase": "駅ってどこ？", "reading": "えきってどこ？", "translation": "Where's the station?"},
                "better_choice": "a",
                "explanation": "「〜はどこですか」is the neutral polite form appropriate for a stranger. 「〜って」is casual, spoken shorthand you'd use with close friends, not when asking a stranger for help.",
            },
            {
                "situation": "The person finishes explaining the directions.",
                "situation_jp": "相手が道を説明し終わりました。",
                "choice_a": {"phrase": "ありがとうございます。", "reading": "ありがとうございます。", "translation": "Thank you very much."},
                "choice_b": {"phrase": "OK、サンキュー。", "reading": "オーケー、サンキュー。", "translation": "OK, thanks."},
                "better_choice": "a",
                "explanation": "「ありがとうございます」is the natural, respectful way to thank someone who just helped you. Mixing in casual English loanwords like this reads as flippant in a polite exchange.",
            },
        ],
    },
    {
        "id": "convenience_store",
        "title": "Convenience Store Checkout",
        "title_jp": "コンビニでの会計",
        "level": "N5",
        "steps": [
            {
                "situation": "The cashier asks if you'd like a bag for your items.",
                "situation_jp": "店員さんが袋が必要か聞いています。",
                "choice_a": {"phrase": "袋、いらないです。", "reading": "ふくろ、いらないです。", "translation": "I don't need a bag."},
                "choice_b": {"phrase": "袋は大丈夫です。", "reading": "ふくろはだいじょうぶです。", "translation": "I'm fine without a bag."},
                "better_choice": "b",
                "explanation": "Both decline the bag, but 「大丈夫です」is the softer, more natural way Japanese speakers decline something in a shop. 「いらないです」is understood but sounds a bit blunt.",
            },
            {
                "situation": "The cashier asks if you have a point card.",
                "situation_jp": "店員さんがポイントカードを持っているか聞いています。",
                "choice_a": {"phrase": "持ってないです。", "reading": "もってないです。", "translation": "I don't have one."},
                "choice_b": {"phrase": "ないです。", "reading": "ないです。", "translation": "I don't have one."},
                "better_choice": "a",
                "explanation": "「持ってないです」directly and naturally answers the question about possessing a card. Plain 「ないです」is grammatically fine but slightly less precise/natural in this specific exchange.",
            },
            {
                "situation": "The cashier tells you the total price.",
                "situation_jp": "店員さんが合計金額を伝えました。",
                "choice_a": {"phrase": "はい、これで。", "reading": "はい、これで。", "translation": "Here, with this."},
                "choice_b": {"phrase": "お願いします。", "reading": "おねがいします。", "translation": "Here you go / please."},
                "better_choice": "b",
                "explanation": "「お願いします」is the standard, natural thing to say while handing over payment. 「これで」is understandable but sounds slightly stiff/unnatural as a stand-alone phrase here.",
            },
        ],
    },
    {
        "id": "first_meeting",
        "title": "Meeting Someone for the First Time",
        "title_jp": "初めて会う人と",
        "level": "N4",
        "steps": [
            {
                "situation": "You're introduced to a colleague's boss for the first time.",
                "situation_jp": "同僚の上司に初めて紹介されました。",
                "choice_a": {"phrase": "初めまして。よろしくお願いします。", "reading": "はじめまして。よろしくおねがいします。", "translation": "Nice to meet you. I look forward to working with you."},
                "choice_b": {"phrase": "初めまして。よろしくね。", "reading": "はじめまして。よろしくね。", "translation": "Nice to meet you. Take care of me, 'kay."},
                "better_choice": "a",
                "explanation": "「よろしくお願いします」is the appropriately formal closing for meeting someone senior for the first time. The casual 「〜ね」ending is for peers/friends, not a superior you've just met.",
            },
            {
                "situation": "They ask what you do for work.",
                "situation_jp": "相手が仕事について尋ねています。",
                "choice_a": {"phrase": "エンジニアをやってます。", "reading": "エンジニアをやってます。", "translation": "I'm doing engineering work."},
                "choice_b": {"phrase": "エンジニアです。", "reading": "エンジニアです。", "translation": "I'm an engineer."},
                "better_choice": "b",
                "explanation": "Both are acceptable, but 「エンジニアです」is the cleaner, more standard way to state your occupation to someone you've just met. 「〜をやってます」is a bit more casual/conversational in tone.",
            },
            {
                "situation": "The conversation is wrapping up and you're about to part ways.",
                "situation_jp": "会話が終わり、別れる場面です。",
                "choice_a": {"phrase": "では、また。", "reading": "では、また。", "translation": "Well then, see you again."},
                "choice_b": {"phrase": "じゃあね。", "reading": "じゃあね。", "translation": "See ya."},
                "better_choice": "a",
                "explanation": "「では、また」is a polite, neutral way to end a conversation with someone you've just met, especially a superior. 「じゃあね」is casual, used between close friends.",
            },
        ],
    },
]


def get_random_scenario() -> dict:
    """Randomly selects one full scenario from the curated bank."""
    import random
    return random.choice(SCENARIOS)


def get_scenario_by_id(scenario_id: str) -> dict | None:
    return next((s for s in SCENARIOS if s["id"] == scenario_id), None)


def list_scenario_summaries() -> list[dict]:
    """Lightweight list (id/title/level only) — e.g. for a 'pick a scenario' UI."""
    return [
        {"id": s["id"], "title": s["title"], "title_jp": s["title_jp"], "level": s["level"]}
        for s in SCENARIOS
    ]
