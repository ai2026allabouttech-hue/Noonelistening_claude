import React, { useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { previewUrl } from "@/services/echoService";

// Small "hear" button that plays a cached sample of a voice in a language.
export default function VoicePreviewButton({ voice, sample, label }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | error
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current?.pause();
    setState("idle");
  }, [sample]);

  useEffect(() => {
    const onOther = (ev) => {
      if (ev.detail !== voice) {
        audioRef.current?.pause();
        setState("idle");
      }
    };
    window.addEventListener("nol-preview-play", onOther);
    return () => {
      window.removeEventListener("nol-preview-play", onOther);
      audioRef.current?.pause();
    };
  }, [voice]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (state === "playing" || state === "loading") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }
    window.dispatchEvent(new CustomEvent("nol-preview-play", { detail: voice }));
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setState("idle");
      audioRef.current.onerror = () => setState("error");
    }
    const a = audioRef.current;
    setState("loading");
    a.src = previewUrl(voice, sample);
    a.oncanplay = () => setState((s) => (s === "loading" ? "playing" : s));
    try {
      await a.play();
      setState("playing");
    } catch {
      setState("error");
    }
  };

  const Icon = state === "playing" ? Square : state === "loading" ? Loader2 : Play;
  return (
    <button
      type="button"
      data-testid={`voice-preview-${voice}`}
      onClick={toggle}
      aria-label={`hear ${label}`}
      className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] tracking-widest2 uppercase text-secondary hover:text-primary border border-transparent hover:border-border-subtle transition-colors duration-500"
    >
      <Icon size={12} className={state === "loading" ? "animate-spin" : ""} />
      {state === "playing" ? "stop" : state === "error" ? "try again" : "hear"}
    </button>
  );
}
