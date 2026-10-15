import { useCallback, useEffect, useRef, useState } from "react";

// Classify getUserMedia exceptions into actionable states. The DOMException
// name is the reliable signal; message/constraint varies by browser.
function classifyError(e) {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "permission-denied";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "no-device";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "device-busy";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "no-device";
  }
  if (name === "SecurityError") {
    return "insecure";
  }
  if (name === "TypeError") {
    // Happens on non-secure contexts where mediaDevices is missing.
    return "insecure";
  }
  return "mic-error";
}

// Mic management via the Web MediaRecorder API. Captures audio locally and
// returns amplitude samples for the SoundWave visualiser. No transcription,
// no upload of raw audio — purely cathartic.
export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null); // one of the classifyError strings
  const [errorDetail, setErrorDetail] = useState(null); // human detail for diagnostics
  const [level, setLevel] = useState(0); // 0..1 amplitude (rms)
  const [pitch, setPitch] = useState(0); // 0..1 spectral centroid normalized to 120..1200Hz
  const [elapsedMs, setElapsedMs] = useState(0);
  // Self-regulation: how long the user has been in the "calm zone"
  // (low amplitude + low pitch, sustained). Reaches CALM_TARGET_MS then latches.
  const [calmMs, setCalmMs] = useState(0);
  const [calmReached, setCalmReached] = useState(false);
  // Are we running inside an iframe? Browsers block mic in iframes without
  // an explicit `allow="microphone"` from the parent — very common in
  // embedded previews, which produces NotAllowedError with no prompt.
  const [isFramed] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true; // cross-origin access -> we are definitely framed
    }
  });

  // Live refs mirrored from the RAF loop so the slower interval can read
  // the smoothed values without causing extra renders.
  const levelRef = useRef(0);
  const pitchRef = useRef(0);
  const calmStartedAtRef = useRef(null);
  const calmLastBreakRef = useRef(0);
  const calmReachedRef = useRef(false);

  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      try {
        mediaRef.current.stop();
      } catch {
        /* noop */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    rafRef.current = null;
    tickRef.current = null;
    setIsRecording(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setErrorDetail(null);

    if (!window.isSecureContext) {
      setError("insecure");
      setErrorDetail("requires a secure (https) connection");
      return false;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("mic-unsupported");
      setErrorDetail("this browser doesn't expose the microphone api");
      return false;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const kind = classifyError(e);
      setError(kind);
      setErrorDetail(e?.message || e?.name || null);
      return false;
    }
    streamRef.current = stream;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      // iOS Safari: AudioContext starts in "suspended" state; resume inside
      // the user gesture that triggered start().
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* noop */
        }
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = ctx.sampleRate || 44100;
      const binHz = sampleRate / analyser.fftSize;
      const tickAmp = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const clampedLevel = Math.min(1, rms * 2.2);
        setLevel(clampedLevel);
        levelRef.current = clampedLevel;

        // Spectral centroid → normalized "pitch" (0..1)
        analyser.getByteFrequencyData(freqBuf);
        let weighted = 0;
        let total = 0;
        // Only consider human voice range (~80Hz..2000Hz) to ignore noise
        const lowBin = Math.max(1, Math.floor(80 / binHz));
        const highBin = Math.min(freqBuf.length - 1, Math.ceil(2000 / binHz));
        for (let i = lowBin; i <= highBin; i++) {
          const mag = freqBuf[i];
          weighted += mag * i;
          total += mag;
        }
        if (total > 0) {
          const centroidBin = weighted / total;
          const centroidHz = centroidBin * binHz;
          // map 120Hz..1200Hz → 0..1 (log-ish but linear is fine for vibe)
          const norm = (centroidHz - 120) / (1200 - 120);
          const p = Math.max(0, Math.min(1, norm));
          setPitch(p);
          pitchRef.current = p;
        }

        rafRef.current = requestAnimationFrame(tickAmp);
      };
      rafRef.current = requestAnimationFrame(tickAmp);

      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      mr.start();

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setCalmMs(0);
      setCalmReached(false);
      calmStartedAtRef.current = null;
      calmLastBreakRef.current = Date.now();
      tickRef.current = setInterval(() => {
        const now = Date.now();
        setElapsedMs(now - startedAtRef.current);

        // Calm zone: amplitude is low AND pitch is low (relaxed register).
        // We allow brief blips — a single spike won't reset the streak, but
        // sustained excitement will.
        const CALM_LEVEL = 0.15;
        const CALM_PITCH = 0.42;
        const CALM_TARGET_MS = 20000;
        const inCalm =
          levelRef.current < CALM_LEVEL && pitchRef.current < CALM_PITCH;

        if (inCalm) {
          if (calmStartedAtRef.current == null) {
            calmStartedAtRef.current = now;
          }
          const streak = now - calmStartedAtRef.current;
          setCalmMs(streak);
          if (streak >= CALM_TARGET_MS && !calmReachedRef.current) {
            calmReachedRef.current = true;
            setCalmReached(true);
          }
        } else {
          // Outside calm zone — grace period of 1.2s before resetting the streak.
          if (calmStartedAtRef.current != null) {
            if (now - calmLastBreakRef.current > 1200) {
              calmStartedAtRef.current = null;
              setCalmMs(0);
            }
          }
          calmLastBreakRef.current = now;
        }
      }, 200);

      setIsRecording(true);
      return true;
    } catch (e) {
      setError(classifyError(e));
      setErrorDetail(e?.message || e?.name || null);
      stop();
      return false;
    }
  }, [stop]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorDetail(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    isRecording,
    level,
    pitch,
    elapsedMs,
    calmMs,
    calmReached,
    calmTargetMs: 20000,
    error,
    errorDetail,
    isFramed,
    clearError,
    start,
    stop,
  };
}
