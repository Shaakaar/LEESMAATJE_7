"""Helpers to generate TTS audio files using OpenAI."""
import os
import re
import tempfile

import openai

from . import config, storage

openai.api_key = openai.api_key or None  # use env var
openai.api_type = "openai"  # TTS should always use the standard OpenAI API

# Directory for caching word-level TTS files
WORD_CACHE_DIR = storage.STORAGE_DIR / "words"
WORD_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def tts_to_file(text: str, stream: bool = False) -> str:
    """Generate speech and return path to WAV file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    if stream:
        with openai.audio.speech.with_streaming_response.create(
            model=config.VOICE_MODEL,
            voice=config.VOICE_NAME,
            input=text,
            instructions=config.VOICE_INSTRUCTIONS,
            response_format="wav",
        ) as resp:
            for chunk in resp.iter_bytes():
                tmp.write(chunk)
    else:
        resp = openai.audio.speech.create(
            model=config.VOICE_MODEL,
            voice=config.VOICE_NAME,
            input=text,
            instructions=config.VOICE_INSTRUCTIONS,
            response_format="wav",
        )
        tmp.write(resp.content)
    tmp.flush()
    tmp.close()
    return tmp_path


def word_tts_to_file(text: str) -> str:
    """Return path to cached word-level TTS, generating it if needed."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", text.lower())
    path = WORD_CACHE_DIR / f"{safe}.wav"
    if path.exists():
        return str(path)

    resp = openai.audio.speech.create(
        model=config.WORD_VOICE_MODEL,
        voice=config.VOICE_NAME,
        input=text,
        response_format="wav",
        language=config.WORD_VOICE_LANGUAGE,
    )
    with open(path, "wb") as f:
        f.write(resp.content)
    return str(path)
