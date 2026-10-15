# NoOneListening – PRD
## Original request
"run the file" (uploaded NoOneListening-standalone.zip), then fix bugs the user finds.
## Architecture
React (CRA/craco) frontend + FastAPI backend + local MongoDB. Echo chat via Claude (claude-sonnet-5-5) using Emergent Universal Key (EMERGENT_LLM_KEY branch in _ask_llm); ANTHROPIC_API_KEY / GEMINI_API_KEY still supported. Voice TTS = Gemini (needs user's GEMINI_API_KEY).
## Done (2026-06)
- Set up .env files, installed deps, app running in preview
- Added Emergent key support for Echo chat + mood
- Fixed mood classifier crash on empty LLM reply
- Testing: backend 27/27, frontend flows 100%
## Done (iteration 2)
- True Forgetting: DELETE /api/session/{id} wipes messages/vents/session; Farewell "leave the room" calls it + clears local identity
- Voice on with user's Gemini key (woman=Sulafat, man=Achird); typed chat has "echo replies in" text/woman/man choice; talk screen keeps its own choice
- Chat layout fixed height so voice row stays visible; audio race/URL leak fixed
- Testing: backend 33/33, frontend 100%
## Done (iteration 3)
- Man voice bug root cause: Gemini free tier 10 TTS/day exhausted (429). OpenAI TTS via Emergent key now primary (female=coral, male=onyx, tts-1), Gemini fallback
- Echo is voice-only (typed chat removed; /voice -> /echo); live transcript shown
- Multilingual: 18 languages picker; speech recognition lang + Echo replies in chosen language
- Testing: backend 42/42, frontend 100%
## Done (iteration 4-5)
- Voice: ElevenLabs eleven_flash_v2_5 primary (female Sarah EXAVITQu4vr4xnSDxMaL soft/warm, male Brian nPczCjzI2devNBz1zQrb), language_code passed; native Hindi library voices (Meher/Viraj) auto-used if plan upgraded (402 on free -> fallback). OpenAI TTS then Gemini as fallbacks
- Listening: MediaRecorder + silence detection -> /api/voice/transcribe (Whisper, Emergent key); Hinglish = language en + Roman prompt; tap orb to send
- Languages: Any (auto), Hinglish + 18 languages; Echo replies in same language/mix
- Speed: mood + reply in parallel
- Testing: iterations 4-5 100%
## Done (iteration 6)
- Voice preview: GET /api/voice/preview (per voice + language sample, Mongo-cached in voice_previews); "hear" buttons in chooser
- Native voices map: hi Meher/Viraj, ta Yazhini/Maneesh, te Madhavi/Jayesh; auto-used when ElevenLabs plan allows (402 -> fallback, retry hourly). Voices must be in user's ElevenLabs "My Voices"
- te/bn/mr/gu/ur use eleven_v4_turbo; Echo uses matching grammatical gender for chosen voice
## Backlog
- P1: auto-delete abandoned sessions (Mongo TTL index)
- P2: raise contrast of 10px muted labels; validate session_id; run mood + reply in parallel
