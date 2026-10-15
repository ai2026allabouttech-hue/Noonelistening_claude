# Iteration 6: voice preview (cached), native voice fallback, wide-model langs, gendered chat replies
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _preview(voice, sample):
    t = time.time()
    r = requests.get(f"{API}/voice/preview", params={"voice": voice, "sample": sample}, timeout=90)
    return r, time.time() - t


# --- Preview endpoint ---
class TestPreview:
    @pytest.mark.parametrize("voice,sample", [("female", "ta"), ("male", "hinglish"), ("female", "hi")])
    def test_cached_previews(self, voice, sample):
        r, dt = _preview(voice, sample)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("audio/mpeg")
        assert len(r.content) > 3000
        print(f"{voice}/{sample} cached took {dt:.2f}s")

    @pytest.mark.parametrize("voice,sample", [("female", "te"), ("male", "mr"), ("female", "auto")])
    def test_new_preview_then_cache(self, voice, sample):
        r1, dt1 = _preview(voice, sample)
        assert r1.status_code == 200, r1.text[:200]
        assert r1.headers["content-type"].startswith("audio/mpeg")
        r2, dt2 = _preview(voice, sample)
        assert r2.status_code == 200
        assert r2.content == r1.content
        print(f"{voice}/{sample}: first {dt1:.2f}s second {dt2:.2f}s")
        assert dt2 < 3.0

    def test_invalid_voice(self):
        r = requests.get(f"{API}/voice/preview", params={"voice": "robot", "sample": "en"}, timeout=30)
        assert r.status_code == 422


# --- Speak still works for native-voice languages (fallback) ---
class TestSpeakNative:
    @pytest.mark.parametrize("voice,lang,text", [
        ("female", "hi", "मैं यहीं हूँ।"),
        ("male", "ta", "நான் இங்கே."),
        ("female", "te", "నేను ఇక్కడే."),
    ])
    def test_speak(self, voice, lang, text):
        r = requests.post(f"{API}/voice/speak", json={"text": text, "voice": voice, "mood": "neutral", "lang": lang}, timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"].startswith("audio/mpeg")
        assert len(r.content) > 1000


# --- Gendered self-reference in Hindi chat ---
class TestGenderChat:
    @pytest.mark.parametrize("voice", ["female", "male"])
    def test_gender(self, voice):
        sid = requests.post(f"{API}/session", json={}, timeout=30).json()["session_id"]
        try:
            r = requests.post(f"{API}/echo/chat", json={
                "session_id": sid,
                "message": "Main bahut akela feel kar raha hoon. Kya tum meri baat sun rahe ho? Tum kya kar sakte ho mere liye?",
                "voice_mode": True, "language": "Hindi", "voice": voice,
            }, timeout=90)
            assert r.status_code == 200, r.text[:200]
            reply = r.json()["reply"]
            print(f"[{voice}] {reply}")
            fem = ["रही", "सकती", "rahi", "sakti", "हूँगी", "करूँगी", "थी"]
            mas = ["रहा", "सकता", "raha", "sakta", "करूँगा", "था"]
            has_f = any(w in reply for w in fem)
            has_m = any(w in reply for w in mas)
            if voice == "female":
                assert not (has_m and not has_f), "masculine self-reference with female voice"
            else:
                assert not (has_f and not has_m), "feminine self-reference with male voice"
        finally:
            requests.delete(f"{API}/session/{sid}", timeout=30)
