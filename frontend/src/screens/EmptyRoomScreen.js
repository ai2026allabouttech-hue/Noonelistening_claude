import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SoundWave from "@/components/SoundWave";
import ExitModal from "@/components/ExitModal";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useExitGuard from "@/hooks/useExitGuard";
import { loadIdentity } from "@/App";
import { recordVent } from "@/services/echoService";

const BG_IMAGE =
  "https://images.unsplash.com/photo-1757463458782-19a9a63e2eff?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwyfHxkYXJrJTIwY2luZW1hdGljJTIwZm9nfGVufDB8fHx8MTc3NjYyNTQxOHww&ixlib=rb-4.1.0&q=85";

const pad = (n) => String(n).padStart(2, "0");
const fmtMs = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

const MIC_ERROR_HEADLINE = {
  "permission-denied": "mic blocked",
  "no-device": "no microphone found",
  "device-busy": "microphone is in use",
  insecure: "secure connection required",
  "mic-unsupported": "mic not supported",
  "mic-error": "mic unavailable",
};

const MIC_ERROR_BODY = {
  "permission-denied":
    "your browser blocked the microphone. this often happens inside embedded previews. open the room in its own tab (button below) and allow mic access when prompted — or click the lock icon in your address bar → microphone → allow.",
  "no-device":
    "we couldn’t find a microphone on this device. plug one in, enable it in your system’s privacy settings, or switch to typing.",
  "device-busy":
    "another app is holding the mic right now. close any call, meeting, or recording tool and try again.",
  insecure:
    "microphone access needs a secure (https) connection. open this page in its own tab over https.",
  "mic-unsupported":
    "this browser doesn’t expose the microphone api. try chrome, firefox, safari, or edge.",
  "mic-error":
    "we couldn’t reach your microphone. try again, or switch to typing for now.",
};

export default function EmptyRoomScreen() {
  const navigate = useNavigate();
  const identity = loadIdentity();
  const rec = useAudioRecorder();
  const { showExit, requestExit, dismissExit } = useExitGuard();
  const [mode, setMode] = useState("text"); // 'text' | 'audio'
  const [value, setValue] = useState("");
  const [dissolving, setDissolving] = useState([]); // {id, text}
  const taRef = useRef(null);

  useEffect(() => {
    if (taRef.current) taRef.current.focus();
  }, []);

  const releaseText = async () => {
    const text = value.trim();
    if (!text) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDissolving((d) => [...d, { id, text }]);
    setValue("");
    // Remove from DOM after dissolve animation completes (~4s)
    setTimeout(() => {
      setDissolving((d) => d.filter((x) => x.id !== id));
    }, 4200);
    try {
      if (identity?.sessionId) {
        await recordVent({
          sessionId: identity.sessionId,
          kind: "text",
          text,
        });
      }
    } catch {
      /* silent — the point is catharsis, not delivery */
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      releaseText();
    }
  };

  const toggleMic = async () => {
    if (rec.isRecording) {
      const duration = rec.elapsedMs;
      rec.stop();
      try {
        if (identity?.sessionId) {
          await recordVent({
            sessionId: identity.sessionId,
            kind: "audio",
            durationMs: duration,
          });
        }
      } catch {
        /* noop */
      }
    } else {
      await rec.start();
    }
  };

  return (
    <div className="grain relative min-h-screen flex flex-col overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.1] pointer-events-none"
        style={{
          backgroundImage: `url(${BG_IMAGE})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1) contrast(1.1)",
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
        <button
          data-testid="empty-room-back-btn"
          onClick={() => navigate("/home")}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          ← back
        </button>
        <span className="font-mono text-[10px] tracking-widest2 uppercase text-muted">
          empty room
        </span>
        <button
          data-testid="empty-room-close-btn"
          onClick={requestExit}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          close ×
        </button>
      </div>

      {/* Mode toggle */}
      <div className="relative z-10 flex items-center justify-center gap-8 pt-2 pb-4">
        <button
          data-testid="empty-room-mode-text-btn"
          onClick={() => setMode("text")}
          className={`font-mono text-[10px] tracking-widest2 uppercase transition-colors duration-500 ${
            mode === "text" ? "text-primary" : "text-muted hover:text-secondary"
          }`}
        >
          type
        </button>
        <span className="text-muted">·</span>
        <button
          data-testid="empty-room-mode-audio-btn"
          onClick={() => setMode("audio")}
          className={`font-mono text-[10px] tracking-widest2 uppercase transition-colors duration-500 ${
            mode === "audio" ? "text-primary" : "text-muted hover:text-secondary"
          }`}
        >
          speak
        </button>
      </div>

      {/* Main canvas */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-10">
        {/* Dissolving text layer */}
        <div className="relative w-full max-w-md h-[38vh] flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {dissolving.map((d) => (
              <div
                key={d.id}
                data-testid="dissolving-text"
                className="absolute inset-0 flex items-center justify-center px-4 dissolve"
              >
                <p
                  className="font-serif font-light text-2xl md:text-3xl text-primary text-center max-w-md leading-relaxed"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {d.text}
                </p>
              </div>
            ))}
          </div>

          {mode === "text" && (
            <textarea
              ref={taRef}
              data-testid="empty-room-text-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="say the thing you can’t say anywhere else…"
              className="relative bg-transparent border-none outline-none resize-none w-full max-w-md text-center font-serif font-light text-2xl md:text-3xl text-primary placeholder:text-muted leading-relaxed"
              style={{ letterSpacing: "-0.01em", caretColor: "#f4f4f5" }}
            />
          )}

          {mode === "audio" && (
            <div className="relative flex flex-col items-center justify-center gap-6 w-full max-w-md">
              <SoundWave
                active={rec.isRecording}
                level={rec.level}
                pitch={rec.pitch}
                calmProgress={
                  rec.calmTargetMs ? rec.calmMs / rec.calmTargetMs : 0
                }
                calmReached={rec.calmReached}
              />
              <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted min-h-[14px]">
                {rec.isRecording
                  ? rec.level > 0.08
                    ? `i hear you · ${fmtMs(rec.elapsedMs)}`
                    : `listening · ${fmtMs(rec.elapsedMs)}`
                  : rec.error
                  ? " "
                  : "press to speak"}
              </p>

              {rec.isRecording && rec.calmReached && (
                <p
                  data-testid="empty-room-calm-note"
                  className="font-serif italic font-light text-xl md:text-2xl text-secondary text-center max-w-sm fade-in-slow"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  your breath slowed.
                  <br />
                  <span className="text-muted not-italic font-sans font-normal text-[13px]">
                    stay as long as you need.
                  </span>
                </p>
              )}

              {rec.error && (
                <div
                  data-testid="empty-room-mic-error"
                  data-mic-error-kind={rec.error}
                  className="flex flex-col items-center gap-3 max-w-sm text-center fade-in"
                >
                  <p className="font-mono text-[10px] tracking-widest2 uppercase text-mood-angry-text">
                    {MIC_ERROR_HEADLINE[rec.error] || "mic unavailable"}
                  </p>
                  <p className="font-sans text-[13px] text-secondary leading-relaxed">
                    {MIC_ERROR_BODY[rec.error] ||
                      "we couldn’t reach your microphone."}
                  </p>
                  {rec.errorDetail && (
                    <p className="font-mono text-[9px] tracking-widest2 uppercase text-muted max-w-[22rem]">
                      detail · {rec.errorDetail}
                    </p>
                  )}
                  <div className="flex items-center gap-6 mt-2 flex-wrap justify-center">
                    {rec.error === "permission-denied" && (
                      <button
                        data-testid="empty-room-mic-open-new-tab-btn"
                        onClick={() => {
                          window.open(
                            window.location.href,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                        className="px-5 py-2.5 bg-primary text-app font-mono text-[10px] tracking-widest2 uppercase hover:bg-white transition-colors duration-300"
                      >
                        open in new tab ↗
                      </button>
                    )}
                    <button
                      data-testid="empty-room-mic-retry-btn"
                      onClick={() => {
                        rec.clearError();
                        rec.start();
                      }}
                      className="font-mono text-[10px] tracking-widest2 uppercase text-primary hover:opacity-80 transition-opacity duration-300 border-b border-border-subtle pb-0.5"
                    >
                      try again
                    </button>
                    <button
                      data-testid="empty-room-mic-switch-text-btn"
                      onClick={() => {
                        rec.clearError();
                        setMode("text");
                      }}
                      className="font-mono text-[10px] tracking-widest2 uppercase text-secondary hover:text-primary transition-colors duration-300"
                    >
                      type instead →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="relative z-10 px-6 md:px-10 py-8 flex flex-col items-center gap-4">
        {mode === "text" ? (
          <>
            <button
              data-testid="empty-room-release-btn"
              onClick={releaseText}
              disabled={!value.trim()}
              className="px-10 py-4 bg-primary text-app font-mono text-[11px] tracking-widest2 uppercase hover:bg-white transition-colors duration-500 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              release
            </button>
            <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted">
              enter · to let it go   ·   shift+enter · new line
            </p>
          </>
        ) : (
          <button
            data-testid="empty-room-mic-btn"
            onClick={toggleMic}
            className={`w-20 h-20 rounded-full border transition-all duration-500 flex items-center justify-center ${
              rec.isRecording
                ? "border-primary bg-primary/5 breathe"
                : "border-border-subtle hover:border-border-focus"
            }`}
            aria-label={rec.isRecording ? "stop" : "start"}
          >
            <span
              className={`block rounded-full transition-all duration-500 ${
                rec.isRecording ? "bg-primary w-5 h-5" : "bg-primary w-4 h-4"
              }`}
              style={rec.isRecording ? { borderRadius: "2px" } : undefined}
            />
          </button>
        )}
      </div>

      <ExitModal
        open={showExit}
        onStay={dismissExit}
        onLeave={() => {
          dismissExit();
          rec.stop();
          navigate("/farewell");
        }}
      />
    </div>
  );
}
