import React, { useEffect } from "react";

export default function ExitModal({ open, onStay, onLeave }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="exit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center fade-in"
      style={{
        backgroundColor: "rgba(3,3,3,0.88)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
      }}
    >
      <div className="max-w-md w-full px-8 md:px-12 py-16 text-center">
        <p className="font-mono text-[10px] tracking-widest2 uppercase text-muted mb-10">
          before you go
        </p>
        <h2
          className="font-serif font-light text-4xl md:text-5xl leading-tight text-primary"
          style={{ letterSpacing: "-0.01em" }}
        >
          Are you feeling
          <br />
          a little better?
        </h2>
        <p className="mt-8 text-secondary text-base leading-relaxed max-w-sm mx-auto">
          No wrong answer. You don’t owe anyone progress.
        </p>

        <div className="mt-16 flex flex-col gap-5 items-center">
          <button
            data-testid="exit-modal-leave-btn"
            onClick={onLeave}
            className="px-10 py-4 font-mono text-[11px] tracking-widest2 uppercase bg-primary text-app hover:bg-white transition-colors duration-500"
          >
            Yes — I can leave
          </button>
          <button
            data-testid="exit-modal-stay-btn"
            onClick={onStay}
            className="font-mono text-[11px] tracking-widest2 uppercase text-secondary hover:text-primary transition-colors duration-500 py-2"
          >
            Not yet — I need to stay
          </button>
        </div>
      </div>
    </div>
  );
}
