"""
NoOneListening API Tests
Tests for: health check, session creation, mood classification, echo chat, vent recording, history retrieval
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_root_returns_ok(self):
        """GET /api/ returns {app: NoOneListening, ok: true}"""
        response = requests.get(f"{API}/")
        assert response.status_code == 200
        data = response.json()
        assert data["app"] == "NoOneListening"
        assert data["ok"] is True


class TestSessionCreation:
    """Session creation endpoint tests"""
    
    def test_create_session_returns_valid_format(self):
        """POST /api/session creates a session with session_id and code (format XXXX-XX)"""
        response = requests.post(f"{API}/session", json={})
        assert response.status_code == 200
        data = response.json()
        
        # Verify session_id exists and is a valid UUID-like string
        assert "session_id" in data
        assert isinstance(data["session_id"], str)
        assert len(data["session_id"]) > 0
        
        # Verify code format is XXXX-XX (4 chars + dash + 2 chars)
        assert "code" in data
        code = data["code"]
        assert isinstance(code, str)
        assert len(code) == 7  # 4 + 1 + 2
        assert code[4] == "-"
        
        # Verify created_at exists
        assert "created_at" in data


class TestMoodClassification:
    """Mood classification endpoint tests"""
    
    def test_mood_angry(self):
        """POST /api/echo/mood classifies angry text correctly"""
        response = requests.post(f"{API}/echo/mood", json={
            "text": "I am so furious right now! Everything is making me angry and I want to scream!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "mood" in data
        assert data["mood"] == "angry"
    
    def test_mood_sad(self):
        """POST /api/echo/mood classifies sad text correctly"""
        response = requests.post(f"{API}/echo/mood", json={
            "text": "I feel so empty and alone. Nothing brings me joy anymore. I just want to cry."
        })
        assert response.status_code == 200
        data = response.json()
        assert "mood" in data
        assert data["mood"] == "sad"
    
    def test_mood_anxious(self):
        """POST /api/echo/mood classifies anxious text correctly"""
        response = requests.post(f"{API}/echo/mood", json={
            "text": "My heart is racing and I can't stop worrying. What if everything goes wrong? I'm so nervous."
        })
        assert response.status_code == 200
        data = response.json()
        assert "mood" in data
        assert data["mood"] == "anxious"
    
    def test_mood_hopeful(self):
        """POST /api/echo/mood classifies hopeful text correctly"""
        response = requests.post(f"{API}/echo/mood", json={
            "text": "I think things are going to get better. I feel optimistic about the future and excited for tomorrow."
        })
        assert response.status_code == 200
        data = response.json()
        assert "mood" in data
        assert data["mood"] == "hopeful"
    
    def test_mood_neutral(self):
        """POST /api/echo/mood classifies neutral text correctly"""
        response = requests.post(f"{API}/echo/mood", json={
            "text": "The weather is nice today. I had lunch at noon."
        })
        assert response.status_code == 200
        data = response.json()
        assert "mood" in data
        assert data["mood"] == "neutral"


class TestEchoChat:
    """Echo chat endpoint tests"""
    
    @pytest.fixture
    def session_id(self):
        """Create a session for chat tests"""
        response = requests.post(f"{API}/session", json={})
        return response.json()["session_id"]
    
    def test_echo_chat_returns_reply_and_mood(self, session_id):
        """POST /api/echo/chat returns {reply, mood} with non-empty empathetic response"""
        response = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": "I feel really overwhelmed today. Everything is too much."
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify reply exists and is non-empty
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0
        
        # Verify mood is a valid label
        assert "mood" in data
        assert data["mood"] in {"angry", "sad", "anxious", "hopeful", "neutral"}
    
    def test_echo_chat_multi_turn_context(self, session_id):
        """Multi-turn chat: Claude remembers context from previous messages"""
        # First message
        response1 = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": "My name is Alex and I'm having a really hard day at work."
        })
        assert response1.status_code == 200
        
        # Wait a moment for DB persistence
        time.sleep(1)
        
        # Second message - should remember context
        response2 = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": "Do you remember what I told you about my day?"
        })
        assert response2.status_code == 200
        data2 = response2.json()
        
        # The reply should reference work or the hard day (context awareness)
        assert "reply" in data2
        assert len(data2["reply"]) > 0
        # Note: We can't strictly assert content, but the reply should be coherent
    
    def test_echo_chat_empty_message_returns_400(self, session_id):
        """POST /api/echo/chat with empty message returns 400"""
        response = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": ""
        })
        assert response.status_code == 400
    
    def test_echo_chat_whitespace_only_returns_400(self, session_id):
        """POST /api/echo/chat with whitespace-only message returns 400"""
        response = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": "   "
        })
        assert response.status_code == 400


class TestVentRecording:
    """Vent recording endpoint tests"""
    
    @pytest.fixture
    def session_id(self):
        """Create a session for vent tests"""
        response = requests.post(f"{API}/session", json={})
        return response.json()["session_id"]
    
    def test_record_text_vent(self, session_id):
        """POST /api/vent stores a text vent"""
        response = requests.post(f"{API}/vent", json={
            "session_id": session_id,
            "kind": "text",
            "text": "I just need to get this off my chest. Nobody understands me."
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0
        assert data["ok"] is True
    
    def test_record_audio_vent(self, session_id):
        """POST /api/vent stores an audio vent (kind=audio)"""
        response = requests.post(f"{API}/vent", json={
            "session_id": session_id,
            "kind": "audio",
            "duration_ms": 15000
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0
        assert data["ok"] is True


class TestHistoryRetrieval:
    """History retrieval endpoint tests"""
    
    def test_get_history_returns_messages(self):
        """GET /api/echo/history/{session_id} returns messages saved during chat"""
        # Create a new session
        session_response = requests.post(f"{API}/session", json={})
        session_id = session_response.json()["session_id"]
        
        # Send a chat message to create history
        chat_response = requests.post(f"{API}/echo/chat", json={
            "session_id": session_id,
            "message": "TEST_HISTORY: This is a test message for history retrieval."
        })
        assert chat_response.status_code == 200
        
        # Wait for DB persistence
        time.sleep(0.5)
        
        # Retrieve history
        history_response = requests.get(f"{API}/echo/history/{session_id}")
        assert history_response.status_code == 200
        data = history_response.json()
        
        assert "session_id" in data
        assert data["session_id"] == session_id
        assert "messages" in data
        assert isinstance(data["messages"], list)
        assert len(data["messages"]) >= 2  # At least user message + echo reply
        
        # Verify message structure
        for msg in data["messages"]:
            assert "id" in msg
            assert "session_id" in msg
            assert "role" in msg
            assert msg["role"] in {"user", "echo"}
            assert "text" in msg
            assert "created_at" in msg
    
    def test_get_history_empty_session(self):
        """GET /api/echo/history/{session_id} returns empty messages for new session"""
        # Create a new session without any chat
        session_response = requests.post(f"{API}/session", json={})
        session_id = session_response.json()["session_id"]
        
        # Retrieve history (should be empty)
        history_response = requests.get(f"{API}/echo/history/{session_id}")
        assert history_response.status_code == 200
        data = history_response.json()
        
        assert "messages" in data
        assert isinstance(data["messages"], list)
        assert len(data["messages"]) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
