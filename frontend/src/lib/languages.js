// code = browser speech-recognition language, name = what Echo replies in
export const LANGUAGES = [
  { code: "en-US", name: "English" },
  { code: "hi-IN", name: "Hindi" },
  { code: "es-ES", name: "Spanish" },
  { code: "fr-FR", name: "French" },
  { code: "de-DE", name: "German" },
  { code: "pt-BR", name: "Portuguese" },
  { code: "it-IT", name: "Italian" },
  { code: "ar-SA", name: "Arabic" },
  { code: "bn-IN", name: "Bengali" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "mr-IN", name: "Marathi" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "ur-PK", name: "Urdu" },
  { code: "ru-RU", name: "Russian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "zh-CN", name: "Chinese (Mandarin)" },
];

export const LANG_KEY = "nol_lang_v1";

export function defaultLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  const nav = (navigator.language || "en-US").toLowerCase();
  const match = LANGUAGES.find((l) => nav.startsWith(l.code.slice(0, 2).toLowerCase()));
  return match ? match.code : "en-US";
}
