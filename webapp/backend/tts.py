"""Helpers to generate TTS audio files using OpenAI."""
import tempfile
import openai
from . import config

openai.api_key = openai.api_key or None  # use env var
openai.api_type = "openai"  # TTS should always use the standard OpenAI API


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
