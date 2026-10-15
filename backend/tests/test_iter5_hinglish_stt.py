# Iteration 5: Hinglish Roman-script STT, ElevenLabs language_code TTS, 413 size limit
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_cache = {}


# --- TTS with language_code ---------------------------------------------------
def test_speak_female_hi():
    r = requests.post(f"{API}/voice/speak", json={"text": "Main yahan hoon yaar, tension mat lo.", "voice": "female", "mood": "sad", "lang": "hi"}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) > 2000
    _cache["hi"] = r.content


def test_speak_male_ta():
    r = requests.post(f"{API}/voice/speak", json={"text": "நான் இங்கே இருக்கிறேன்.", "voice": "male", "lang": "ta"}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert len(r.content) > 2000


def test_speak_male_null_lang():
    r = requests.post(f"{API}/voice/speak", json={"text": "I am here.", "voice": "male", "lang": None}, timeout=70)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")


# --- STT Hinglish ---------------------------------------------------------------
def test_transcribe_hinglish_roman():
    mp3 = _cache.get("hi")
    if not mp3:
        pytest.skip("no hi audio")
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("s.mp3", mp3, "audio/mpeg")}, data={"lang": "hinglish"}, timeout=60)
    assert r.status_code == 200
    text = r.json()["text"]
    print("HINGLISH:", text)
    assert text
    assert not DEVANAGARI.search(text), text
    assert re.search(r"[A-Za-z]", text)


def test_transcribe_hindi_lang_devanagari_ok():
    mp3 = _cache.get("hi")
    if not mp3:
        pytest.skip("no hi audio")
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("s.mp3", mp3, "audio/mpeg")}, data={"lang": "hi"}, timeout=60)
    assert r.status_code == 200
    print("HI:", r.json()["text"])
    assert r.json()["text"]


def test_transcribe_too_large_413():
    big = b"\x00" * (10 * 1024 * 1024 + 10)
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("big.webm", big, "audio/webm")}, data={"lang": "auto"}, timeout=120)
    assert r.status_code == 413
    assert "detail" in r.json()


def test_transcribe_tiny_empty():
    r = requests.post(f"{API}/voice/transcribe", files={"audio": ("t.webm", b"\x00" * 500, "audio/webm")}, data={"lang": "auto"})
    assert r.status_code == 200
    assert r.json()["text"] == ""
