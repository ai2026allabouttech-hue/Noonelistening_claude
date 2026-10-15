# Iteration 3: OpenAI TTS (male/female, multilingual) + Echo chat language replies
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEVANAGARI = re.compile(r"[\u0900-\u097F]")


@pytest.fixture(scope="module")
def sid():
    r = requests.post(f"{API}/session", json={})
    assert r.status_code == 200
    s = r.json()["session_id"]
    yield s
    requests.delete(f"{API}/session/{s}")


# --- TTS: OpenAI primary ---
@pytest.mark.parametrize(
    "voice,text",
    [
        ("male", "I'm here with you."),
        ("female", "I hear you."),
        ("male", "मैं तुम्हारी बात सुन रहा हूँ।"),
        ("female", "Estoy aquí contigo."),
    ],
)
def test_speak_openai_mpeg(voice, text):
    r = requests.post(f"{API}/voice/speak", json={"text": text, "voice": voice, "mood": "sad"}, timeout=90)
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"].startswith("audio/mpeg"), r.headers["content-type"]
    assert len(r.content) > 2000
    # MP3 frames start with ID3 or 0xFFEx sync
    assert r.content[:3] == b"ID3" or r.content[0] == 0xFF


def test_male_and_female_differ():
    t = "Take your time."
    a = requests.post(f"{API}/voice/speak", json={"text": t, "voice": "male"}, timeout=90).content
    b = requests.post(f"{API}/voice/speak", json={"text": t, "voice": "female"}, timeout=90).content
    assert a != b


# --- Echo chat language ---
def test_chat_hindi_voice_mode(sid):
    r = requests.post(
        f"{API}/echo/chat",
        json={"session_id": sid, "message": "I feel very lonely today", "voice_mode": True, "language": "Hindi"},
        timeout=90,
    )
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["mood"] in {"angry", "sad", "anxious", "hopeful", "neutral"}
    assert DEVANAGARI.search(d["reply"]), d["reply"]


def test_chat_spanish_voice_mode(sid):
    r = requests.post(
        f"{API}/echo/chat",
        json={"session_id": sid, "message": "Work has been really stressful", "voice_mode": True, "language": "Spanish"},
        timeout=90,
    )
    assert r.status_code == 200, r.text[:200]
    reply = r.json()["reply"].lower()
    spanish_words = ["que", "estás", "es", "lo", "el", "la", "de", "te", "y", "no", "un", "mucho", "trabajo"]
    hits = sum(1 for w in re.findall(r"\w+", reply) if w in spanish_words)
    assert hits >= 2, reply


def test_chat_null_language_ok(sid):
    r = requests.post(f"{API}/echo/chat", json={"session_id": sid, "message": "hi", "language": None}, timeout=90)
    assert r.status_code == 200
    assert r.json()["reply"].strip()


def test_history_persisted(sid):
    r = requests.get(f"{API}/echo/history/{sid}")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert len(msgs) >= 6
    assert all("_id" not in m for m in msgs)
