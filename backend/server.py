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
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
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
- If they mention self-harm or suicide, gently and without alarm, share: "If you are in danger right now, please call a local crisis line — you deserve a real human voice." Then keep listening.

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


class VentOut(BaseModel):
    id: str
    ok: bool = True


class ChatIn(BaseModel):
    session_id: str
    message: str
    voice_mode: bool = False  # True when the user is talking out loud


class ChatOut(BaseModel):
    reply: str
    mood: str


class SpeakIn(BaseModel):
    text: str
    voice: Literal["female", "male"] = "female"
    mood: Optional[str] = "neutral"


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
    return VentOut(id=vent_id)


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
    user_mood = await _classify_mood(user_text)

    # Persist user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "user",
        "text": user_text,
        "mood": user_mood,
        "created_at": now.isoformat(),
    }
    await db.messages.insert_one(dict(user_msg))

    # Load earlier turns from the database so Echo remembers the conversation
    history = await _load_history(session_id, limit=40)
    # Drop the just-saved message; it is added fresh below.
    history = [m for m in history if m["id"] != user_msg["id"]]

    try:
        response_text = await _ask_llm(
            ECHO_SYSTEM_PROMPT + (VOICE_ADDENDUM if payload.voice_mode else ""),
            _build_messages(history, user_text),
            max_tokens=600,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("echo chat failed")
        raise HTTPException(status_code=502, detail="echo unavailable")

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

    return ChatOut(reply=reply, mood=user_mood)


@api_router.post("/voice/speak")
async def voice_speak(payload: SpeakIn):
    """Turn Echo's reply into a human-sounding voice (WAV audio)."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="voice key not configured")
    text = (payload.text or "").strip()[:900]
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    mood = payload.mood if payload.mood in VALID_MOODS else "neutral"
    # requests is blocking, so run it off the main loop
    wav = await asyncio.to_thread(_synthesize_sync, text, payload.voice, mood)
    return Response(content=wav, media_type="audio/wav")


@api_router.delete("/session/{session_id}")
async def forget_session(session_id: str):
    """Leave the room: erase everything tied to this session."""
    m = await db.messages.delete_many({"session_id": session_id})
    v = await db.vents.delete_many({"session_id": session_id})
    await db.sessions.delete_many({"session_id": session_id})
    return {"ok": True, "messages_deleted": m.deleted_count, "vents_deleted": v.deleted_count}


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
