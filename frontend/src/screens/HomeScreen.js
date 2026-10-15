import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadIdentity } from "@/App";

export default function HomeScreen() {
  const navigate = useNavigate();
  const [hover, setHover] = useState(null); // 'empty' | 'echo' | null
  const identity = loadIdentity();

  return (
    <div className="grain relative min-h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo.png"
            alt=""
            aria-hidden
            className="h-7 w-7 object-contain"
            style={{ opacity: 0.85 }}
          />
          <span className="font-mono text-[10px] tracking-widest2 uppercase text-muted">
            NoOneListening
          </span>
        </div>
        <span
          data-testid="home-code"
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted"
        >
          ID · <span className="text-secondary">{identity?.code || "—"}</span>
        </span>
      </div>

      {/* Split halves */}
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Empty Room */}
        <button
          data-testid="home-empty-room-btn"
          onMouseEnter={() => setHover("empty")}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover("empty")}
          onBlur={() => setHover(null)}
          onClick={() => navigate("/empty-room")}
          className="relative flex-1 text-left overflow-hidden group focus:outline-none transition-all duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          style={{
            flexGrow: hover === "empty" ? 1.4 : hover === "echo" ? 0.6 : 1,
            opacity: hover === "echo" ? 0.35 : 1,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="h-full flex items-end px-8 md:px-14 pb-10 md:pb-14">
            <div>
              <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-4">
                01 — alone
              </p>
              <h2
                className="font-serif font-light text-5xl md:text-7xl text-primary leading-[0.95]"
                style={{ letterSpacing: "-0.025em" }}
              >
                Empty
                <br />
                Room.
              </h2>
              <p className="mt-6 text-secondary text-sm md:text-base max-w-xs leading-relaxed">
                Just me. Venting into the void. Nothing writes back.
              </p>
            </div>
          </div>
        </button>

        {/* Echo */}
        <button
          data-testid="home-echo-btn"
          onMouseEnter={() => setHover("echo")}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover("echo")}
          onBlur={() => setHover(null)}
          onClick={() => navigate("/echo")}
          className="relative flex-1 text-left overflow-hidden group focus:outline-none transition-all duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          style={{
            flexGrow: hover === "echo" ? 1.4 : hover === "empty" ? 0.6 : 1,
            opacity: hover === "empty" ? 0.35 : 1,
            backgroundColor: "#0a0a0a",
          }}
        >
          <div className="h-full flex items-start px-8 md:px-14 pt-10 md:pt-14">
            <div>
              <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-4">
                02 — with someone
              </p>
              <h2
                className="font-serif italic font-light text-5xl md:text-7xl text-primary leading-[0.95]"
                style={{ letterSpacing: "-0.025em" }}
              >
                Echo.
              </h2>
              <p className="mt-6 text-secondary text-sm md:text-base max-w-xs leading-relaxed">
                Say it out loud, in your own language. Someone answers, with presence.
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 md:px-10 py-6 flex items-center justify-between">
        <button
          data-testid="home-farewell-btn"
          onClick={() => navigate("/farewell")}
          className="font-mono text-[10px] tracking-widest2 uppercase text-muted hover:text-primary transition-colors duration-500"
        >
          close the room →
        </button>
      </div>
    </div>
  );
}
