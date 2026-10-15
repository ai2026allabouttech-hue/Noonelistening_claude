import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export async function createSession() {
  const { data } = await axios.post(`${API}/session`, {});
  return data; // { session_id, code, created_at }
}

export async function sendEchoMessage(sessionId, message, voiceMode = false, language = null) {
  const { data } = await axios.post(`${API}/echo/chat`, {
    session_id: sessionId,
    message,
    voice_mode: voiceMode,
    language,
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

export async function forgetSession(sessionId) {
  await axios.delete(`${API}/session/${sessionId}`);
}

export async function fetchHistory(sessionId) {
  const { data } = await axios.get(`${API}/echo/history/${sessionId}`);
  return data.messages || [];
}

// voice: "female" | "male", lang: ISO code for native accent. Returns an MP3 Blob.
export async function fetchSpeech(text, voice, mood, lang = null) {
  const { data } = await axios.post(
    `${API}/voice/speak`,
    { text, voice, mood, lang },
    { responseType: "blob", timeout: 70000 }
  );
  return data;
}

export async function transcribeSpeech(blob, lang) {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", blob, `speech.${ext}`);
  form.append("lang", lang || "auto");
  const { data } = await axios.post(`${API}/voice/transcribe`, form, { timeout: 60000 });
  return data.text || "";
}
