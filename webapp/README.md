# Web Tutor App

This directory contains a prototype of **Leesmaatje**, a web-based reading
tutor for young children built on top of `tutor_loop.py`.  The application
streams the learner's speech to the backend where pronunciation is analysed
and GPT generates encouraging feedback.  All backend parameters live in
`backend/config.py` and are not exposed to the frontend.

The backend uses FastAPI and serves a small JavaScript frontend. Audio is
streamed to the server in realtime while recording so analysis can start
immediately. Once recording stops the backend finalizes the analysis and
returns GPT feedback.

## Running

```bash
python -m uvicorn webapp.backend.main:app --reload --no-access-log
```

Then open `http://localhost:8000` in a browser.

Set the realtime behaviour of each engine in `backend/config.py` via
`REALTIME_FLAGS`. When Azure engines run in realtime their interim results will
be printed to the console, just like in `tutor_loop.py`.
