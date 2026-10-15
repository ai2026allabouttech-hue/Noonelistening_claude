# Iteration 2: True forgetting (DELETE session) + Gemini TTS voice speak
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- True forgetting ---
class TestForget:
    def test_forget_wipes_messages_vents_session(self, s):
        sess = s.post(f"{BASE_URL}/api/session", json={}).json()
        sid = sess["session_id"]
        r = s.post(f"{BASE_URL}/api/echo/chat", json={"session_id": sid, "message": "TEST_ i had a long day"}, timeout=90)
        assert r.status_code == 200 and r.json()["reply"]
        v = s.post(f"{BASE_URL}/api/vent", json={"session_id": sid, "kind": "text", "text": "TEST_ vent"})
        assert v.status_code == 200
        h = s.get(f"{BASE_URL}/api/echo/history/{sid}").json()
        assert len(h["messages"]) == 2
        d = s.delete(f"{BASE_URL}/api/session/{sid}")
        assert d.status_code == 200
        body = d.json()
        assert body["ok"] is True
        assert body["messages_deleted"] == 2
        assert body["vents_deleted"] == 1
        h2 = s.get(f"{BASE_URL}/api/echo/history/{sid}").json()
        assert h2["messages"] == []

    def test_forget_unknown_session_idempotent(self, s):
        d = s.delete(f"{BASE_URL}/api/session/does-not-exist-123")
        assert d.status_code == 200
        assert d.json()["messages_deleted"] == 0


# --- Voice speak (Gemini TTS) ---
class TestSpeak:
    @pytest.mark.parametrize("voice", ["female", "male"])
    def test_speak_returns_wav(self, s, voice):
        r = s.post(f"{BASE_URL}/api/voice/speak", json={"text": "I'm here with you.", "voice": voice, "mood": "sad"}, timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"].startswith("audio/wav")
        assert r.content[:4] == b"RIFF"
        assert len(r.content) > 5000

    def test_speak_invalid_voice_422(self, s):
        r = s.post(f"{BASE_URL}/api/voice/speak", json={"text": "hi", "voice": "robot"})
        assert r.status_code == 422

    def test_speak_empty_text_400(self, s):
        r = s.post(f"{BASE_URL}/api/voice/speak", json={"text": "   ", "voice": "female"})
        assert r.status_code == 400
