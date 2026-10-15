import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExitModal from "@/components/ExitModal";
import useExitGuard from "@/hooks/useExitGuard";
import { loadIdentity } from "@/App";
import { sendEchoMessage, fetchSpeech, fetchHistory } from "@/services/echoService";
import { LANGUAGES, LANG_KEY, defaultLanguage } from "@/lib/languages";

// The browser's built-in "ears" (speech-to-text). Chrome, Edge, Safari.
const SpeechRec =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const VOICE_KEY = "nol_voice_pref_v1";

// Tiny silent sound: playing it on the first tap unlocks audio on iPhones.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = "font-mono text-[10px] tracking-widest2 uppercase";

function Transcript({ turns, heard, phase }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, heard]);
  return (
    <div
      data-testid="voice-transcript"
      className="relative z-10 flex-1 min-h-0 overflow-y-auto scroll-quiet w-full px-6 md:px-12 py-8"
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        {turns.map((t) =>
          t.role === "user" ? (
            <p
              key={t.id}
              data-testid="voice-turn-user"
              className="self-end max-w-[80%] font-mono text-[13px] tracking-wide text-secondary text-right leading-relaxed whitespace-pre-wrap"
            >
              {t.text}
            </p>
          ) : (
            <p
              key={t.id}
              data-testid="voice-turn-echo"
              className="self-start max-w-[92%] font-serif font-light text-2xl md:text-3xl text-primary leading-[1.35] whitespace-pre-wrap fade-in"
              style={{ letterSpacing: "-0.01em" }}
            >
              {t.text}
            </p>
          )
        )}
        {phase === "listening" && heard && (
          <p
            data-testid="voice-heard"
            className="self-end max-w-[80%] font-mono text-[13px] tracking-wide text-muted text-right leading-relaxed"
          >
            {heard}
          </p>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Chooser({ voice, pickVoice, lang, pickLang, begin }) {
  return (
    <div
      data-testid="voice-choose"
      className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center fade-in"
    >
      <p className={`${label} text-secondary mb-6`}>who would you like to talk to</p>
      <h1
        className="font-serif italic font-light text-4xl md:text-5xl text-primary leading-snug mb-10"
        style={{ letterSpacing: "-0.01em" }}
      >
        Say it out loud.
        <br />
        <span className="text-secondary">I'll listen.</span>
      </h1>

      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {[
          { id: "female", label: "a woman's voice" },
          { id: "male", label: "a man's voice" },
        ].map((opt) => (
          <button
            key={opt.id}
            data-testid={`voice-pick-${opt.id}`}
            onClick={() => pickVoice(opt.id)}
            aria-pressed={voice === opt.id}
            className={`px-6 py-4 ${label} border transition-colors duration-500 ${
              voice === opt.id
                ? "border-primary text-primary bg-white/5"
                : "border-border-subtle text-secondary hover:text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className={`${label} text-secondary mb-3`} htmlFor="voice-lang">
        i'll speak in
      </label>
      <select
        id="voice-lang"
        data-testid="voice-language-select"
        value={lang}
        onChange={(e) => pickLang(e.target.value)}
        className="mb-10 bg-transparent border border-border-subtle text-primary font-mono text-[12px] tracking-wide px-5 py-3 outline-none focus:border-primary"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-black">
            {l.name}
          </option>
        ))}
      </select>

      <button
        data-testid="voice-begin-btn"
        onClick={begin}
        className={`px-10 py-4 ${label} bg-primary text-app hover:bg-white transition-colors duration-500`}
      >
        begin
      </button>
      <p className={`mt-8 ${label} text-secondary max-w-xs leading-relaxed`}>
        your browser will ask to use the microphone
      </p>
    </div>
  );
}

export default function VoiceChatScreen() {
  const navigate = useNavigate();
  const identity = loadIdentity();
  const { showExit, requestExit, dismissExit } = useExitGuard();

  // phase: choose | listening | thinking | speaking | paused
  const [phase, setPhase] = useState("choose");
  const [voice, setVoice] = useState(() => localStorage.getItem(VOICE_KEY) || "female");
  const [lang, setLang] = useState(defaultLanguage);
  const [heard, setHeard] = useState("");
  const [turns, setTurns] = useState([]);
  const [notice, setNotice] = useState("");

  const phaseRef = useRef("choose");
  const voiceRef = useRef(voice);
  const langRef = useRef(lang);
  const activeRef = useRef(false);
  const recogRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!identity?.sessionId) return;
    fetchHistory(identity.sessionId)
      .then((h) => setTurns(h.map((m) => ({ id: m.id, role: m.role, text: m.text }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePhase = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const pickVoice = (v) => {
    setVoice(v);
    voiceRef.current = v;
    localStorage.setItem(VOICE_KEY, v);
  };

  const pickLang = (code) => {
    setLang(code);
    langRef.current = code;
    localStorage.setItem(LANG_KEY, code);
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
      a.dispatchEvent(new Event("ended"));
    }
  }

  // --- 1. LISTEN ------------------------------------------------------------
  function startListening() {
    if (!activeRef.current || !SpeechRec) return;
    stopRecognition();

    const rec = new SpeechRec();
    rec.lang = langRef.current;
    rec.continuous = false;
    rec.interimResults = true;

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
    };

    rec.onend = () => {
      if (!activeRef.current || phaseRef.current !== "listening") return;
      const text = finalText.trim();
      if (text) handleUserSpeech(text);
      else setTimeout(startListening, 300);
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
    stopRecognition();
    changePhase("thinking");
    setHeard("");
    setNotice("");
    setTurns((t) => [...t, { id: `u-${Date.now()}`, role: "user", text }]);
    const langName = LANGUAGES.find((l) => l.code === langRef.current)?.name;
    try {
      const { reply, mood } = await sendEchoMessage(identity.sessionId, text, true, langName);
      if (!activeRef.current) return;
      setTurns((t) => [...t, { id: `e-${Date.now()}`, role: "echo", text: reply }]);
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

  const interrupt = () => {
    if (phaseRef.current === "speaking") stopAudio();
  };

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

  const langName = LANGUAGES.find((l) => l.code === lang)?.name;

  return (
    <div className="grain relative h-[100dvh] flex flex-col overflow-hidden">
      <style>{`
        @keyframes nolBreathe { 0%,100% { transform: scale(1); opacity:.55 } 50% { transform: scale(1.12); opacity:.9 } }
        @keyframes nolSpeak { 0%,100% { transform: scale(1); opacity:.7 } 50% { transform: scale(1.22); opacity:1 } }
      `}</style>

      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6 border-b border-border-subtle">
        <button
          data-testid="voice-back-btn"
          onClick={() => {
            pause();
            navigate("/home");
          }}
          className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
        >
          ← back
        </button>
        <span data-testid="voice-header" className={`${label} text-secondary`}>
          echo · {voice === "male" ? "his" : "her"} voice · {langName}
        </span>
        <button
          data-testid="voice-close-btn"
          onClick={requestExit}
          className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
        >
          close ×
        </button>
      </div>

      {!SpeechRec && (
        <div className="relative z-10 flex-1 flex items-center justify-center px-8 text-center">
          <p className="font-serif italic font-light text-2xl text-secondary max-w-md leading-snug">
            This browser can't listen. Please open the app in Chrome, Edge or Safari.
          </p>
        </div>
      )}

      {SpeechRec && phase === "choose" && (
        <Chooser voice={voice} pickVoice={pickVoice} lang={lang} pickLang={pickLang} begin={begin} />
      )}

      {SpeechRec && phase !== "choose" && (
        <>
          <Transcript turns={turns} heard={heard} phase={phase} />

          <div className="relative z-10 flex flex-col items-center px-6 pb-8 pt-4 border-t border-border-subtle">
            <button
              data-testid="voice-orb"
              onClick={phase === "paused" ? begin : interrupt}
              aria-label={phase === "paused" ? "resume" : "voice orb"}
              className="relative flex items-center justify-center h-32 w-32 rounded-full focus:outline-none"
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
              <span data-testid="voice-status" className={`relative ${label} text-secondary`}>
                {statusLabel}
              </span>
            </button>

            {notice && (
              <p data-testid="voice-notice" className={`mt-3 ${label} text-secondary text-center`}>
                {notice}
              </p>
            )}
            {phase === "speaking" && (
              <p className={`mt-3 ${label} text-muted`}>tap the circle to interrupt</p>
            )}

            <div className="mt-5 flex items-center justify-center gap-8">
              {phase === "paused" ? (
                <>
                  <button
                    data-testid="voice-resume-btn"
                    onClick={begin}
                    className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
                  >
                    resume
                  </button>
                  <button
                    data-testid="voice-change-btn"
                    onClick={() => changePhase("choose")}
                    className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
                  >
                    change voice / language
                  </button>
                </>
              ) : (
                <button
                  data-testid="voice-pause-btn"
                  onClick={pause}
                  className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
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
                className={`${label} text-secondary hover:text-primary transition-colors duration-500`}
              >
                end
              </button>
            </div>
          </div>
        </>
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
