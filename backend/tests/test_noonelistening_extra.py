"""Extra regression tests: mood robustness (IndexError fix), multi-turn memory, validation."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
MOODS = {"angry", "sad", "anxious", "hopeful", "neutral"}


# Mood endpoint robustness
@pytest.mark.parametrize("text", ["", "   ", "?", "asdf qwer zxcv", "!!!", "a" * 3000, "😀"])
def test_mood_never_crashes(text):
    r = requests.post(f"{API}/echo/mood", json={"text": text}, timeout=90)
    assert r.status_code == 200, r.text
    assert r.json()["mood"] in MOODS


def test_mood_missing_text_422():
    r = requests.post(f"{API}/echo/mood", json={}, timeout=30)
    assert r.status_code == 422


# Multi-turn memory: Echo should recall a specific detail
def test_multi_turn_memory_recall():
    sid = requests.post(f"{API}/session", json={}).json()["session_id"]
    r1 = requests.post(f"{API}/echo/chat", json={"session_id": sid, "message": "My dog is named Biscuit and he is sick today."}, timeout=120)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{API}/echo/chat", json={"session_id": sid, "message": "What's my dog's name? Just tell me the name."}, timeout=120)
    assert r2.status_code == 200, r2.text
    assert "biscuit" in r2.json()["reply"].lower(), r2.json()["reply"]
    hist = requests.get(f"{API}/echo/history/{sid}").json()["messages"]
    assert len(hist) == 4
    assert [m["role"] for m in hist] == ["user", "echo", "user", "echo"]
    assert all("_id" not in m for m in hist)
    assert all(m["text"] for m in hist)


# Voice mode reply is shorter (spoken)
def test_voice_mode_chat():
    sid = requests.post(f"{API}/session", json={}).json()["session_id"]
    r = requests.post(f"{API}/echo/chat", json={"session_id": sid, "message": "I am tired.", "voice_mode": True}, timeout=120)
    assert r.status_code == 200
    assert len(r.json()["reply"]) > 0


def test_vent_invalid_kind_422():
    r = requests.post(f"{API}/vent", json={"session_id": "x", "kind": "video"})
    assert r.status_code == 422


def test_voice_speak_configured_returns_wav():
    # GEMINI_API_KEY is now configured (iteration 2) -> real audio
    r = requests.post(f"{API}/voice/speak", json={"text": "hi", "voice": "female"}, timeout=90)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(("audio/mpeg", "audio/wav"))
