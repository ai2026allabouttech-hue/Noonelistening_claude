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
## Backlog
- P0: add user's GEMINI_API_KEY for voice
- P1: "Leave the room" should clear identity/history (clearIdentity unused)
- P2: raise contrast of 10px muted labels; validate session_id; run mood + reply in parallel
