// code = browser locale, name = what Echo replies in, stt = Whisper hint, tts = voice language
export const LANGUAGES = [
  { code: "auto", name: "auto", label: "Any language (auto-detect)", stt: "auto", tts: null },
  { code: "hinglish", name: "Hinglish", label: "Hinglish (Hindi + English)", stt: "hinglish", tts: "hi" },
  { code: "en-US", name: "English", stt: "en", tts: "en" },
  { code: "hi-IN", name: "Hindi", stt: "hi", tts: "hi" },
  { code: "ta-IN", name: "Tamil", stt: "ta", tts: "ta" },
  { code: "te-IN", name: "Telugu", stt: "te", tts: "te" },
  { code: "bn-IN", name: "Bengali", stt: "bn", tts: "bn" },
  { code: "mr-IN", name: "Marathi", stt: "mr", tts: "mr" },
  { code: "gu-IN", name: "Gujarati", stt: "gu", tts: "gu" },
  { code: "ur-PK", name: "Urdu", stt: "ur", tts: "ur" },
  { code: "es-ES", name: "Spanish", stt: "es", tts: "es" },
  { code: "fr-FR", name: "French", stt: "fr", tts: "fr" },
  { code: "de-DE", name: "German", stt: "de", tts: "de" },
  { code: "pt-BR", name: "Portuguese", stt: "pt", tts: "pt" },
  { code: "it-IT", name: "Italian", stt: "it", tts: "it" },
  { code: "ar-SA", name: "Arabic", stt: "ar", tts: "ar" },
  { code: "ru-RU", name: "Russian", stt: "ru", tts: "ru" },
  { code: "ja-JP", name: "Japanese", stt: "ja", tts: "ja" },
  { code: "ko-KR", name: "Korean", stt: "ko", tts: "ko" },
  { code: "zh-CN", name: "Chinese (Mandarin)", stt: "zh", tts: "zh" },
];

export const LANG_KEY = "nol_lang_v2";

export const findLang = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

export function defaultLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  return saved && LANGUAGES.some((l) => l.code === saved) ? saved : "auto";
}
