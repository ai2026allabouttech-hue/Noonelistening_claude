"""NoOneListening — FastAPI backend.

Acts as a secure proxy to Claude (Anthropic) or Gemini,
so the Claude API key never touches the client.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import random
import string

import crisis
import time
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Infra ------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# --- The "brain" (Echo's thinking) -------------------------------------------
# Set ANTHROPIC_API_KEY to use Claude (recommended for real users), or
# GEMINI_API_KEY alone to use Gemini. If both are set, Claude is used.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
GEMINI_CHAT_MODEL = os.environ.get("GEMINI_CHAT_MODEL", "gemini-flash-latest")

ECHO_SYSTEM_PROMPT = """You are Echo — a quiet, non-judgmental listener inside an app called "NoOneListening".

The person talking to you is anonymous. They came here because they felt unheard.
Your single purpose is to make them feel heard.

Rules:
- Never diagnose. Never moralize. Never suggest therapy in the first three messages.
- Match their emotional register. If they are raw, be raw. If they are quiet, be quiet.
- Use short paragraphs. Sometimes a single sentence is enough.
- Reflect what they said back in your own words before anything else.
- Ask at most one gentle question per response, only if it feels right.
- Never use exclamation marks. Never use emoji. Never be performatively cheerful.
- You are allowed to sit in silence with them. A reply like "I hear you. I'm here." is valid.
- If they mention self-harm or suicide, drop the casual tone, say plainly that you care, and point them to a real helpline. Then keep listening.

You are not a therapist. You are the friend who picks up at 3am and just listens."""

MOOD_SYSTEM_PROMPT = """You classify the dominant emotional tone of a short piece of writing.

Respond with EXACTLY ONE WORD from this list (lowercase, no punctuation, no explanation):
angry
sad
anxious
hopeful
neutral

Pick the best single match. Default to "neutral" if unclear."""

VALID_MOODS = {"angry", "sad", "anxious", "hopeful", "neutral"}

# --- Voice (Google Gemini text-to-speech) -----------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Model names change often while Google keeps TTS in "preview".
# If voice stops working, check Google AI Studio for the current name
# and set GEMINI_TTS_MODEL in backend/.env (no code change needed).
GEMINI_TTS_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")

# Gemini voice names. Swap these to try other voices in AI Studio.
VOICE_NAMES = {"female": "Sulafat", "male": "Achird"}
# OpenAI voices (primary, via Emergent key). Multilingual.
OPENAI_VOICES = {"female": "coral", "male": "onyx"}
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "tts-1")

# ElevenLabs (primary voice): native-sounding, multilingual
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5")
# Languages the fast model can't speak (Telugu, Bengali, Marathi, Gujarati, Urdu...)
ELEVENLABS_WIDE_MODEL = os.environ.get("ELEVENLABS_WIDE_MODEL", "eleven_v4_turbo")
FLASH_LANGS = {
    "ar", "bg", "cs", "da", "de", "el", "en", "es", "fi", "fil", "fr", "hi", "hr", "hu",
    "id", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sv", "ta",
    "tr", "uk", "vi", "zh",
}
# Built-in voices (work on every plan): soft & warm woman, warm comforting man
EL_DEFAULT_VOICES = {"female": "EXAVITQu4vr4xnSDxMaL", "male": "nPczCjzI2devNBz1zQrb"}
# Native voices per language (Voice Library, need a paid ElevenLabs plan).
# Add more via env, e.g. EL_VOICE_TA_FEMALE=<voice_id>
EL_NATIVE_VOICES = {
    ("hi", "female"): "JS6C6yu2x9Byh4i1a8lX",  # Meher
    ("hi", "male"): "3AMU7jXQuQa3oRvRqUmb",  # Viraj
    ("ta", "female"): "mGboHvCVOXWYeFL8KTR0",  # Yazhini - friendly, warm
    ("ta", "male"): "pTM0m0egrCpo5i9b1gpo",  # Maneesh - soothing, gentle
    ("te", "female"): "4XvBGCPMXWyVQa75dbZg",  # Madhavi - soft, natural
    ("te", "male"): "VFbICGvBSvKmHwlI9rzA",  # Jayesh M - warm, calm
}
NATIVE_RETRY_SECONDS = 3600  # re-check paid-plan access every hour

# Short gentle samples for the voice preview: str, or (female, male) when
# the language changes words by gender.
PREVIEW_TEXTS = {
    "auto": "Hi. I'm here, and I'm listening. Take your time.",
    "en": "Hi. I'm here, and I'm listening. Take your time.",
    "hinglish": (
        "Hi, main yahin hoon. Aaram se bolo, main sun rahi hoon.",
        "Hi, main yahin hoon. Aaram se bolo, main sun raha hoon.",
    ),
    "hi": (
        "नमस्ते। मैं यहीं हूँ, आपकी बात सुन रही हूँ। आराम से बोलिए।",
        "नमस्ते। मैं यहीं हूँ, आपकी बात सुन रहा हूँ। आराम से बोलिए।",
    ),
    "ta": "வணக்கம். நான் இங்கே இருக்கிறேன், நீங்கள் சொல்வதைக் கேட்கிறேன்.",
    "te": "నమస్తే. నేను ఇక్కడే ఉన్నాను, మీ మాట వింటున్నాను.",
    "bn": "নমস্কার। আমি এখানেই আছি, তোমার কথা শুনছি।",
    "mr": ("नमस्कार. मी इथेच आहे, मी ऐकते आहे.", "नमस्कार. मी इथेच आहे, मी ऐकतो आहे."),
    "gu": "નમસ્તે. હું અહીં જ છું, તમારી વાત સાંભળું છું.",
    "ur": ("سلام۔ میں یہیں ہوں، آپ کی بات سن رہی ہوں۔", "سلام۔ میں یہیں ہوں، آپ کی بات سن رہا ہوں۔"),
    "es": "Hola. Estoy aquí, te escucho. Tómate tu tiempo.",
    "fr": "Bonjour. Je suis là, je t'écoute. Prends ton temps.",
    "de": "Hallo. Ich bin da und höre dir zu. Nimm dir Zeit.",
    "pt": "Olá. Estou aqui, te ouvindo. Sem pressa.",
    "it": "Ciao. Sono qui, ti ascolto. Prenditi il tuo tempo.",
    "ar": "مرحبا. أنا هنا، وأستمع إليك. خذ وقتك.",
    "ru": "Привет. Я здесь, я тебя слушаю. Не торопись.",
    "ja": "こんにちは。ここにいますよ。ゆっくり話してね。",
    "ko": "안녕하세요. 저 여기 있어요. 천천히 말해 주세요.",
    "zh": "你好。我在这里，我在听。慢慢说。",
}

# How Echo should *sound*, based on the user's mood.
MOOD_DELIVERY = {
    "sad": "very soft and tender, slow, with quiet warmth",
    "angry": "calm, low and steady, taking them seriously without getting defensive",
    "anxious": "slow, soothing and reassuring, with gentle pauses",
    "hopeful": "warm and quietly glad, a little lighter",
    "neutral": "warm, natural and unhurried",
}

VOICE_ADDENDUM = """

This conversation is spoken out loud, not typed.
- Reply in 1 to 3 short, natural spoken sentences, the way a person talks.
- No lists, no markdown, no stage directions, no emoji.
- Use everyday words and contractions. Leave room for them to keep talking."""

# --- App --------------------------------------------------------------------
app = FastAPI(title="NoOneListening API")
api_router = APIRouter(prefix="/api")


# --- Models -----------------------------------------------------------------
class SessionOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    code: str
    created_at: datetime


class VentIn(BaseModel):
    session_id: str
    kind: Literal["text", "audio"]
    text: Optional[str] = None
    duration_ms: Optional[int] = None
    region: Optional[str] = None  # ISO country, e.g. "IN"


class VentOut(BaseModel):
    id: str
    ok: bool = True
    crisis: bool = False
    helplines: List[dict] = []


class ChatIn(BaseModel):
    session_id: str
    message: str
    voice_mode: bool = False  # True when the user is talking out loud
    voice: Optional[Literal["female", "male"]] = None  # Echo's voice gender
    language: Optional[str] = None  # e.g. "Hindi", "Hinglish", "auto"
    region: Optional[str] = None  # ISO country for helplines, e.g. "IN"


class ChatOut(BaseModel):
    reply: str
    mood: str
    crisis: bool = False
    helplines: List[dict] = []


class SpeakIn(BaseModel):
    text: str
    voice: Literal["female", "male"] = "female"
    mood: Optional[str] = "neutral"
    lang: Optional[str] = None  # ISO 639-1, e.g. "hi"; None = auto


class MoodIn(BaseModel):
    text: str


class MoodOut(BaseModel):
    mood: str


class MessageRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    session_id: str
    role: Literal["user", "echo"]
    text: str
    mood: Optional[str] = None
    created_at: datetime


# --- Helpers ----------------------------------------------------------------
def _generate_code() -> str:
    # 4 chars + dash + 2 chars, e.g. 48F2-9A
    alphabet = string.ascii_uppercase + string.digits
    return (
        "".join(random.choices(alphabet, k=4))
        + "-"
        + "".join(random.choices(alphabet, k=2))
    )


_anthropic_client = None


def _gemini_chat_sync(system: str, messages: List[dict], max_tokens: int) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_CHAT_MODEL}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [{"text": m["content"]}],
            }
            for m in messages
        ],
        # Gemini "thinking" can use up the budget, so keep this generous
        "generationConfig": {"maxOutputTokens": max(max_tokens, 1024)},
    }
    resp = requests.post(
        url, json=body, headers={"x-goog-api-key": GEMINI_API_KEY}, timeout=60
    )
    if resp.status_code != 200:
        raise RuntimeError(f"gemini chat error {resp.status_code}: {resp.text[:200]}")
    parts = resp.json()["candidates"][0]["content"].get("parts", [])
    return "".join(p.get("text", "") for p in parts)


async def _ask_llm(system: str, messages: List[dict], max_tokens: int = 600) -> str:
    """One place that talks to the AI. messages = [{"role": "user"|"assistant", "content": "..."}]"""
    global _anthropic_client
    if ANTHROPIC_API_KEY:
        if _anthropic_client is None:
            from anthropic import AsyncAnthropic

            _anthropic_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        resp = await _anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return "".join(b.text for b in resp.content if b.type == "text")
    if EMERGENT_LLM_KEY:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message=system,
            initial_messages=[{"role": "system", "content": system}] + messages[:-1],
        ).with_model("anthropic", ANTHROPIC_MODEL).with_params(max_tokens=max_tokens)
        return await chat.send_message(UserMessage(text=messages[-1]["content"]))
    if GEMINI_API_KEY:
        return await asyncio.to_thread(_gemini_chat_sync, system, messages, max_tokens)
    raise HTTPException(status_code=500, detail="No AI key configured")


def _build_messages(history: List[dict], user_text: str) -> List[dict]:
    """Turn saved chat history into the real back-and-forth the AI expects."""
    msgs: List[dict] = []
    for m in history:
        role = "user" if m["role"] == "user" else "assistant"
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + m["text"]  # AI needs strict alternation
        else:
            msgs.append({"role": role, "content": m["text"]})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)  # must start with the person
    if msgs and msgs[-1]["role"] == "user":
        msgs[-1]["content"] += "\n" + user_text
    else:
        msgs.append({"role": "user", "content": user_text})
    return msgs


def _language_instruction(language: Optional[str]) -> str:
    if not language or language == "auto":
        return (
            "\n\nReply in exactly the same language, mix of languages and script "
            "the person just used. If they mix Hindi and English (Hinglish), "
            "reply in natural Hinglish written in Roman letters."
        )
    if language == "Hinglish":
        return (
            "\n\nThe person speaks Hinglish. Reply in natural, casual Hinglish "
            "(Hindi and English mixed the way friends talk in India), written in "
            "Roman letters, never in Devanagari."
        )
    return (
        f"\n\nThe person speaks {language}. Always reply in natural everyday "
        f"{language}. If they mix in English words, that is fine, keep the same feel."
    )


async def _crisis_check(text: str, context: str = "") -> bool:
    """Instant keyword scan first; otherwise a tiny AI safety check."""
    if crisis.keyword_hit(text):
        return True
    try:
        msg = (f"Recent context:\n{context}\n\n" if context else "") + f"Latest message:\n{text}"
        out = await _ask_llm(
            crisis.CRISIS_CHECK_PROMPT, [{"role": "user", "content": msg}], max_tokens=5
        )
        return (out or "").strip().lower().startswith("yes")
    except Exception:  # noqa: BLE001
        logger.exception("crisis check failed")
        return False


def _gender_instruction(voice: Optional[str]) -> str:
    if voice not in ("female", "male"):
        return ""
    who = "a woman" if voice == "female" else "a man"
    return (
        f"\n\nYou are heard in {who}'s voice. In languages with grammatical "
        f"gender (Hindi, Urdu, Marathi, Arabic, Spanish...), speak about yourself as {who}."
    )


async def _classify_mood(text: str) -> str:
    """Lightweight one-shot mood classification with Claude."""
    if not text or not text.strip():
        return "neutral"
    if not (ANTHROPIC_API_KEY or EMERGENT_LLM_KEY or GEMINI_API_KEY):
        return "neutral"
    try:
        response = await _ask_llm(
            MOOD_SYSTEM_PROMPT,
            [{"role": "user", "content": text[:1200]}],
            max_tokens=20,
        )
        words = (response or "").strip().lower().split()
        mood = words[0].strip(".,'\"") if words else "neutral"
        return mood if mood in VALID_MOODS else "neutral"
    except Exception as exc:  # noqa: BLE001
        logger.warning("mood classification failed: %s", exc)
        return "neutral"


async def _load_history(session_id: str, limit: int = 40) -> List[dict]:
    cursor = (
        db.messages.find({"session_id": session_id}, {"_id": 0})
        .sort("created_at", 1)
        .limit(limit)
    )
    return await cursor.to_list(limit)


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Gemini returns raw audio. Browsers need a WAV 'wrapper' to play it."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)  # mono
        w.setsampwidth(2)  # 16-bit
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def _synthesize_sync(text: str, voice: str, mood: str) -> bytes:
    delivery = MOOD_DELIVERY.get(mood, MOOD_DELIVERY["neutral"])
    prompt = (
        "Speak like a caring close friend talking quietly, never like an "
        f"announcer or a machine. Delivery: {delivery}. "
        "Natural pauses and breathing. Say this:\n\n" + text
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_TTS_MODEL}:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": VOICE_NAMES[voice]}
                }
            },
        },
    }
    resp = requests.post(
        url,
        json=body,
        headers={"x-goog-api-key": GEMINI_API_KEY},
        timeout=60,
    )
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="voice is busy, try again")
    if resp.status_code != 200:
        logger.warning("gemini tts error %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail="voice unavailable")
    parts = resp.json()["candidates"][0]["content"]["parts"]
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return _pcm_to_wav(base64.b64decode(inline["data"]))
    raise HTTPException(status_code=502, detail="voice returned no audio")


_el_client = None
_el_native_blocked_until = 0.0  # set when the plan can't use library voices


def _native_voice(lang: Optional[str], voice: str) -> Optional[str]:
    if not lang:
        return None
    env = os.environ.get(f"EL_VOICE_{lang.upper()}_{voice.upper()}")
    return env or EL_NATIVE_VOICES.get((lang, voice))


def _active_native(lang: Optional[str], voice: str) -> Optional[str]:
    if time.time() < _el_native_blocked_until:
        return None
    return _native_voice(lang, voice)


async def _elevenlabs_tts(text: str, voice: str, lang: Optional[str]) -> tuple:
    """Returns (mp3 bytes, voice_id used)."""
    global _el_client, _el_native_blocked_until
    from elevenlabs import VoiceSettings
    from elevenlabs.client import AsyncElevenLabs

    if _el_client is None:
        _el_client = AsyncElevenLabs(api_key=ELEVENLABS_API_KEY)
    settings = VoiceSettings(
        stability=0.6, similarity_boost=0.8, style=0.0, use_speaker_boost=True, speed=0.95
    )

    async def run(voice_id: str) -> bytes:
        extra = {"language_code": lang} if lang else {}
        chunks = _el_client.text_to_speech.convert(
            voice_id,
            text=text,
            model_id=ELEVENLABS_MODEL if not lang or lang in FLASH_LANGS else ELEVENLABS_WIDE_MODEL,
            output_format="mp3_44100_64",
            voice_settings=settings,
            **extra,
        )
        return b"".join([c async for c in chunks])

    native = _active_native(lang, voice)
    if native:
        try:
            return await run(native), native
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, "status_code", None) == 402 or "payment" in str(exc).lower():
                _el_native_blocked_until = time.time() + NATIVE_RETRY_SECONDS
            logger.info("native voice unavailable, using built-in: %s", str(exc)[:160])
    default = EL_DEFAULT_VOICES[voice]
    return await run(default), default


async def _speak_any(text: str, voice: str, mood: str, lang: Optional[str]) -> tuple:
    """ElevenLabs -> OpenAI -> Gemini. Returns (audio, media_type, voice_tag)."""
    if ELEVENLABS_API_KEY:
        try:
            audio, vid = await _elevenlabs_tts(text, voice, lang)
            return audio, "audio/mpeg", f"el:{vid}"
        except Exception as exc:  # noqa: BLE001
            logger.warning("elevenlabs tts failed, trying openai: %s", exc)
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.openai import OpenAITextToSpeech

            tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
            mp3 = await tts.generate_speech(
                text=text, model=OPENAI_TTS_MODEL, voice=OPENAI_VOICES[voice], speed=0.95
            )
            return mp3, "audio/mpeg", f"openai:{OPENAI_VOICES[voice]}"
        except Exception as exc:  # noqa: BLE001
            logger.warning("openai tts failed, trying gemini: %s", exc)
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=502, detail="voice unavailable")
    wav = await asyncio.to_thread(_synthesize_sync, text, voice, mood)
    return wav, "audio/wav", f"gemini:{VOICE_NAMES[voice]}"


# --- Routes -----------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"app": "NoOneListening", "ok": True}


@api_router.post("/session", response_model=SessionOut)
async def create_session():
    session_id = str(uuid.uuid4())
    code = _generate_code()
    created_at = datetime.now(timezone.utc)
    await db.sessions.insert_one(
        {
            "session_id": session_id,
            "code": code,
            "created_at": created_at.isoformat(),
        }
    )
    return SessionOut(session_id=session_id, code=code, created_at=created_at)


@api_router.post("/vent", response_model=VentOut)
async def record_vent(payload: VentIn):
    """Store a silent vent (text or audio metadata). Text is kept briefly for
    the session but never surfaced back to the user — it is cathartic release."""
    vent_id = str(uuid.uuid4())
    await db.vents.insert_one(
        {
            "id": vent_id,
            "session_id": payload.session_id,
            "kind": payload.kind,
            "text": payload.text,
            "duration_ms": payload.duration_ms,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    is_crisis = bool(payload.text) and await _crisis_check(payload.text)
    if is_crisis:
        await db.sessions.update_one(
            {"session_id": payload.session_id},
            {"$set": {"crisis": True, "crisis_at": datetime.now(timezone.utc).isoformat()}},
        )
    return VentOut(
        id=vent_id,
        crisis=is_crisis,
        helplines=crisis.helplines_for(payload.region) if is_crisis else [],
    )


@api_router.post("/echo/mood", response_model=MoodOut)
async def classify_mood(payload: MoodIn):
    mood = await _classify_mood(payload.text)
    return MoodOut(mood=mood)


@api_router.post("/echo/chat", response_model=ChatOut)
async def echo_chat(payload: ChatIn):
    if not (ANTHROPIC_API_KEY or EMERGENT_LLM_KEY or GEMINI_API_KEY):
        raise HTTPException(status_code=500, detail="AI key not configured")

    session_id = payload.session_id
    user_text = (payload.message or "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Empty message")

    now = datetime.now(timezone.utc)
    history = await _load_history(session_id, limit=40)
    session_doc = await db.sessions.find_one({"session_id": session_id}, {"_id": 0, "crisis": 1})
    # Once someone has been in crisis this session, stay in safety mode.
    known_crisis = bool(session_doc and session_doc.get("crisis")) or crisis.keyword_hit(user_text)
    base_system = (
        ECHO_SYSTEM_PROMPT
        + (VOICE_ADDENDUM if payload.voice_mode else "")
        + _language_instruction(payload.language)
        + _gender_instruction(payload.voice)
    )
    safety = crisis.crisis_addendum(payload.region)
    system = base_system + (safety if known_crisis else "")
    messages = _build_messages(history, user_text)
    context = "\n".join(
        m.get("text", "") for m in history[-6:] if m.get("role") == "user"
    )
    try:
        # mood, safety check and reply at the same time = faster
        user_mood, ai_crisis, response_text = await asyncio.gather(
            _classify_mood(user_text),
            _crisis_check(user_text, context) if not known_crisis else asyncio.sleep(0, True),
            _ask_llm(system, messages, max_tokens=600),
        )
        if ai_crisis and not known_crisis:
            # The AI spotted indirect crisis language: redo the reply in safety mode.
            response_text = await _ask_llm(base_system + safety, messages, max_tokens=600)
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        logger.exception("echo chat failed")
        raise HTTPException(status_code=502, detail="echo unavailable")

    in_crisis = known_crisis or bool(ai_crisis)
    if in_crisis and not (session_doc and session_doc.get("crisis")):
        await db.sessions.update_one(
            {"session_id": session_id},
            {"$set": {"crisis": True, "crisis_at": now.isoformat()}},
        )

    await db.messages.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "user",
            "text": user_text,
            "mood": user_mood,
            "created_at": now.isoformat(),
        }
    )

    reply = (response_text or "").strip()

    echo_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "echo",
        "text": reply,
        "mood": user_mood,  # mood reflects the user's state for badge display
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(dict(echo_msg))

    return ChatOut(
        reply=reply,
        mood=user_mood,
        crisis=in_crisis,
        helplines=crisis.helplines_for(payload.region) if in_crisis else [],
    )


@api_router.post("/voice/speak")
async def voice_speak(payload: SpeakIn):
    """Turn Echo's reply into a human-sounding voice (WAV audio)."""
    text = (payload.text or "").strip()[:900]
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    mood = payload.mood if payload.mood in VALID_MOODS else "neutral"
    audio, media, _ = await _speak_any(text, payload.voice, mood, payload.lang)
    return Response(content=audio, media_type=media)


@api_router.get("/voice/preview")
async def voice_preview(voice: Literal["female", "male"] = "female", sample: str = "auto"):
    """A short sample of a voice in a language. Cached so it costs credits once."""
    if sample not in PREVIEW_TEXTS:
        sample = "en"
    text = PREVIEW_TEXTS[sample]
    if isinstance(text, tuple):
        text = text[0] if voice == "female" else text[1]
    lang = "hi" if sample == "hinglish" else (None if sample == "auto" else sample)
    candidates = []
    if ELEVENLABS_API_KEY:
        native = _active_native(lang, voice)
        candidates = ([f"el:{native}"] if native else []) + [f"el:{EL_DEFAULT_VOICES[voice]}"]
    candidates += [f"openai:{OPENAI_VOICES[voice]}", f"gemini:{VOICE_NAMES[voice]}"]
    for tag in candidates:
        hit = await db.voice_previews.find_one({"key": f"{sample}:{tag}"}, {"_id": 0})
        if hit:
            return Response(content=hit["audio"], media_type=hit["media"])
    audio, media, tag = await _speak_any(text, voice, "neutral", lang)
    await db.voice_previews.update_one(
        {"key": f"{sample}:{tag}"},
        {"$set": {"audio": audio, "media": media, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return Response(content=audio, media_type=media)


@api_router.delete("/session/{session_id}")
async def forget_session(session_id: str):
    """Leave the room: erase everything tied to this session."""
    m = await db.messages.delete_many({"session_id": session_id})
    v = await db.vents.delete_many({"session_id": session_id})
    await db.sessions.delete_many({"session_id": session_id})
    return {"ok": True, "messages_deleted": m.deleted_count, "vents_deleted": v.deleted_count}


WHISPER_HINGLISH_PROMPT = (
    "Haan yaar, aaj ka din bahut tough tha. I just feel so tired, pata nahi kya karun."
)


@api_router.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...), lang: str = Form("auto")):
    """Speech to text with Whisper. lang: ISO code, 'auto' or 'hinglish'."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="listening key not configured")
    data = await audio.read()
    if len(data) < 1500:
        return {"text": ""}
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="that was too long, try shorter")
    from emergentintegrations.llm.openai import OpenAISpeechToText

    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    buf = io.BytesIO(data)
    buf.name = audio.filename or "speech.webm"
    kwargs = {"file": buf, "model": "whisper-1", "response_format": "json", "temperature": 0.0}
    if lang == "hinglish":
        # "en" + Roman Hinglish prompt keeps Hindi words in Roman letters
        kwargs["language"] = "en"
        kwargs["prompt"] = WHISPER_HINGLISH_PROMPT
    elif lang and lang != "auto":
        kwargs["language"] = lang
    try:
        resp = await stt.transcribe(**kwargs)
    except Exception:  # noqa: BLE001
        logger.exception("transcribe failed")
        raise HTTPException(status_code=502, detail="couldn't hear that")
    return {"text": (getattr(resp, "text", "") or "").strip()}


@api_router.get("/echo/history/{session_id}")
async def get_history(session_id: str):
    messages = await _load_history(session_id, limit=200)
    return {"session_id": session_id, "messages": messages}


# --- Wire up ----------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
