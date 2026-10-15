import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession } from "@/services/echoService";
import { saveIdentity, loadIdentity } from "@/App";
import { rearmReminderIfNeeded } from "@/services/notificationService";

const BG_IMAGE =
  "https://images.unsplash.com/photo-1770795263316-f302a878ee64?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHxkYXJrJTIwbWluaW1hbGlzdCUyMHRleHR1cmV8ZW58MHx8fHwxNzc2NjI1NDE4fDA&ixlib=rb-4.1.0&q=85";

export default function SplashScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle"); // idle | loading | code
  const [identity, setIdentity] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    rearmReminderIfNeeded();
    const existing = loadIdentity();
    if (existing) setIdentity(existing);
  }, []);

  const enter = async () => {
    if (identity) {
      navigate("/home");
      return;
    }
    setPhase("loading");
    setErr(null);
    try {
      const data = await createSession();
      const id = { sessionId: data.session_id, code: data.code };
      saveIdentity(id);
      setIdentity(id);
      setPhase("code");
      setTimeout(() => navigate("/home"), 2400);
    } catch (e) {
      // Surface a real diagnostic so we can see what's actually wrong
      // (network error, 5xx, CORS, stale cached build pointing at a dead URL…).
      const detail =
        e?.response?.status
          ? `server ${e.response.status}`
          : e?.code || e?.message || "network error";
      setErr(`Something’s off — ${detail}. Try again in a moment.`);
      // eslint-disable-next-line no-console
      console.error("[NoOneListening] createSession failed:", e);
      setPhase("idle");
    }
  };

  return (
    <div className="grain relative min-h-screen flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18] pointer-events-none"
        style={{
          backgroundImage: `url(${BG_IMAGE})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(1) contrast(1.05)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(3,3,3,0) 0%, rgba(3,3,3,0.85) 65%, #030303 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
        <p
          data-testid="splash-tagline"
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-10 fade-in-slow"
        >
          a room for when no one is
        </p>

        <img
          data-testid="splash-logo"
          src="/brand/logo.png"
          alt="NoOneListening"
          className="w-56 md:w-64 h-auto select-none pointer-events-none fade-in"
          style={{ opacity: 0.95 }}
          draggable={false}
        />

        <p
          className="mt-10 max-w-xs text-secondary text-[15px] leading-relaxed fade-in-slow"
          style={{ animationDelay: "0.4s" }}
        >
          No account. No name. No record that stays.
          <br />
          Just a room, and a door that only opens inward.
        </p>

        <div className="mt-20 w-full flex flex-col items-center gap-8">
          {phase === "code" && identity && (
            <div
              data-testid="splash-code"
              className="font-mono text-[11px] tracking-widest2 uppercase text-secondary fade-in"
            >
              <span className="text-muted">ID · </span>
              <span className="text-primary">{identity.code}</span>
              <span className="caret ml-1 text-muted">_</span>
            </div>
          )}

          {phase !== "code" && (
            <button
              data-testid="splash-enter-btn"
              onClick={enter}
              disabled={phase === "loading"}
              className="group relative px-12 py-5 bg-primary text-app font-mono text-[11px] tracking-widest2 uppercase hover:bg-white transition-colors duration-500 disabled:opacity-50"
            >
              {phase === "loading" ? "opening the door…" : identity ? "re-enter the room" : "enter the room"}
            </button>
          )}

          {err && (
            <p data-testid="splash-error" className="text-mood-angry-text font-mono text-xs">
              {err}
            </p>
          )}

          <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted max-w-[22rem] leading-relaxed">
            not a crisis line. if you are in danger, please call a real human.
          </p>
        </div>
      </div>
    </div>
  );
}
