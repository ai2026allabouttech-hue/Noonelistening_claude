import { useRef } from "react";

const SPEECH_RMS = 0.035; // louder than this = speaking
const SILENCE_MS = 1100; // this much quiet after speech = done talking
const MAX_MS = 45000;

// Records one utterance at a time with simple voice-activity detection.
export default function useUtteranceRecorder() {
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const recRef = useRef(null);
  const rafRef = useRef(null);
  const finishRef = useRef(null);

  async function ensureStream() {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return stream;
  }

  // Resolves with an audio Blob once the person stops talking (or null if cancelled).
  async function listenOnce({ onSpeechStart } = {}) {
    const stream = await ensureStream();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (m) => window.MediaRecorder?.isTypeSupported?.(m)
    );
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    return new Promise((resolve) => {
      let spoke = false;
      let lastLoud = 0;
      const started = performance.now();
      let cancelled = false;

      const finish = (cancel, manual = false) => {
        cancelled = cancel;
        if (manual) spoke = true; // a tap always sends what was recorded
        cancelAnimationFrame(rafRef.current);
        src.disconnect();
        if (rec.state !== "inactive") rec.stop();
      };
      finishRef.current = finish;

      rec.onstop = () => {
        recRef.current = null;
        finishRef.current = null;
        if (cancelled || !spoke) return resolve(null);
        resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (rms > SPEECH_RMS) {
          if (!spoke) onSpeechStart?.();
          spoke = true;
          lastLoud = now;
        }
        if (spoke && now - lastLoud > SILENCE_MS) return finish(false);
        if (now - started > MAX_MS) return finish(!spoke);
        rafRef.current = requestAnimationFrame(tick);
      };

      rec.start(250);
      rafRef.current = requestAnimationFrame(tick);
    });
  }

  // Send what was said so far right now.
  const stopNow = () => finishRef.current?.(false, true);
  const cancel = () => finishRef.current?.(true);

  function release() {
    cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }

  return { listenOnce, stopNow, cancel, release };
}
