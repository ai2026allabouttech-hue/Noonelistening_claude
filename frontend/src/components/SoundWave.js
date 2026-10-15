import React, { useEffect, useRef, useState } from "react";

/**
 * A living waveform + heartbeat pulse.
 *
 * Props:
 *  - active: boolean — mic is on
 *  - level:  0..1    — instantaneous amplitude (RMS)
 *  - pitch:  0..1    — normalized spectral centroid (voice pitch)
 *
 * Feel: lines always "breathe" subtly so the user knows the room is listening.
 * When they speak, amplitude grows the curve height, pitch tightens the wiggles.
 * A central ring pulses with each voice burst — the "heartbeat" of the room.
 */
export default function SoundWave({
  active = false,
  level = 0,
  pitch = 0,
  calmProgress = 0, // 0..1 — how close the user is to sustained calm
  calmReached = false,
}) {
  // Smooth the incoming values so the wave flows, doesn't jitter.
  const smoothLevel = useRef(0);
  const smoothPitch = useRef(0);
  const phase = useRef(0);
  const lastPeak = useRef(0);
  const [peakFlash, setPeakFlash] = useState(0); // visual ack of a voice burst
  const [paths, setPaths] = useState(() => buildPaths(0, 0, 0));
  const [beat, setBeat] = useState(0); // 0..1 current heartbeat size
  const rafRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const loop = (t) => {
      if (!mounted) return;
      // Exponential smoothing
      const lv = active ? level : 0;
      const pt = active ? pitch : 0;
      smoothLevel.current += (lv - smoothLevel.current) * 0.18;
      smoothPitch.current += (pt - smoothPitch.current) * 0.08;

      // Baseline breath: slow phase advance; faster if pitch is higher
      const pitchFactor = 0.3 + smoothPitch.current * 1.4;
      phase.current += 0.008 * (active ? 1 + smoothLevel.current * 4 : 1) * pitchFactor;

      // Heartbeat pulse: when amplitude crosses a threshold, fire a flash.
      const lvl = smoothLevel.current;
      if (lvl > 0.14 && t - lastPeak.current > 160) {
        lastPeak.current = t;
        setPeakFlash((f) => f + 1); // bump a counter -> triggers CSS key change
      }

      // Beat size: idle breath (0.35..0.55) or reactive
      const idleBreath = 0.42 + Math.sin(t / 1400) * 0.08;
      const reactive = 0.45 + lvl * 0.9;
      setBeat(active ? Math.max(idleBreath, reactive) : idleBreath * 0.7);

      setPaths(buildPaths(phase.current, lvl, smoothPitch.current));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, level, pitch]);

  const width = 320;
  const height = 160;
  const mid = height / 2;

  // Heartbeat ring sizing
  const ringR = 14 + beat * 34;
  const ringOpacity = active ? 0.25 + beat * 0.55 : 0.18;

  return (
    <div
      data-testid="sound-wave"
      className="relative flex items-center justify-center select-none"
      style={{ width, height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="overflow-visible absolute inset-0"
        aria-hidden
      >
        {/* Outer breath ring — always present, reassures the user the room is alive */}
        <circle
          cx={width / 2}
          cy={mid}
          r={ringR + 22}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth="0.5"
          opacity={active ? 0.1 + beat * 0.15 : 0.05}
        />

        {/* Calm progress arc — a quiet ring that fills as the user sustains
            low-amplitude, low-pitch speech. When it closes, they've "earned" a
            moment of recognition. The arc lives just outside the breath ring. */}
        {active && (calmProgress > 0 || calmReached) && (
          <CalmArc
            cx={width / 2}
            cy={mid}
            r={ringR + 38}
            progress={calmReached ? 1 : Math.min(1, calmProgress)}
          />
        )}
        {/* Heartbeat ring */}
        <circle
          cx={width / 2}
          cy={mid}
          r={ringR}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth="1"
          opacity={ringOpacity}
          style={{ transition: "r 120ms linear, opacity 120ms linear" }}
        />
        {/* Core dot — our "heartbeat" at rest */}
        <circle
          cx={width / 2}
          cy={mid}
          r={2.5 + beat * 2.2}
          fill="#f4f4f5"
          opacity={active ? 0.85 : 0.5}
        />

        {/* 5 layered breathing wavelines */}
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#f4f4f5"
            strokeWidth={i === 2 ? 1.1 : 0.7}
            strokeLinecap="round"
            opacity={
              (active ? 0.18 : 0.09) + (i === 2 ? 0.2 : 0.06) + smoothLevel.current * 0.35
            }
          />
        ))}
      </svg>

      {/* Heard-pulse flash (tiny dot that flickers on each speech burst) */}
      <div
        key={peakFlash}
        aria-hidden
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: "50%",
          background: "#f4f4f5",
          pointerEvents: "none",
          animation: peakFlash > 0 ? "heard-flash 0.6s ease-out forwards" : "none",
        }}
      />
      <style>{`
        @keyframes heard-flash {
          0%   { transform: scale(1);   opacity: 0.9; }
          100% { transform: scale(7);   opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

// Build 5 horizontal curves. Amplitude grows with `level`, wiggle frequency
// grows with `pitch`. A tiny phase offset per line gives a layered shimmer.
function buildPaths(phase, level, pitch) {
  const width = 320;
  const mid = 80;
  const amp = 4 + level * 46; // peak amplitude in px
  const wiggles = 2 + pitch * 6; // how many oscillations across the width
  const segments = 64;

  return [0, 1, 2, 3, 4].map((lineIdx) => {
    const lineOffset = (lineIdx - 2) * (1.2 + level * 3.2);
    const lineAmp = amp * (lineIdx === 2 ? 1 : 0.55 - Math.abs(lineIdx - 2) * 0.12);
    const phaseOffset = phase + lineIdx * 0.35;

    let d = `M 0 ${mid + lineOffset}`;
    for (let i = 1; i <= segments; i++) {
      const x = (i / segments) * width;
      const theta = (i / segments) * wiggles * Math.PI * 2 + phaseOffset;
      // A little envelope so the wave fades at the edges (doesn't feel clipped)
      const edge = Math.sin((i / segments) * Math.PI);
      const y = mid + lineOffset + Math.sin(theta) * lineAmp * edge;
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  });
}

// A thin circular arc that fills clockwise from the top as `progress` grows.
// Renders with stroke-dasharray so it's cheap and animates smoothly.
function CalmArc({ cx, cy, r, progress }) {
  const circumference = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, progress)) * circumference;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="#f4f4f5"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeDasharray={`${dash} ${circumference - dash}`}
      strokeDashoffset={circumference / 4} /* start at 12 o'clock */
      opacity={0.22 + progress * 0.28}
      style={{ transition: "stroke-dasharray 240ms linear, opacity 500ms ease-out" }}
    />
  );
}
