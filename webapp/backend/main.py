from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import tempfile
import shutil
import sqlite3
import json

from . import config, storage
from .analysis_pipeline import analyze_audio
from .tts import tts_to_file
from tutor import prompt_builder, gpt_client
from .realtime import RealtimeSession

sessions: dict[str, RealtimeSession] = {}

app = FastAPI()
storage.init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend")), name="static")

sent_index = 0
models_ready = False


@app.post("/api/register")
async def register(username: str = Form(...), password: str = Form(...)):
    try:
        tid = storage.create_teacher(username, password)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="User exists")
    return {"teacher_id": tid}


@app.post("/api/login")
async def login(username: str = Form(...), password: str = Form(...)):
    tid = storage.authenticate_teacher(username, password)
    if tid is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"teacher_id": tid}


@app.post("/api/register_student")
async def register_student(
    username: str = Form(...),
    password: str = Form(...),
    teacher_id: int | None = Form(None),
):
    if teacher_id is not None and not storage.teacher_exists(teacher_id):
        raise HTTPException(status_code=400, detail="Class code not found")
    try:
        sid = storage.create_student(username, password, teacher_id)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="User exists")
    return {"student_id": sid}


@app.post("/api/login_student")
async def login_student(
    username: str = Form(...),
    password: str = Form(...),
    teacher_id: int | None = Form(None),
):
    sid, tid = storage.authenticate_student(username, password)
    if sid is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if teacher_id is not None:
        if not storage.teacher_exists(teacher_id):
            raise HTTPException(status_code=400, detail="Class code not found")
        if tid != teacher_id:
            raise HTTPException(status_code=401, detail="Invalid class code")
    return {"student_id": sid, "teacher_id": tid}


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
    total = len(config.SENTENCES)
    if sent_index >= total:
        sent_index = 0
    sentence = config.SENTENCES[sent_index]
    sent_index += 1
    return {
        "sentence": sentence,
        "index": sent_index,
        "total": total,
    }


@app.get("/api/results/{teacher_id}")
async def get_results(teacher_id: int):
    return storage.list_results(teacher_id)


@app.get("/api/student_results/{student_id}")
async def get_student_results(student_id: int):
    return storage.list_student_results(student_id)


@app.get("/api/result/{res_id}")
async def get_result(res_id: str):
    r = storage.get_result(res_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    r["json_data"] = json.loads(r["json_data"])
    return r


@app.post("/api/process")
async def process(sentence: str = Form(...), file: UploadFile = File(...), teacher_id: int = Form(1), student_id: int = Form(0)):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    wav_bytes = await file.read()
    results = analyze_audio(wav_bytes, sentence)
    _, messages = prompt_builder.build(results, state={})
    tutor_resp = await gpt_client.chat(messages)

    filler_text = f"De zin was {sentence}"
    filler_audio = tts_to_file(filler_text)
    feedback_audio = tts_to_file(tutor_resp.feedback_text)

    dest_audio = storage.STORAGE_DIR / f"{results['session_id']}.wav"
    shutil.move(results["audio_file"], dest_audio)
    storage.save_result(teacher_id, student_id, results, str(dest_audio))

    return JSONResponse({
        "feedback_text": tutor_resp.feedback_text,
        "filler_audio": os.path.basename(filler_audio),
        "feedback_audio": os.path.basename(feedback_audio),
        "delay_seconds": config.DELAY_SECONDS,
    })


@app.get("/api/audio/{name}")
async def get_audio(name: str):
    temp_path = os.path.join(tempfile.gettempdir(), name)
    if os.path.exists(temp_path):
        return FileResponse(temp_path, media_type="audio/wav")
    stored = storage.STORAGE_DIR / name
    if stored.exists():
        return FileResponse(stored, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Audio not found")


@app.post("/api/realtime/start")
async def realtime_start(sentence: str = Form(...), sample_rate: int = Form(16000), teacher_id: int = Form(1), student_id: int = Form(0)):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    filler_text = f"De zin was {sentence}"
    filler_audio = tts_to_file(filler_text)
    sess = RealtimeSession(sentence, sample_rate, filler_audio=filler_audio, teacher_id=teacher_id, student_id=student_id)
    sessions[sess.id] = sess
    return {
        "session_id": sess.id,
        "filler_audio": os.path.basename(filler_audio),
        "delay_seconds": config.DELAY_SECONDS,
    }


@app.post("/api/realtime/chunk/{sid}")
async def realtime_chunk(sid: str, file: UploadFile = File(...)):
    sess = sessions.get(sid)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session")
    data = await file.read()
    sess.add_chunk(data)
    return {"status": "ok"}


@app.post("/api/realtime/stop/{sid}")
async def realtime_stop(sid: str):
    sess = sessions.pop(sid, None)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session")
    results = sess.stop()
    _, messages = prompt_builder.build(results, state={})
    tutor_resp = await gpt_client.chat(messages)
    feedback_audio = tts_to_file(tutor_resp.feedback_text)

    dest_audio = storage.STORAGE_DIR / f"{results['session_id']}.wav"
    shutil.move(results["audio_file"], dest_audio)
    storage.save_result(sess.teacher_id, sess.student_id, results, str(dest_audio))
    return JSONResponse({
        "feedback_text": tutor_resp.feedback_text,
        "filler_audio": os.path.basename(sess.filler_audio) if sess.filler_audio else None,
        "feedback_audio": os.path.basename(feedback_audio),
        "delay_seconds": config.DELAY_SECONDS,
    })
