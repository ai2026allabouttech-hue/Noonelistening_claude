// Lightweight daily-reminder scheduling using the browser Notification API.
// Persists an opt-in + scheduled hour in localStorage; fires a timeout while
// the tab is alive. In a real Expo build this would be swapped for
// expo-notifications.

const KEY = "nol_reminder_v1";

export function getReminderState() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function clearReminder() {
  localStorage.removeItem(KEY);
  if (window.__nolReminderTimer) {
    clearTimeout(window.__nolReminderTimer);
    window.__nolReminderTimer = null;
  }
}

async function ensurePermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export async function enableDailyReminder(hour = 21) {
  const ok = await ensurePermission();
  if (!ok) return { ok: false, reason: "permission-denied" };

  const state = { enabled: true, hour, setAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(state));
  scheduleNext(hour);
  return { ok: true };
}

function scheduleNext(hour) {
  if (window.__nolReminderTimer) clearTimeout(window.__nolReminderTimer);
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;
  window.__nolReminderTimer = setTimeout(() => {
    try {
      new Notification("The room is still here.", {
        body: "Come back when you need to not be alone.",
        silent: true,
      });
    } catch {
      /* noop */
    }
    scheduleNext(hour);
  }, delay);
}

// Re-arm on page load if previously enabled
export function rearmReminderIfNeeded() {
  const s = getReminderState();
  if (s && s.enabled && "Notification" in window && Notification.permission === "granted") {
    scheduleNext(s.hour ?? 21);
  }
}
