"""Crisis detection + helplines. Two layers: instant keywords, then an AI check."""
import re
from typing import Optional

# Lowercased substrings / regexes across English, Hinglish and common languages.
_PATTERNS = [
    # English
    r"\bsuicid", r"\bkill(ing)? my ?self", r"\bend(ing)? my (own )?life", r"\bend it all\b",
    r"\b(want|wanna|going) to die\b", r"\bwanna die\b", r"\bwish i (was|were) dead\b",
    r"\bdon'?t want to (live|be alive|exist|wake up)", r"\bbetter off (dead|without me)\b",
    r"\bself[- ]?harm", r"\b(cut|cutting|hurt|hurting) my ?self\b", r"\boverdose\b",
    r"\btake my (own )?life\b", r"\bno reason to (live|go on)\b", r"\bhang my ?self\b",
    r"\bnot worth living\b", r"\bkill me\b",
    # Hinglish (Roman Hindi)
    r"\bmarna chaht[ai]\b", r"\bmar ja(a)?(na|un|aun|unga|ungi)\b", r"\bkhud ?kushi\b",
    r"\baatma ?hatya\b", r"\bsuicide kar", r"\bjeena nahi\b", r"\bjeene ka (mann|man) nahi\b",
    r"\bzindagi khatam\b", r"\bkhud ko khatam\b", r"\bapni jaan (le|de)",
    # Hindi / Marathi
    "आत्महत्या", "खुदकुशी", "ख़ुदकुशी", "मरना चाहता", "मरना चाहती", "मर जाना", "मर जाऊं",
    "जीना नहीं", "ज़िंदगी खत्म", "जिंदगी खत्म", "खुद को खत्म", "मरायचं", "जीव द्यायचा",
    # Tamil, Telugu, Bengali, Gujarati, Urdu
    "தற்கொலை", "சாக வேண்டும்", "சாகணும்", "ఆత్మహత్య", "చనిపోవాలని", "আত্মহত্যা",
    "মরে যেতে চাই", "આત્મહત્યા", "મરી જવું", "خودکشی", "مرنا چاہتا", "مرنا چاہتی",
    # Spanish, Portuguese, French, Italian, German
    r"\bmatarme\b", r"\bquiero morir", r"\bquitarme la vida", r"\bme matar\b", r"\bquero morrer",
    r"\bme tuer\b", r"\benvie de mourir", r"\buccidermi\b", r"\bvoglio morire",
    r"\bselbstmord", r"\bsuizid", r"\bmich umbringen", r"\bsterben will",
    # Arabic, Russian, Japanese, Korean, Chinese
    "انتحار", "أريد أن أموت", "суицид", "покончить с собой", "хочу умереть",
    "自殺", "死にたい", "자살", "죽고 싶", "自杀", "想死",
]
_RX = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def keyword_hit(text: str) -> bool:
    t = (text or "").lower()
    return any(rx.search(t) for rx in _RX)


CRISIS_CHECK_PROMPT = """You are a safety screener. Read the person's latest message (and the
recent context). Does it suggest they may be thinking about suicide, self-harm, ending their
life, or are in immediate danger? Count indirect phrasing ("everyone would be better off
without me", "I won't be a problem much longer", "I've given my things away"), in any language.
Ordinary sadness, stress, anger or venting is NOT a crisis.
Answer with exactly one word: yes or no."""


HELPLINES = {
    "IN": [
        {"name": "Tele-MANAS", "number": "14416", "tel": "14416",
         "note": "free · 24/7 · Govt. of India · 20+ Indian languages"},
        {"name": "Tele-MANAS (toll-free)", "number": "1-800-891-4416", "tel": "18008914416",
         "note": "same service, alternate number"},
        {"name": "Emergency", "number": "112", "tel": "112", "note": "if you are in danger right now"},
    ],
    "US": [
        {"name": "988 Suicide & Crisis Lifeline", "number": "988", "tel": "988",
         "note": "call or text · free · 24/7"},
        {"name": "Emergency", "number": "911", "tel": "911", "note": "if you are in danger right now"},
    ],
    "CA": [
        {"name": "9-8-8 Suicide Crisis Helpline", "number": "988", "tel": "988",
         "note": "call or text · free · 24/7"},
        {"name": "Emergency", "number": "911", "tel": "911", "note": "if you are in danger right now"},
    ],
    "GB": [
        {"name": "Samaritans", "number": "116 123", "tel": "116123", "note": "free · 24/7"},
        {"name": "Emergency", "number": "999", "tel": "999", "note": "if you are in danger right now"},
    ],
    "IE": [
        {"name": "Samaritans", "number": "116 123", "tel": "116123", "note": "free · 24/7"},
        {"name": "Emergency", "number": "112", "tel": "112", "note": "if you are in danger right now"},
    ],
    "AU": [
        {"name": "Lifeline", "number": "13 11 14", "tel": "131114", "note": "24/7"},
        {"name": "Emergency", "number": "000", "tel": "000", "note": "if you are in danger right now"},
    ],
    "NZ": [
        {"name": "Need to talk?", "number": "1737", "tel": "1737", "note": "call or text · free · 24/7"},
        {"name": "Emergency", "number": "111", "tel": "111", "note": "if you are in danger right now"},
    ],
}

INTERNATIONAL = {
    "name": "Find a helpline near you", "number": "findahelpline.com",
    "url": "https://findahelpline.com", "note": "free, confidential, worldwide",
}


def helplines_for(region: Optional[str]) -> list:
    lines = HELPLINES.get((region or "").upper())
    if lines:
        return lines
    return [INTERNATIONAL, {"name": "Emergency", "number": "your local emergency number",
                            "note": "if you are in danger right now"}]


def crisis_addendum(region: Optional[str]) -> str:
    lines = helplines_for(region)
    main = lines[0]
    emergency = next((h for h in lines if h["name"] == "Emergency"), None)
    em = f" If they are in immediate danger, tell them to call {emergency['number']}." if emergency else ""
    return f"""

SAFETY MODE (overrides every style rule above). This person may be thinking about suicide,
self-harm or be in danger. Drop the casual tone completely: no slang, no "yaar", no jokes, no
playful or poetic phrasing. Speak plainly, warmly and seriously, in the same language they use.
In 3 to 5 short sentences:
1. Say clearly that you care about them and that you are glad they told you.
2. Gently and directly ask whether they are safe right now.
3. Ask them to reach a real person now: {main['name']} at {main['number']} ({main['note']}).{em}
   Write the number in digits.
4. Say you are staying right here with them while they reach out.
Never minimise, never lecture, never diagnose, never describe methods."""
