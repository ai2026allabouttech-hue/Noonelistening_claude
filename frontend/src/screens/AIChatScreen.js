import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MoodBadge from "@/components/MoodBadge";
import ExitModal from "@/components/ExitModal";
import useExitGuard from "@/hooks/useExitGuard";
import { loadIdentity } from "@/App";
import { sendEchoMessage, fetchHistory, fetchSpeech } from "@/services/echoService";

const SPEAK_KEY = "nol_chat_speak_v1"; // "off" | "female" | "male"
const VOICE_OPTS = [
  { id: "off", label: "text only" },
  { id: "female", label: "woman's voice" },
  { id: "male", label: "man's voice" },
];

const BG_IMAGE =
  "https://images.pexels.com/photos/7641148/pexels-photo-7641148.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function AIChatScreen() {
  const navigate = useNavigate();
  const identity = loadIdentity();
  const { showExit, requestExit, dismissExit } = useExitGuard();
  const [messages, setMessages] = useState([]); // {id, role, text, mood}
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [speakAs, setSpeakAs] = useState(
    () => localStorage.getItem(SPEAK_KEY) || "off"
  );
  const [voiceNotice, setVoiceNotice] = useState(null);
  const audioRef = useRef(null);
  const speakTicket = useRef(0);
  const endRef = useRef(null);
  const taRef = useRef(null);

  const pickSpeak = (v) => {
    setSpeakAs(v);
    localStorage.setItem(SPEAK_KEY, v);
    if (v !== "off") localStorage.setItem("nol_voice_pref_v1", v);
    if (!audioRef.current) audioRef.current = new Audio();
    if (v === "off") audioRef.current.pause();
  };

  const speakReply = async (text, mood) => {
    if (speakAs === "off") return;
    setVoiceNotice(null);
    const ticket = ++speakTicket.current;
    let blob;
    try {
      blob = await fetchSpeech(text, speakAs, mood);
    } catch {
      setVoiceNotice("Voice is resting for a moment. Read this one instead.");
      return;
    }
    if (ticket !== speakTicket.current) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
    a.src = URL.createObjectURL(blob);
    a.play().catch(() =>
      setVoiceNotice("Your browser blocked sound. Tap a voice button to allow it.")
    );
  };

  useEffect(() => () => audioRef.current?.pause(), []);

  useEffect(() => {
    if (!identity?.sessionId) return;
    fetchHistory(identity.sessionId)
      .then((hist) => {
        if (hist && hist.length) {
          setMessages(
            hist.map((m) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              mood: m.mood,
            }))
          );
        }
      })
      .catch(() => {
        /* noop — start fresh */
      });
  }, [identity?.sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !identity?.sessionId) return;
    setSending(true);
    setError(null);
    const userLocal = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      mood: null,
    };
    setMessages((m) => [...m, userLocal]);
    setInput("");
    try {
      const { reply, mood } = await sendEchoMessage(identity.sessionId, text);
      setMessages((m) => {
        const updated = m.map((x) =>
          x.id === userLocal.id ? { ...x, mood } : x
        );
        return [
          ...updated,
          {
            id: `e-${Date.now()}`,
            role: "echo",
            text: reply,
            mood,
          },
        ];
      });
      speakReply(reply, mood);
    } catch (e) {
      setError("Echo is quiet for a moment. Try again.");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="grain relative h-[100dvh] flex flex-col overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `url(${BG_IMAGE})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1) contrast(1.1)",
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6 border-b border-border-subtle">
        <button
          data-testid="chat-back-btn"
          onClick={() => navigate("/home")}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          ← back
        </button>
        <button
          data-testid="chat-voice-btn"
          onClick={() => navigate("/voice")}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          talk out loud →
        </button>
        <button
          data-testid="chat-close-btn"
          onClick={requestExit}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          close ×
        </button>
      </div>

      {/* Reply voice choice */}
      <div
        data-testid="chat-voice-choice"
        className="relative z-10 flex flex-wrap items-center justify-center gap-2 px-6 py-3 border-b border-border-subtle"
      >
        <span className="font-mono text-[10px] tracking-widest2 uppercase text-secondary mr-2">
          echo replies in
        </span>
        {VOICE_OPTS.map((o) => (
          <button
            key={o.id}
            data-testid={`chat-speak-${o.id}`}
            onClick={() => pickSpeak(o.id)}
            aria-pressed={speakAs === o.id}
            className={`px-3 py-1.5 font-mono text-[10px] tracking-widest2 uppercase border transition-colors duration-500 ${
              speakAs === o.id
                ? "border-primary text-primary"
                : "border-border-subtle text-secondary hover:text-primary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        data-testid="chat-messages"
        className="relative z-10 flex-1 min-h-0 overflow-y-auto scroll-quiet px-6 md:px-12 py-10"
      >
        <div className="max-w-2xl mx-auto flex flex-col gap-12">
          {messages.length === 0 && (
            <div className="text-center pt-10">
              <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-6">
                someone is here
              </p>
              <p
                className="font-serif italic font-light text-3xl md:text-4xl text-primary leading-snug"
                style={{ letterSpacing: "-0.01em" }}
              >
                Start wherever you are.
                <br />
                <span className="text-secondary">I’m not going anywhere.</span>
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                data-testid="chat-msg-user"
                className="self-end max-w-[80%]"
              >
                <p className="font-mono text-[13px] tracking-wide text-secondary text-right leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </p>
              </div>
            ) : (
              <div
                key={m.id}
                data-testid="chat-msg-echo"
                className="self-start max-w-[92%] fade-in"
              >
                {m.mood && (
                  <div className="mb-3">
                    <MoodBadge mood={m.mood} />
                  </div>
                )}
                <p
                  className="font-serif font-light text-2xl md:text-3xl text-primary leading-[1.35] whitespace-pre-wrap"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {m.text}
                </p>
              </div>
            )
          )}

          {sending && (
            <div data-testid="chat-typing" className="self-start">
              <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted">
                echo is listening<span className="caret">_</span>
              </p>
            </div>
          )}

          {error && (
            <p
              data-testid="chat-error"
              className="font-mono text-[10px] tracking-widest2 uppercase text-mood-angry-text self-center"
            >
              {error}
            </p>
          )}

          {voiceNotice && (
            <p
              data-testid="chat-voice-notice"
              className="font-mono text-[10px] tracking-widest2 uppercase text-secondary self-center"
            >
              {voiceNotice}
            </p>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div className="relative z-10 border-t border-border-subtle px-4 md:px-10 py-5 bg-app/90">
        <div className="max-w-2xl mx-auto flex items-end gap-4">
          <textarea
            ref={taRef}
            data-testid="chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="say anything. nothing is too small."
            className="flex-1 bg-transparent border-none outline-none resize-none font-sans text-base text-primary placeholder:text-muted leading-relaxed py-2 max-h-32"
            style={{ caretColor: "#f4f4f5" }}
          />
          <button
            data-testid="chat-send-btn"
            onClick={send}
            disabled={!input.trim() || sending}
            className="shrink-0 px-6 py-3 font-mono text-[10px] tracking-widest2 uppercase bg-primary text-app hover:bg-white transition-colors duration-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending ? "…" : "send"}
          </button>
        </div>
      </div>

      <ExitModal
        open={showExit}
        onStay={dismissExit}
        onLeave={() => {
          dismissExit();
          navigate("/farewell");
        }}
      />
    </div>
  );
}
