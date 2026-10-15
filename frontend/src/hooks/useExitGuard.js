import { useEffect, useState } from "react";

// Intercepts attempts to close/leave the screen and routes them through a
// gentle "Are you feeling better?" modal. On the web, we use beforeunload
// for tab-close and history manipulation for in-app back.
export default function useExitGuard({ enabled = true } = {}) {
  const [showExit, setShowExit] = useState(false);

  // Browser tab close / refresh
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);

  // Intercept in-app back button with a sentinel history entry
  useEffect(() => {
    if (!enabled) return undefined;
    window.history.pushState({ nolGuard: true }, "");
    const onPop = () => {
      setShowExit(true);
      // re-add sentinel so we keep intercepting until user confirms
      window.history.pushState({ nolGuard: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);

  const requestExit = () => setShowExit(true);
  const dismissExit = () => setShowExit(false);

  return { showExit, requestExit, dismissExit };
}
