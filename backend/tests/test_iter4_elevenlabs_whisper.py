# Iteration 4: ElevenLabs TTS, Whisper transcription, Hinglish/auto language chat, regression
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
DEVANAGARI = re.compile(r"[\u0900-\u097F]")
TAMIL = re.compile(r"[\u0B80-\u0BFF]")

_cache = {}


@pytest.fixture(scope="module")
def sid():
    r = requests.post(f"{API}/session", json={})
    assert r.status_code == 200
    s = r.json()["session_id"]
    yield s
    requests.delete(f"{API}/session/{s}")


# --- TTS (ElevenLabs) -------------------------------------------------------
def test_speak_female_hi_fallback_mpeg():
    r = requests.post(f"{API}/voice/speak", json={"text": "Main yahan hoon, yaar.", "voice": "female", "mood": "sad", "lang": "hi"}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) > 2000
    _cache["hi_mp3"] = r.content


def test_speak_male_ta_mpeg():
    r = requests.post(f"{API}/voice/speak", json={"text": "நான் இங்கே இருக்கிறேன்.", "voice": "male", "mood": "neutral", "lang": "ta"}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) > 2000


def test_speak_english_null_lang():
    r = requests.post(f"{API}/voice/speak", json={"text": "I hear you today.", "voice": "female", "mood": "bogus", "lang": None}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    _cache["en_mp3"] = r.content


def test_speak_empty_400():
    r = requests.post(f"{API}/voice/speak", json={"text": "  ", "voice": "female"})
    assert r.status_code == 400


def test_speak_invalid_voice_422():
    r = requests.post(f"{API}/voice/speak", json={"text": "hi", "voice": "robot"})
    assert r.status_code == 422


# --- STT (Whisper) ------------------------------------------------------------
def test_transcribe_english_roundtrip():
    mp3 = _cache.get("en_mp3")
    if not mp3:
        pytest.skip("no tts audio")
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("speech.mp3", mp3, "audio/mpeg")}, data={"lang": "en"}, timeout=60)
    assert r.status_code == 200
    t = r.json()["text"].lower()
    print("EN transcript:", t)
    assert "hear" in t and "today" in t


def test_transcribe_hinglish_roundtrip():
    mp3 = _cache.get("hi_mp3")
    if not mp3:
        pytest.skip("no tts audio")
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("speech.mp3", mp3, "audio/mpeg")}, data={"lang": "hinglish"}, timeout=60)
    assert r.status_code == 200
    t = r.json()["text"]
    print("Hinglish transcript:", t)
    assert len(t) > 0


def test_transcribe_auto_roundtrip():
    mp3 = _cache.get("hi_mp3")
    if not mp3:
        pytest.skip("no tts audio")
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("speech.mp3", mp3, "audio/mpeg")}, data={"lang": "auto"}, timeout=60)
    assert r.status_code == 200
    print("auto transcript:", r.json()["text"])
    assert len(r.json()["text"]) > 0


def test_transcribe_tiny_file_empty():
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("s.webm", b"x" * 500, "audio/webm")}, data={"lang": "auto"})
    assert r.status_code == 200
    assert r.json() == {"text": ""}


def test_transcribe_missing_file_422():
    r = requests.post(f"{API}/voice/transcribe", data={"lang": "auto"})
    assert r.status_code == 422


# --- Chat languages -----------------------------------------------------------
def _chat(sid, msg, lang):
    r = requests.post(f"{API}/echo/chat", json={"session_id": sid, "message": msg, "voice_mode": True, "language": lang}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mood"] in {"angry", "sad", "anxious", "hopeful", "neutral"}
    assert d["reply"].strip()
    return d


def test_chat_auto_hinglish_roman(sid):
    d = _chat(sid, "yaar aaj bahut bura din tha, office mein sab ne ignore kiya", "auto")
    print("auto:", d)
    assert not DEVANAGARI.search(d["reply"])


def test_chat_hinglish_roman(sid):
    d = _chat(sid, "mujhe lagta hai koi meri baat sunta hi nahi", "Hinglish")
    print("Hinglish:", d)
    assert not DEVANAGARI.search(d["reply"])


def test_chat_tamil(sid):
    d = _chat(sid, "இன்று எனக்கு மிகவும் கஷ்டமான நாள்", "Tamil")
    print("Tamil:", d)
    assert TAMIL.search(d["reply"])


def test_history_order(sid):
    r = requests.get(f"{API}/echo/history/{sid}")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert len(msgs) == 6
    assert [m["role"] for m in msgs] == ["user", "echo"] * 3
    assert all("_id" not in m for m in msgs)


# --- Regression ---------------------------------------------------------------
def test_vent_and_forget():
    s = requests.post(f"{API}/session", json={}).json()["session_id"]
    v = requests.post(f"{API}/vent", json={"session_id": s, "kind": "text", "text": "TEST_vent"})
    assert v.status_code == 200 and v.json()["ok"] is True
    d = requests.delete(f"{API}/session/{s}")
    assert d.status_code == 200
    assert d.json()["vents_deleted"] == 1
    assert requests.get(f"{API}/echo/history/{s}").json()["messages"] == []
