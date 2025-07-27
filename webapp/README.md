# Web Tutor App

This directory contains a prototype of **Leesmaatje**, a web-based reading
tutor for young children built on top of `tutor_loop.py`.  The application
streams the learner's speech to the backend where pronunciation is analysed
and GPT generates encouraging feedback.  All backend parameters live in
`backend/config.py` and are not exposed to the frontend.

The backend uses FastAPI and serves a React frontend built with Vite.
Audio is streamed to the server in realtime while recording so analysis can
start immediately. Once recording stops the backend finalizes the analysis and
returns GPT feedback.

The GPT provider, model and temperature used for feedback can be
configured in `backend/config.py` via the `GPT_PROVIDER`, `GPT_MODEL`
and `GPT_TEMPERATURE` constants.  These values can also be provided
through the environment variables `GPT_TUTOR_PROVIDER`,
`GPT_TUTOR_MODEL` and `GPT_TUTOR_TEMPERATURE`.  The default provider is
`"openai"`, the default model is `"gpt-4o-mini"` and the default
temperature is `0.0` for deterministic answers.  When `GPT_PROVIDER` is
set to `"azure"` the environment variables `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_KEY` and `AZURE_OPENAI_DEPLOYMENT` must also be set to
point to your Azure OpenAI deployment.

## Running

```bash
cd react-frontend
npm install
npm run build
cd ..
```

Then start the backend:

```bash
python -m uvicorn webapp.backend.main:app --reload --no-access-log
```

Then open `http://localhost:8000` in a browser.

Set the realtime behaviour of each engine in `backend/config.py` via
`REALTIME_FLAGS`. When Azure engines run in realtime their interim results will
be printed to the console, just like in `tutor_loop.py`.
