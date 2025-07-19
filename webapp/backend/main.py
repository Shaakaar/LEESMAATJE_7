from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse
import json
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import shutil
import sqlite3

from . import config, storage

# Heavy dependencies such as the analysis pipeline, text to speech and
# realtime processing pull in a number of third party libraries.  Importing
# them at module import time means the whole application fails to start when
# those libraries are missing (for example in development or testing
# environments).  To ensure that lightweight endpoints like the login API work
# without requiring the full stack, these modules are imported lazily within the
# endpoints that actually need them.

# Import helper modules from the repository root
import prompt_builder
import gpt_client

# `sessions` will map realtime session ids to RealtimeSession objects.  The
# class itself is imported lazily in `realtime_start` to avoid importing heavy
# dependencies when they are not installed.
sessions: dict[str, object] = {}
# Path to the pre-generated "De zin was" clip. Generated on-demand in
# `start_story` and reused for all sessions.
filler_phrase_audio: str | None = None

app = FastAPI()
storage.init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory containing the frontend files that are served statically
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend")

# Serve the main frontend assets
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
# Serve the bundled Lucide icon font
app.mount(
    "/static/lucide",
    StaticFiles(directory=os.path.join(frontend_dir, "lucide")),
    name="lucide",
)

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
    """Load heavy wav2vec2 models once.

    The models are cached in :func:`_load_asr_model` and
    :func:`_load_phoneme_model`, so calling them here ensures subsequent
    requests reuse the same instances.  When CUDA is available the models are
    loaded on the GPU, otherwise they fall back to the CPU.
    """

    global models_ready
    from FASE2_wav2vec2_process import _load_asr_model, _load_phoneme_model
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"

    _load_asr_model(device)
    _load_phoneme_model(device)
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


@app.get("/api/prev_sentence")
async def prev_sentence():
    global sent_index
    total = len(config.SENTENCES)
    sent_index = (sent_index - 2) % total
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


@app.get("/api/student_summaries/{teacher_id}")
async def get_student_summaries(teacher_id: int):
    return storage.list_student_summaries(teacher_id)


@app.get("/api/result/{res_id}")
async def get_result(res_id: str):
    r = storage.get_result(res_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r


@app.post("/api/process")
async def process(
    sentence: str = Form(...),
    file: UploadFile = File(...),
    teacher_id: int = Form(1),
    student_id: int = Form(0),
):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    wav_bytes = await file.read()
    # Import heavy modules lazily to avoid requiring them when only the
    # authentication endpoints are used.
    from .analysis_pipeline import analyze_audio
    from .tts import tts_to_file

    results = analyze_audio(wav_bytes, sentence)
    req, messages = prompt_builder.build(results, state={})
    tutor_resp = await gpt_client.chat(messages)

    filler_text = f"De zin was {sentence}"
    filler_audio = tts_to_file(filler_text)
    feedback_audio = tts_to_file(tutor_resp.feedback_text)

    results["correct"] = tutor_resp.is_correct

    dest_audio = storage.STORAGE_DIR / f"{results['session_id']}.wav"
    shutil.move(results["audio_file"], dest_audio)
    storage.save_result(
        teacher_id,
        student_id,
        results,
        str(dest_audio),
        req.model_dump_json(),
    )

    return JSONResponse(
        {
            "feedback_text": tutor_resp.feedback_text,
            "filler_audio": os.path.basename(filler_audio),
            "feedback_audio": os.path.basename(feedback_audio),
            "correct": tutor_resp.is_correct,
            "errors": [e.model_dump(by_alias=True) for e in tutor_resp.errors],
            "delay_seconds": config.DELAY_SECONDS,
        }
    )


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
async def realtime_start(
    sentence: str = Form(...),
    sample_rate: int = Form(16000),
    teacher_id: int = Form(1),
    student_id: int = Form(0),
    session_id: str | None = Form(None),
):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    # Import heavy modules lazily
    from .realtime import RealtimeSession
    if session_id and session_id in sessions:
        sess = sessions[session_id]
        new_id = sess.reset(sentence)
        if new_id != session_id:
            sessions.pop(session_id, None)
            sessions[new_id] = sess
    else:
        sess = RealtimeSession(
            sentence,
            sample_rate,
            filler_audio=None,
            teacher_id=teacher_id,
            student_id=student_id,
        )
        sessions[sess.id] = sess
    return {
        "session_id": sess.id,
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
    sess = sessions.get(sid)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session")
    results = sess.stop()
    req, messages = prompt_builder.build(results, state={})
    tutor_resp = await gpt_client.chat(messages)
    from .tts import tts_to_file

    feedback_audio = tts_to_file(tutor_resp.feedback_text)

    results["correct"] = tutor_resp.is_correct

    dest_audio = storage.STORAGE_DIR / f"{results['session_id']}.wav"
    shutil.move(results["audio_file"], dest_audio)
    storage.save_result(
        sess.teacher_id,
        sess.student_id,
        results,
        str(dest_audio),
        req.model_dump_json(),
    )
    return JSONResponse(
        {
            "feedback_text": tutor_resp.feedback_text,
            "filler_audio": (
                os.path.basename(sess.filler_audio) if sess.filler_audio else None
            ),
            "feedback_audio": os.path.basename(feedback_audio),
            "correct": tutor_resp.is_correct,
            "errors": [e.model_dump(by_alias=True) for e in tutor_resp.errors],
            "delay_seconds": config.DELAY_SECONDS,
        }
    )


# ---------------------------------------------------------------------------
# New endpoints for the interactive story feature
# ---------------------------------------------------------------------------


@app.get("/api/start_story")
async def start_story(theme: str, level: str):
    """Pre-generate TTS audio for the first story section.

    Returns events in Server Sent Event format to report progress.
    """
    story = config.STORIES.get(theme, {}).get(level)
    if not story:
        raise HTTPException(status_code=400, detail="Story not found")

    from .tts import tts_to_file

    async def event_stream():
        global filler_phrase_audio
        if filler_phrase_audio is None:
            filler_phrase_audio = tts_to_file("De zin was")
        yield {
            "event": "filler",
            "data": json.dumps({"audio": os.path.basename(filler_phrase_audio)}),
        }
        total = len(story["section1"]) + len(story["directions"])
        done = 0
        for sent in story["section1"]:
            audio = tts_to_file(sent)
            word_audios = [os.path.basename(tts_to_file(w)) for w in sent.split()]
            yield {
                "event": "sentence",
                "data": json.dumps(
                    {
                        "type": "sentence",
                        "text": sent,
                        "audio": os.path.basename(audio),
                        "words": word_audios,
                    }
                ),
            }
            done += 1
            yield {"event": "progress", "data": str(done / total)}
        for direc in story["directions"]:
            audio = tts_to_file(direc)
            yield {
                "event": "direction",
                "data": json.dumps(
                    {
                        "type": "direction",
                        "text": direc,
                        "audio": os.path.basename(audio),
                    }
                ),
            }
            done += 1
            yield {"event": "progress", "data": str(done / total)}
        yield {"event": "complete", "data": "ok"}

    return EventSourceResponse(event_stream())


@app.get("/api/continue_story")
async def continue_story(theme: str, level: str, direction: str, mistakes: str | None = None):
    """Generate the next story section based on the chosen direction."""

    letters = []
    if mistakes:
        try:
            letters = json.loads(mistakes)
        except Exception:
            letters = []

    import openai

    client = openai.AsyncOpenAI()

    sys_prompt = (
        "Je bent een verhalenverteller voor jonge kinderen. "
        "Antwoord in JSON met de sleutels 'sentences' (lijst van zinnen) "
        "en 'directions' (lijst van twee keuzes)."
    )
    user_prompt = (
        f"We zijn bezig met een verhaal in het thema {theme} op niveau {level}. "
        f"Het verhaal gaat verder in de richting: {direction}. "
        "Schrijf vijf korte zinnen voor het vervolg. "
        + (f"Verwerk waar mogelijk deze letters of klanken: {', '.join(letters)}. " if letters else "")
        + "Geef daarna twee nieuwe keuzes voor het vervolg."
    )

    resp = await client.chat.completions.create(
        model=config.GPT_MODEL,
        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
        response_format={"type": "json_object"},
    )

    try:
        j = json.loads(resp.choices[0].message.content)
        sentences = j.get("sentences", [])
        directions = j.get("directions", [])
    except Exception:
        sentences = []
        directions = []

    from .tts import tts_to_file

    async def event_stream():
        total = len(sentences) + len(directions)
        done = 0
        for sent in sentences:
            audio = tts_to_file(sent)
            word_audios = [os.path.basename(tts_to_file(w)) for w in sent.split()]
            yield {
                "event": "sentence",
                "data": json.dumps({
                    "type": "sentence",
                    "text": sent,
                    "audio": os.path.basename(audio),
                    "words": word_audios,
                }),
            }
            done += 1
            yield {"event": "progress", "data": str(done / total)}
        for direc in directions:
            audio = tts_to_file(direc)
            yield {
                "event": "direction",
                "data": json.dumps({
                    "type": "direction",
                    "text": direc,
                    "audio": os.path.basename(audio),
                }),
            }
            done += 1
            yield {"event": "progress", "data": str(done / total)}
        yield {"event": "complete", "data": "ok"}

    return EventSourceResponse(event_stream())
