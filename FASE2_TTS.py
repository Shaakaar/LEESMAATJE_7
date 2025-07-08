#%%
import openai, os, soundfile as sf, sounddevice as sd, tempfile, time, threading

def _env_flag(key: str, default: str = "true") -> bool:
    return os.getenv(key, default).lower() in ("1", "true", "yes", "on")

# Use streaming by default only if explicitly enabled via the environment
STREAMING_TTS = _env_flag("STREAMING_TTS", "false")

openai.api_key = os.getenv("OPENAI_API_KEY")

#==============================================================================================================
# Voice choices (per OpenAI docs): alloy, coral, nova, shimmer, ash, echo, river, flow, amber, opal, sapphir
#==============================================================================================================
VOICE_MODEL         = "gpt-4o-mini-tts"
VOICE_NAME          = "nova"            # pick any from the list above
VOICE_INSTRUCTIONS  = ("Nederlandse vrouwelijke leerkracht, vriendelijk, bemoedigend, "
                        "spreek langzaam en duidelijk voor een kind van vijf jaar. "
                        "Maak korte pauzes tussen de woorden en leg nadruk op fout verbeteringen."
)

def speak(
    text: str,
    timing_dict: dict | None = None,
    stream: bool = STREAMING_TTS,
    *,
    VOICE_MODEL=VOICE_MODEL,
    VOICE_NAME=VOICE_NAME,
    VOICE_INSTRUCTIONS=VOICE_INSTRUCTIONS,
) -> None:
    """Generate speech and play it.

    Records the moment the first audio byte is received in
    ``timing_dict['tts_first_byte']`` and the moment playback starts in
    ``timing_dict['tts_play_start']``.
    """

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        if stream:
            with openai.audio.speech.with_streaming_response.create(
                model=VOICE_MODEL,
                voice=VOICE_NAME,
                input=text,
                instructions=VOICE_INSTRUCTIONS,
                response_format="wav",
            ) as resp:
                first = True
                for chunk in resp.iter_bytes():
                    if first and timing_dict is not None:
                        timing_dict["tts_first_byte"] = time.perf_counter()
                        first = False
                    tmp.write(chunk)
        else:
            resp = openai.audio.speech.create(
                model=VOICE_MODEL,
                voice=VOICE_NAME,
                input=text,
                instructions=VOICE_INSTRUCTIONS,
                response_format="wav",
            )
            if timing_dict is not None:
                timing_dict["tts_first_byte"] = time.perf_counter()
            tmp.write(resp.content)

        tmp.flush()
        tmp_path = tmp.name

    # Play after the temporary file is closed to ensure audio is complete
    data, sr = sf.read(tmp_path)
    if timing_dict is not None:
        timing_dict["tts_play_start"] = time.perf_counter()
    sd.play(data, sr)
    sd.wait()

    try:
        os.remove(tmp_path)
    except Exception:
        pass



def start_filler(
    reference_text: str,
    stop_press: float,
    *,
    delay_seconds: float = 0.0,
    stream: bool = STREAMING_TTS,
    VOICE_MODEL=VOICE_MODEL,
    VOICE_NAME=VOICE_NAME,
    VOICE_INSTRUCTIONS=VOICE_INSTRUCTIONS,
) -> threading.Thread:
    """Start a filler TTS in a background thread.

    Parameters
    ----------
    reference_text:
        The sentence that should have been read.
    stop_press:
        Timestamp when recording stopped.
    delay_seconds:
        Seconds to wait after ``stop_press`` before speaking.
    """

    def _run():
        timing = {"stop_press": stop_press}
        if delay_seconds > 0:
            time.sleep(delay_seconds)
        speak(
            f"De zin was {reference_text}",
            timing_dict=timing,
            stream=stream,
            VOICE_MODEL=VOICE_MODEL,
            VOICE_NAME=VOICE_NAME,
            VOICE_INSTRUCTIONS=VOICE_INSTRUCTIONS,
        )

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t
