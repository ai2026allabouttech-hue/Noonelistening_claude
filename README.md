# NoOneListening (standalone)

A quiet anonymous room where an AI listener called Echo hears you out. You can
type, or talk out loud and Echo answers in a human voice (woman's or man's).
This version does **not** need Emergent.

## What you need (all have free starts)
1. **MongoDB Atlas** (free "M0" cluster) for saving chats. Copy its connection string.
2. **Gemini key** from aistudio.google.com for the human voice.
3. **Claude key** from console.anthropic.com for Echo's thinking (recommended).
   For quick testing only, you can skip it and Gemini will do the thinking too.

## Run on your computer
Backend (a terminal):
    cd backend
    python -m venv venv
    source venv/bin/activate        (Windows: venv\Scripts\activate)
    pip install -r requirements.txt
    copy .env.example to .env, then fill it in
    uvicorn server:app --reload --port 8001

Frontend (a second terminal):
    cd frontend
    copy .env.example to .env
    npm install
    npm start
Open http://localhost:3000 in Chrome.

## Put it online
- **Backend** on Render or Railway (Python). Start command:
  `uvicorn server:app --host 0.0.0.0 --port $PORT` , root folder `backend`.
  Add the values from `.env.example` in the host's "Environment" settings.
- **Frontend** on Vercel or Netlify, root folder `frontend`, build command
  `npm run build`, output `build`. Add `REACT_APP_BACKEND_URL` = your backend address.
- Then set `CORS_ORIGINS` on the backend to your frontend address.

## Before real users arrive (important)
Free Gemini keys may let Google use what is sent to improve its products, and the
free plan is for testing, not commercial use. People here share private feelings,
so switch your Gemini key to a **paid plan** before launch and use Claude for
Echo's thinking.
Also: Chrome's built-in listening sends the person's audio to Google for
transcription, so say so in your privacy text.
