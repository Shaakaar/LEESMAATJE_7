from fastapi import (
    FastAPI,
    File,
    UploadFile,
    HTTPException,
    Form,
    Request,
    BackgroundTasks,
)
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from sse_starlette.sse import EventSourceResponse
import json
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import shutil
import sqlite3
import asyncio
from rich.console import Console
from pydantic import BaseModel

from . import config, storage
from .session_manager import EnginePool

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
engine_pool = EnginePool()

console = Console()

app = FastAPI()
storage.init_db()

# Pre-generated filler audio clip used between recordings
FILLER_AUDIO_BASENAME = "de_zin_was.wav"
FILLER_AUDIO_PATH = storage.STORAGE_DIR / FILLER_AUDIO_BASENAME

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory containing the frontend files that are served statically
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.abspath(os.path.join(current_dir, "../frontend-legacy"))
react_dir = os.path.abspath(os.path.join(current_dir, "../../frontend-react/dist"))

# Log frontend paths for debugging
print(f"Static frontend directory: {frontend_dir}")
print(f"React build directory: {react_dir}")

# Serve the React build before the legacy frontend so that
# requests to ``/static/react`` aren't intercepted by the ``/static`` mount.
app.mount("/static/react", StaticFiles(directory=react_dir), name="react")
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
# Serve the bundled Lucide icon font
app.mount(
    "/static/lucide",
    StaticFiles(directory=os.path.join(frontend_dir, "lucide")),
    name="lucide",
)

sent_index = 0
models_ready = False


def _dump_prompt(prompt_text: str, json_text: str) -> None:
    try:
        console.rule("[bold green]System Prompt[/bold green]")
        console.print(prompt_text)
        console.rule("[bold green]JSON Request[/bold green]")
        console.print_json(json_text)
    except Exception:
        # Never crash the server on logging issues
        pass


def _print_timeline(results: dict) -> None:
    """Print backend and frontend timing deltas if present."""

    def _delta(tl: dict, a: str, b: str) -> float | None:
        return tl[b] - tl[a] if a in tl and b in tl else None

    tb = results.get("timeline_backend", {})
    tf = results.get("timeline_frontend", {})

    print("Backend timings (ms):")
    for a, b, label in [
        ("/start_in", "engine_reset_done", "engine reset"),
        ("azure_start_called", "azure_start_returned", "azure start call"),
        ("azure_start_called", "azure_handshake_first_event", "azure handshake"),
        ("first_chunk_received", "azure_first_write", "azure first write"),
        ("w2v2_ready_ph", "w2v2_first_decode", "w2v2 first decode"),
        ("/stop_in", "json_ready", "/stop roundtrip"),
    ]:
        d = _delta(tb, a, b)
        if d is not None:
            print(f"  {label}: {d:.1f} ms")

    print("\nFrontend timings (ms):")
    for a, b, label in [
        ("ui_click", "start_req_sent", "click to /start"),
        ("start_req_sent", "start_resp_ok", "/start roundtrip"),
        ("mic_ready", "worklet_loaded", "mic to worklet"),
        ("processor_ready", "first_chunk_captured", "processor ready"),
        ("first_chunk_captured", "first_chunk_sent", "capture to send"),
    ]:
        d = _delta(tf, a, b)
        if d is not None:
            print(f"  {label}: {d:.1f} ms")


def get_system_prompt_by_level(level: str) -> str:
    lv = (level or "").lower()
    def base(max_words_upper: int) -> str:
        return (
            "Je bent een Nederlandse verhalenmaker voor kinderen die leren lezen.\n"
            "Doel: schrijf korte, begrijpelijke mini-verhaaltjes die kinderen helpen oefenen met lezen.\n\n"
            "STIJL:\n"
            "• Alleen tegenwoordige tijd.\n"
            "• Alleen correcte Nederlandse spelling en grammatica.\n"
            "• Alleen een punt (.) als leesteken — geen vraagtekens, uitroeptekens of aanhalingstekens.\n"
            f"• Korte zinnen van 3–{max_words_upper} woorden.\n"
            "• Gevarieerde werkwoorden; vermijd herhaling van dezelfde stam.\n"
            "• Namen mogen; houd ze consequent binnen het verhaal.\n"
            "• Vermijd ingewikkelde zinsbouw (geen bijzinnen of inversie).\n"
            "• Laat kinderen zich de scène kunnen voorstellen (kleur, geluid, beweging).\n\n"
            "STRUCTUUR PER BEURT:\n"
            "• Vijf zinnen vormen één logisch mini-verhaal.\n"
            "• Zin 1–2 voeren de gekozen richting echt uit.\n"
            "• Zin 3–5 bouwen logisch verder en eindigen met een klein spanningsmoment.\n\n"
            "KEUZES:\n"
            "• Geef daarna precies twee richtingzinnen (2–4 woorden), gebiedende wijs, logisch en evenwaardig.\n\n"
            "FOCUSKLANKEN:\n"
            "• Gebruik minstens 3 woorden in het verhaal die een focusklank bevatten (meegegeven door de gebruiker).\n"
            "• Gebruik ze als lettergroep in echte Nederlandse woorden (bijv. [aa] in \"maan\").\n\n"
            "UITVOER (STRICT JSON):\n"
            "{\n"
            "  \"sentences\": [5 korte zinnen],\n"
            "  \"directions\": [2 korte keuzes]\n"
            "}\n"
            "Geen uitleg, geen extra tekst, geen markdown."
        )
    if "start" in lv:
        return base(7)
    if "m3" in lv:
        return base(8)
    if "e3" in lv:
        return base(9)
    if "m4" in lv:
        return base(10)
    if "e4" in lv:
        return base(12)
    return base(8)


def build_allowed_rule(level: str, allowed_list: list[str], strict_forbid: bool) -> str:
    if strict_forbid or "start" in (level or "").lower():
        return (
            "• Gebruik uitsluitend woorden die volledig zijn opgebouwd uit deze letters/klanken: "
            f"[{', '.join(allowed_list)}]. Andere letters/klanken zijn VERBODEN."
        )
    return (
        "• Je mag daarnaast ook andere eerder geleerde letters/klanken gebruiken: "
        f"[{', '.join(allowed_list)}]"
    )


def build_focus_rule(focus_list: list[str]) -> str:
    uniq = [x.strip() for x in dict.fromkeys(focus_list) if x.strip()]
    if not uniq:
        return ""
    return (
        "• Gebruik minstens 3 keer een klank uit deze lijst in de 5 zinnen: "
        f"[{', '.join(uniq)}]"
    )


def build_user_prompt_story(
    theme: str,
    direction: str,
    story: str,
    level: str,
    focus_list: list[str],
    allowed_list: list[str],
    patterns_list: list[str],
    max_words: int,
    strict_forbid: bool,
) -> str:
    parts = [
        f"Thema (optioneel): {theme}",
        f"Richting die is gekozen: {direction}",
        f"Verhaal tot nu toe: \"{story or ''}\"",
        "",
        "KLANKEN EN STRUCTUREN:",
        build_focus_rule(focus_list),
        build_allowed_rule(level, allowed_list, strict_forbid),
        f"• Toegestane woordstructuren (informatief): [{', '.join(p for p in patterns_list if p.strip())}]",
        f"• Maximaal {max_words} woorden per zin",
        "",
        "SCHRIJF NU:",
        "Denk goed na over de gekozen richting en voer die uit in zin 1–2.",
        "Schrijf daarna drie zinnen die logisch verdergaan en eindigen in een klein spanningsmoment.",
        "Gebruik alleen bestaande Nederlandse woorden die passen bij de opgegeven klanken.",
        "Schrijf vijf korte zinnen die samen één mini-scène vormen.",
        "Geef daarna precies twee nieuwe keuzes, beide in gebiedende wijs (2–4 woorden).",
    ]
    return "\n".join([p for p in parts if p and p.strip()])


class WordsPayload(BaseModel):
    level: str
    focus: list[str]
    allowed: list[str]
    patterns: list[str]


class StoryPayload(BaseModel):
    theme: str | None = None
    level: str
    unit: str | None = None
    direction: str
    story: str | None = None
    focus: list[str] = []
    allowed: list[str] = []
    patterns: list[str] = []
    max_words: int | None = None
    strict_forbid: bool = False


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
    """Redirect to the React-based login page."""
    return RedirectResponse("/login")


@app.get("/login")
async def login_page(request: Request):
    """Serve the React login page by default.

    The old HTML page can still be accessed via ``/login?ui=legacy`` if needed.
    """
    use_legacy = request.query_params.get("ui") == "legacy"

    file = (
        os.path.join(react_dir, "index.html")
        if not use_legacy
        else os.path.join(frontend_dir, "index.html")
    )
    return FileResponse(file)


@app.post("/api/initialize_models")
async def initialize_models():
    global models_ready
    # Trigger lazy loading of wav2vec2 models
    from FASE2_wav2vec2_process import _load_asr_model, _load_phoneme_model

    _load_asr_model("cpu")
    _load_phoneme_model("cpu")
    models_ready = True
    return {"status": "ok"}


@app.on_event("startup")
async def _warm_models() -> None:
    """Pre-load heavy model weights so the first request is fast."""
    try:
        from FASE2_wav2vec2_process import _load_asr_model, _load_phoneme_model
        _load_asr_model("cpu")
        _load_phoneme_model("cpu")
    except Exception:
        pass
    try:
        from FASE2_azure_process import AzurePronunciationEvaluator, AzurePlainTranscriber
        # Instantiate once to trigger lazy loading of Azure SDK components
        AzurePronunciationEvaluator("", realtime=False)
        AzurePlainTranscriber(realtime=False)
    except Exception:
        pass

    # Generate the fixed filler sentence once so it's ready for reuse
    try:
        from .tts import tts_to_file
        if not FILLER_AUDIO_PATH.exists():
            tmp = tts_to_file("De zin was")
            shutil.move(tmp, FILLER_AUDIO_PATH)
    except Exception:
        pass


@app.get("/api/config")
async def get_config():
    """Expose minimal runtime configuration to the frontend."""
    return {"realtime": config.REALTIME, "delay_seconds": config.DELAY_SECONDS}


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
    # Word-level TTS files are cached in a dedicated subdirectory.  When the
    # frontend requests a file like ``/api/audio/de.wav`` we need to look for it
    # in that cache as well.
    word_path = storage.STORAGE_DIR / "words" / name
    if word_path.exists():
        return FileResponse(word_path, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Audio not found")


@app.post("/api/tts")
async def generate_tts(payload: dict):
    """Generate TTS audio for the given text and return the filename."""
    text = payload.get("text") if isinstance(payload, dict) else None
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
    from .tts import tts_to_file
    audio_path = await asyncio.to_thread(tts_to_file, text)
    return {"audio": os.path.basename(audio_path)}


@app.post("/api/tts_word")
async def generate_tts_word(payload: dict):
    """Generate word-level TTS audio for the given text and return the filename."""
    text = payload.get("text") if isinstance(payload, dict) else None
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
    from .tts import word_tts_to_file
    audio_path = await asyncio.to_thread(word_tts_to_file, text)
    return {"audio": os.path.basename(audio_path)}


@app.post("/api/realtime/start")
async def realtime_start(
    sentence: str = Form(...),
    sample_rate: int = Form(16000),
    teacher_id: int = Form(1),
    student_id: int = Form(0),
):
    if not models_ready:
        raise HTTPException(status_code=400, detail="Models not initialized")
    sess, old_id = engine_pool.get(
        teacher_id,
        student_id,
        sentence,
        sample_rate,
        str(FILLER_AUDIO_PATH),
    )
    if old_id:
        sessions.pop(old_id, None)
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
async def realtime_stop(sid: str, request: Request, background: BackgroundTasks):
    sess = sessions.pop(sid, None)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    client_timeline = payload.get("client_timeline") if isinstance(payload, dict) else None
    if sess.timeline:
        sess.timeline.mark("/stop_in")
    results = sess.stop()

    # If a debug dump is present, print it **after** the response is sent
    if getattr(sess, "_prompt_dump", None):
        prompt_text, json_text = sess._prompt_dump
        background.add_task(_dump_prompt, prompt_text, json_text)
        sess._prompt_dump = None
    if client_timeline:
        results["timeline_frontend"] = client_timeline
    if sess.timeline:
        sess.timeline.mark("json_ready")
        results["timeline_backend"] = sess.timeline.to_dict()
    _print_timeline(results)
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
            "feedback_audio": os.path.basename(feedback_audio),
            "correct": tutor_resp.is_correct,
            "errors": [e.model_dump(by_alias=True) for e in tutor_resp.errors],
            "delay_seconds": config.DELAY_SECONDS,
        }
    )


# ---------------------------------------------------------------------------
# New endpoints for the interactive story feature
# ---------------------------------------------------------------------------


@app.post("/api/generate_words")
async def generate_words(payload: WordsPayload):
    import openai

    client = openai.AsyncOpenAI()

    sys_prompt = (
        "Je genereert oefenwoorden voor beginnende lezers.\n"
        "Regels:\n"
        "• Genereer exact 8 decodabele Nederlandse woorden.\n"
        "• Gebruik uitsluitend de opgegeven letters/klanken (andere zijn VERBODEN).\n"
        "• Eén woord per item. Geen hoofdletters, geen namen. Bij voorkeur één lettergreep.\n\n"
        "Uitvoer (STRICT JSON): { \"words\": [8 strings] }"
    )
    user_prompt = (
        f"Toegestane letters/klanken (strikt): [{', '.join(payload.allowed)}]\n"
        f"Focusklanken: [{', '.join(payload.focus)}]\n"
        f"Woordpatronen (informatief): [{', '.join(payload.patterns)}]\n"
        "Genereer nu de 8 woorden."
    )
    resp = await client.chat.completions.create(
        model="gpt-4o",
        temperature=1.0,
        top_p=1.0,
        max_tokens=200,
        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
        response_format={"type": "json_object"},
    )
    return JSONResponse(content=json.loads(resp.choices[0].message.content))


@app.post("/api/continue_story")
async def continue_story_post(payload: StoryPayload):
    import openai

    client = openai.AsyncOpenAI()

    sys_prompt = get_system_prompt_by_level(payload.level)
    user_prompt = build_user_prompt_story(
        payload.theme or "",
        payload.direction,
        payload.story or "",
        payload.level,
        payload.focus,
        payload.allowed,
        payload.patterns,
        payload.max_words or 7,
        payload.strict_forbid,
    )
    resp = await client.chat.completions.create(
        model="gpt-4o",
        temperature=1.0,
        top_p=1.0,
        max_tokens=300,
        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
        response_format={"type": "json_object"},
    )
    return JSONResponse(content=json.loads(resp.choices[0].message.content))


@app.get("/api/start_story")
async def start_story(theme: str, level: str):
    """Pre-generate TTS audio for the first story section.

    Returns events in Server Sent Event format to report progress.
    """
    levels = config.STORIES.get(theme)
    if not levels:
        raise HTTPException(status_code=400, detail="Story not found")

    story = levels.get(level)
    if not story:
        # If level is numeric, allow indexing into the level dict
        if level.isdigit():
            idx = int(level) - 1
            if 0 <= idx < len(levels):
                story = list(levels.values())[idx]
        # Fallback: if there is only one level defined, use that
        if not story and len(levels) == 1:
            story = next(iter(levels.values()))
    if not story:
        raise HTTPException(status_code=400, detail="Story not found")

    from .tts import tts_to_file, word_tts_to_file

    async def event_stream():
        total = len(story["section1"]) + len(story["directions"])
        done = 0

        sentence_tasks = []
        for sent in story["section1"]:
            audio_task = asyncio.create_task(asyncio.to_thread(tts_to_file, sent))
            word_tasks = [
                asyncio.create_task(asyncio.to_thread(word_tts_to_file, w))
                for w in sent.split()
            ]
            sentence_tasks.append((sent, audio_task, word_tasks))

        direction_tasks = [
            (d, asyncio.create_task(asyncio.to_thread(tts_to_file, d)))
            for d in story["directions"]
        ]

        for sent, audio_task, word_tasks in sentence_tasks:
            audio = await audio_task
            word_audios = [os.path.basename(await t) for t in word_tasks]
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

        for direc, audio_task in direction_tasks:
            audio = await audio_task
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
async def continue_story(
    theme: str,
    level: str,
    direction: str,
    story: str | None = None,
    focus: str | None = None,
    allowed: str | None = None,
    patterns: str | None = None,
    max_words: int | None = None,
    strict_forbid: bool = False,
):
    """Generate the next story section based on the chosen direction."""

    import openai

    client = openai.AsyncOpenAI()

    focus_list = focus.split(",") if focus else []
    allowed_list = allowed.split(",") if allowed else []
    patterns_list = patterns.split(",") if patterns else []
    user_prompt = build_user_prompt_story(
        theme,
        direction,
        story or "",
        level,
        focus_list,
        allowed_list,
        patterns_list,
        max_words or 7,
        strict_forbid,
    )
    sys_prompt = get_system_prompt_by_level(level)
    if os.environ.get("DEBUG"):
        console.rule("[bold blue]System[/bold blue]")
        console.print(sys_prompt)
        console.rule("[bold blue]User[/bold blue]")
        console.print(user_prompt)

    resp = await client.chat.completions.create(
        model="gpt-4o",
        temperature=0.9,
        top_p=1.0,
        max_tokens=300,
        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
        response_format={"type": "json_object"},
    )

    try:
        j = json.loads(resp.choices[0].message.content)
        sentences = j["sentences"]
        directions = j["directions"]
    except Exception as exc:
        console.print(f"[red]Model output parsing failed: {exc}[/red]")
        raise HTTPException(status_code=500, detail="Model gaf geen geldig JSON")

    from .tts import tts_to_file, word_tts_to_file

    async def event_stream():
        total = len(sentences) + len(directions)
        done = 0

        sentence_tasks = []
        for sent in sentences:
            audio_task = asyncio.create_task(asyncio.to_thread(tts_to_file, sent))
            word_tasks = [
                asyncio.create_task(asyncio.to_thread(word_tts_to_file, w))
                for w in sent.split()
            ]
            sentence_tasks.append((sent, audio_task, word_tasks))

        direction_tasks = [
            (d, asyncio.create_task(asyncio.to_thread(tts_to_file, d)))
            for d in directions
        ]

        for sent, audio_task, word_tasks in sentence_tasks:
            audio = await audio_task
            word_audios = [os.path.basename(await t) for t in word_tasks]
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

        for direc, audio_task in direction_tasks:
            audio = await audio_task
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

# Fallback route to serve the React app for unknown frontend routes
@app.get("/{full_path:path}")
async def react_app(full_path: str):
    """Serve the React SPA index file."""
    if full_path.startswith("api") or full_path.startswith("static"):
        raise HTTPException(status_code=404)
    return FileResponse(os.path.join(react_dir, "index.html"))
