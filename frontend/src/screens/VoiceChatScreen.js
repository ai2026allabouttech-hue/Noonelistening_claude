import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExitModal from "@/components/ExitModal";
import useExitGuard from "@/hooks/useExitGuard";
import { loadIdentity } from "@/App";
import { sendEchoMessage, fetchSpeech } from "@/services/echoService";

// The browser's built-in "ears" (speech-to-text). Free. Works in Chrome,
// Edge and Safari. Not in Firefox.
const SpeechRec =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const VOICE_KEY = "nol_voice_pref_v1";

// A tiny silent sound. Playing it on the first tap "unlocks" audio on
// iPhones, which otherwise block sound that starts later by itself.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function VoiceChatScreen() {
  const navigate = useNavigate();
  const identity = loadIdentity();
  const { showExit, requestExit, dismissExit } = useExitGuard();

  // phase: choose | listening | thinking | speaking | paused
  const [phase, setPhase] = useState("choose");
  const [voice, setVoice] = useState(
    () => localStorage.getItem(VOICE_KEY) || "female"
  );
  const [heard, setHeard] = useState(""); // what the person just said
  const [echoText, setEchoText] = useState(""); // what Echo just said
  const [notice, setNotice] = useState("");

  // Refs hold values that the speech callbacks need to read "live".
  const phaseRef = useRef("choose");
  const voiceRef = useRef(voice);
  const activeRef = useRef(false); // is the voice session running?
  const recogRef = useRef(null);
  const audioRef = useRef(null);

  const changePhase = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const pickVoice = (v) => {
    setVoice(v);
    voiceRef.current = v;
    localStorage.setItem(VOICE_KEY, v);
  };

  function stopRecognition() {
    const r = recogRef.current;
    recogRef.current = null;
    if (r) {
      r.onend = null;
      r.onerror = null;
      r.onresult = null;
      try {
        r.abort();
      } catch {
        /* noop */
      }
    }
  }

  function stopAudio() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      // tells the waiting code "playback finished" so it moves on
      a.dispatchEvent(new Event("ended"));
    }
  }

  // --- 1. LISTEN ------------------------------------------------------------
  function startListening() {
    if (!activeRef.current || !SpeechRec) return;
    stopRecognition();

    const rec = new SpeechRec();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false; // stops by itself when the person pauses
    rec.interimResults = true; // shows words live while they speak

    let finalText = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += piece + " ";
        else interim += piece;
      }
      setHeard((finalText + interim).trim());
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        activeRef.current = false;
        setNotice("Microphone is blocked. Allow it in your browser, then tap resume.");
        changePhase("paused");
      }
      // "no-speech" / "aborted" are normal; onend will restart listening
    };

    rec.onend = () => {
      if (!activeRef.current || phaseRef.current !== "listening") return;
      const text = finalText.trim();
      if (text) handleUserSpeech(text);
      else setTimeout(startListening, 300); // silence: keep waiting
    };

    recogRef.current = rec;
    setHeard("");
    changePhase("listening");
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  // --- 2. THINK -------------------------------------------------------------
  async function handleUserSpeech(text) {
    stopRecognition(); // never listen while Echo talks (avoids hearing itself)
    changePhase("thinking");
    setHeard(text);
    setNotice("");
    try {
      const { reply, mood } = await sendEchoMessage(
        identity.sessionId,
        text,
        true // voice_mode: ask for short, spoken-style answers
      );
      if (!activeRef.current) return;
      setEchoText(reply);
      await speak(reply, mood);
    } catch {
      setNotice("Echo went quiet for a moment. I'm still here, say it again.");
    }
    if (activeRef.current) startListening();
  }

  // --- 3. SPEAK -------------------------------------------------------------
  async function speak(text, mood) {
    changePhase("speaking");
    try {
      const blob = await fetchSpeech(text, voiceRef.current, mood);
      if (!activeRef.current) return;
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      audio.src = url;
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
    } catch {
      // Voice failed (limit reached, network...). We do NOT fall back to a
      // robotic voice. We show the words and give time to read them.
      setNotice("Voice is resting for a moment. Read this one instead.");
      await sleep(Math.min(9000, 2000 + text.length * 45));
    }
  }

  // --- Buttons --------------------------------------------------------------
  const begin = () => {
    if (!SpeechRec) return;
    activeRef.current = true;
    setNotice("");
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = SILENT_WAV;
    audioRef.current.play().catch(() => {});
    startListening();
  };

  const pause = () => {
    activeRef.current = false;
    stopRecognition();
    stopAudio();
    changePhase("paused");
  };

  // Tap the circle while Echo is talking to cut in and speak.
  const interrupt = () => {
    if (phaseRef.current === "speaking") stopAudio();
  };

  // Stop everything when leaving this screen
  useEffect(
    () => () => {
      activeRef.current = false;
      stopRecognition();
      stopAudio();
    },
    []
  );

  const statusLabel = {
    listening: "listening",
    thinking: "echo is with you",
    speaking: "echo is speaking",
    paused: "paused",
  }[phase];

  return (
    <div className="grain relative min-h-screen flex flex-col overflow-hidden">
      <style>{`
        @keyframes nolBreathe { 0%,100% { transform: scale(1); opacity:.55 } 50% { transform: scale(1.12); opacity:.9 } }
        @keyframes nolSpeak { 0%,100% { transform: scale(1); opacity:.7 } 50% { transform: scale(1.22); opacity:1 } }
      `}</style>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6 border-b border-border-subtle">
        <button
          data-testid="voice-back-btn"
          onClick={() => navigate("/echo")}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          ← type instead
        </button>
        <span className="font-mono text-[10px] tracking-widest2 uppercase text-muted">
          echo · voice
        </span>
        <button
          data-testid="voice-close-btn"
          onClick={requestExit}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          close ×
        </button>
      </div>

      {/* Not supported (e.g. Firefox) */}
      {!SpeechRec && (
        <div className="relative z-10 flex-1 flex items-center justify-center px-8 text-center">
          <p className="font-serif italic font-light text-2xl text-secondary max-w-md leading-snug">
            This browser can't listen. Please open the app in Chrome, Edge or
            Safari, or type to Echo instead.
          </p>
        </div>
      )}

      {/* Step 1: choose the voice */}
      {SpeechRec && phase === "choose" && (
        <div
          data-testid="voice-choose"
          className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center fade-in"
        >
          <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-6">
            who would you like to talk to
          </p>
          <h1
            className="font-serif italic font-light text-4xl md:text-5xl text-primary leading-snug mb-12"
            style={{ letterSpacing: "-0.01em" }}
          >
            Say it out loud.
            <br />
            <span className="text-secondary">I'll listen.</span>
          </h1>

          <div className="flex gap-4 mb-12">
            {[
              { id: "female", label: "a woman's voice" },
              { id: "male", label: "a man's voice" },
            ].map((opt) => (
              <button
                key={opt.id}
                data-testid={`voice-pick-${opt.id}`}
                onClick={() => pickVoice(opt.id)}
                className={`px-6 py-4 font-mono text-[10px] tracking-widest2 uppercase border transition-colors duration-500 ${
                  voice === opt.id
                    ? "border-primary text-primary"
                    : "border-border-subtle text-muted hover:text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            data-testid="voice-begin-btn"
            onClick={begin}
            className="px-10 py-4 font-mono text-[10px] tracking-widest2 uppercase bg-primary text-app hover:bg-white transition-colors duration-500"
          >
            begin
          </button>
          <p className="mt-8 font-mono text-[10px] tracking-widest2 uppercase text-muted max-w-xs leading-relaxed">
            your browser will ask to use the microphone
          </p>
        </div>
      )}

      {/* Step 2: the conversation */}
      {SpeechRec && phase !== "choose" && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 md:px-12 py-10">
          <div className="w-full max-w-2xl text-center min-h-[9rem]">
            {echoText && (
              <p
                data-testid="voice-echo-text"
                className="font-serif font-light text-2xl md:text-3xl text-primary leading-[1.35] fade-in"
                style={{ letterSpacing: "-0.01em" }}
              >
                {echoText}
              </p>
            )}
          </div>

          <button
            data-testid="voice-orb"
            onClick={phase === "paused" ? begin : interrupt}
            aria-label={phase === "paused" ? "resume" : "voice orb"}
            className="relative flex items-center justify-center h-44 w-44 rounded-full focus:outline-none"
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(244,244,245,0.25) 0%, rgba(244,244,245,0.04) 70%)",
                animation:
                  phase === "listening"
                    ? "nolBreathe 3.2s ease-in-out infinite"
                    : phase === "speaking"
                    ? "nolSpeak 1.4s ease-in-out infinite"
                    : phase === "thinking"
                    ? "nolBreathe 1.6s ease-in-out infinite"
                    : "none",
                opacity: phase === "paused" ? 0.3 : undefined,
              }}
            />
            <span className="relative font-mono text-[10px] tracking-widest2 uppercase text-secondary">
              {statusLabel}
            </span>
          </button>

          <div className="w-full max-w-2xl text-center">
            <p
              data-testid="voice-heard"
              className="font-mono text-[13px] tracking-wide text-secondary leading-relaxed min-h-[3rem]"
            >
              {heard}
            </p>
            {notice && (
              <p
                data-testid="voice-notice"
                className="mt-4 font-mono text-[10px] tracking-widest2 uppercase text-muted"
              >
                {notice}
              </p>
            )}
            <div className="mt-8 flex items-center justify-center gap-8">
              {phase === "paused" ? (
                <button
                  data-testid="voice-resume-btn"
                  onClick={begin}
                  className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
                >
                  resume
                </button>
              ) : (
                <button
                  data-testid="voice-pause-btn"
                  onClick={pause}
                  className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
                >
                  pause
                </button>
              )}
              <button
                data-testid="voice-end-btn"
                onClick={() => {
                  pause();
                  navigate("/home");
                }}
                className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
              >
                end
              </button>
            </div>
            {phase === "speaking" && (
              <p className="mt-6 font-mono text-[10px] tracking-widest2 uppercase text-muted">
                tap the circle to interrupt
              </p>
            )}
          </div>
        </div>
      )}

      <ExitModal
        open={showExit}
        onStay={dismissExit}
        onLeave={() => {
          dismissExit();
          pause();
          navigate("/farewell");
        }}
      />
    </div>
  );
}
