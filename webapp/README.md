# Web Tutor App

This directory contains a prototype web-based version of `tutor_loop.py`.
All backend parameters live in `backend/config.py` and are not exposed to
the frontend.

The backend uses FastAPI and serves a small JavaScript frontend that
records audio, sends it to the server and plays back GPT feedback.

## Running

```bash
cd webapp/backend
uvicorn main:app --reload
```

Then open `http://localhost:8000` in a browser.
