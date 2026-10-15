import React from "react";

const LABELS = {
  angry: "Simmering",
  sad: "Heavy",
  anxious: "Tight",
  hopeful: "Rising",
  neutral: "Even",
};

const STYLES = {
  angry: {
    bg: "#2b1615",
    color: "#e8908a",
    border: "#4a2422",
  },
  sad: {
    bg: "#141829",
    color: "#8a9ae8",
    border: "#242a4a",
  },
  anxious: {
    bg: "#292418",
    color: "#e8cc8a",
    border: "#4a402a",
  },
  hopeful: {
    bg: "#1a241f",
    color: "#91c7a9",
    border: "#2d4238",
  },
  neutral: {
    bg: "#18181b",
    color: "#a1a1aa",
    border: "#27272a",
  },
};

export default function MoodBadge({ mood = "neutral" }) {
  const key = STYLES[mood] ? mood : "neutral";
  const s = STYLES[key];
  return (
    <span
      data-testid={`mood-badge-${key}`}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest2 uppercase px-2 py-[3px]"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        letterSpacing: "0.22em",
      }}
    >
      <span style={{ opacity: 0.6 }}>↳</span>
      <span>{LABELS[key]}</span>
    </span>
  );
}
