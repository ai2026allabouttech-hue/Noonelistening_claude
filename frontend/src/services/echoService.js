import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export async function createSession() {
  const { data } = await axios.post(`${API}/session`, {});
  return data; // { session_id, code, created_at }
}

export async function sendEchoMessage(sessionId, message, voiceMode = false) {
  const { data } = await axios.post(`${API}/echo/chat`, {
    session_id: sessionId,
    message,
    voice_mode: voiceMode,
  });
  return data; // { reply, mood }
}

export async function classifyMood(text) {
  const { data } = await axios.post(`${API}/echo/mood`, { text });
  return data.mood;
}

export async function recordVent({ sessionId, kind, text, durationMs }) {
  const { data } = await axios.post(`${API}/vent`, {
    session_id: sessionId,
    kind,
    text: text ?? null,
    duration_ms: durationMs ?? null,
  });
  return data;
}

export async function fetchHistory(sessionId) {
  const { data } = await axios.get(`${API}/echo/history/${sessionId}`);
  return data.messages || [];
}

// Asks the backend to turn Echo's reply into a human voice.
// voice: "female" | "male". Returns an audio Blob (WAV).
export async function fetchSpeech(text, voice, mood) {
  const { data } = await axios.post(
    `${API}/voice/speak`,
    { text, voice, mood },
    { responseType: "blob", timeout: 70000 }
  );
  return data;
}
