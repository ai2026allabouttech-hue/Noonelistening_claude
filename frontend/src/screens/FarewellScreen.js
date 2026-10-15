import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  enableDailyReminder,
  clearReminder,
  getReminderState,
} from "@/services/notificationService";

const BG_IMAGE =
  "https://images.unsplash.com/photo-1770795263316-f302a878ee64?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHxkYXJrJTIwbWluaW1hbGlzdCUyMHRleHR1cmV8ZW58MHx8fHwxNzc2NjI1NDE4fDA&ixlib=rb-4.1.0&q=85";

export default function FarewellScreen() {
  const navigate = useNavigate();
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderError, setReminderError] = useState(null);

  useEffect(() => {
    const s = getReminderState();
    if (s?.enabled) setReminderOn(true);
  }, []);

  const toggleReminder = async () => {
    if (reminderOn) {
      clearReminder();
      setReminderOn(false);
      setReminderError(null);
      return;
    }
    const res = await enableDailyReminder(21);
    if (res.ok) {
      setReminderOn(true);
      setReminderError(null);
    } else {
      setReminderError(
        res.reason === "permission-denied"
          ? "notifications are blocked in this browser."
          : "couldn’t set the reminder."
      );
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

      <div className="relative z-10 max-w-md w-full text-center">
        <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-12 fade-in-slow">
          the door closes gently
        </p>

        <h1
          data-testid="farewell-title"
          className="font-serif font-light text-4xl md:text-5xl text-primary leading-[1.1] fade-in"
          style={{ letterSpacing: "-0.015em" }}
        >
          You survived today.
          <br />
          <span className="italic text-secondary">Tomorrow is another.</span>
        </h1>

        <p
          className="mt-10 text-secondary text-[15px] leading-relaxed fade-in-slow"
          style={{ animationDelay: "0.3s" }}
        >
          Nothing you said is kept against you. The room forgets so you don’t
          have to.
        </p>

        {/* Reminder toggle */}
        <div className="mt-16 flex items-center justify-center gap-4">
          <button
            data-testid="farewell-reminder-toggle"
            onClick={toggleReminder}
            role="switch"
            aria-checked={reminderOn}
            className="relative w-12 h-6 border border-border-subtle transition-colors duration-500"
            style={{
              backgroundColor: reminderOn ? "#f4f4f5" : "transparent",
            }}
          >
            <span
              className="absolute top-[2px] w-4 h-4 bg-primary transition-all duration-500"
              style={{
                left: reminderOn ? "26px" : "2px",
                backgroundColor: reminderOn ? "#030303" : "#a1a1aa",
              }}
            />
          </button>
          <span className="font-mono text-[10px] tracking-widest2 uppercase text-secondary">
            remind me tomorrow · 9pm
          </span>
        </div>
        {reminderError && (
          <p
            data-testid="farewell-reminder-error"
            className="mt-4 font-mono text-[10px] tracking-widest2 uppercase text-mood-angry-text"
          >
            {reminderError}
          </p>
        )}

        <div className="mt-20 flex flex-col items-center gap-6">
          <button
            data-testid="farewell-return-btn"
            onClick={() => navigate("/home")}
            className="font-mono text-[10px] tracking-widest2 uppercase text-secondary hover:text-primary transition-colors duration-500"
          >
            ← go back in
          </button>
          <button
            data-testid="farewell-leave-btn"
            onClick={() => navigate("/")}
            className="px-10 py-4 bg-primary text-app font-mono text-[11px] tracking-widest2 uppercase hover:bg-white transition-colors duration-500"
          >
            leave the room
          </button>
        </div>
      </div>
    </div>
  );
}
