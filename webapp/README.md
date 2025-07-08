# Web Tutor App

This directory contains a prototype web-based version of `tutor_loop.py`.
All backend parameters live in `backend/config.py` and are not exposed to
the frontend.

The backend uses FastAPI and serves a small JavaScript frontend. Audio is
streamed to the server in realtime while recording so analysis can start
immediately. Once recording stops the backend finalizes the analysis and
returns GPT feedback.

## Running

```bash
cd webapp/backend
uvicorn main:app --reload
```

Then open `http://localhost:8000` in a browser.
