from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import tempfile

from . import config
from .analysis_pipeline import analyze_audio
from .tts import tts_to_file
from tutor import prompt_builder, gpt_client

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend")), name="static")

sent_index = 0
models_ready = False


@app.get("/")
async def root():
    index_path = os.path.join(os.path.dirname(__file__), "../frontend/index.html")
    return HTMLResponse(open(index_path).read())


@app.post("/api/initialize_models")
async def initialize_models():
    global models_ready
    # Trigger lazy loading of wav2vec2 models
    from FASE2_wav2vec2_process import _load_asr_model, _load_phoneme_model
    _load_asr_model("cpu")
    _load_phoneme_model("cpu")
    models_ready = True
    return {"status": "ok"}


@app.get("/api/next_sentence")
async def next_sentence():
    global sent_index
    if sent_index >= len(config.SENTENCES):
        sent_index = 0
    sentence = config.SENTENCES[sent_index]
    sent_index += 1
    return {"sentence": sentence}


@app.post("/api/process")
async def process(sentence: str, file: UploadFile = File(...)):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    wav_bytes = await file.read()
    results = analyze_audio(wav_bytes, sentence)
    _, messages = prompt_builder.build(results, state={})
    tutor_resp = await gpt_client.chat(messages)

    filler_text = f"De zin was {sentence}"
    filler_audio = tts_to_file(filler_text)
    feedback_audio = tts_to_file(tutor_resp.feedback_text)

    return JSONResponse({
        "feedback_text": tutor_resp.feedback_text,
        "filler_audio": os.path.basename(filler_audio),
        "feedback_audio": os.path.basename(feedback_audio),
        "delay_seconds": config.DELAY_SECONDS,
    })


@app.get("/api/audio/{name}")
async def get_audio(name: str):
    path = os.path.join(tempfile.gettempdir(), name)
    return FileResponse(path, media_type="audio/wav")
