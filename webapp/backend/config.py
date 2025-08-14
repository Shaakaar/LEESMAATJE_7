import os

# Sentences presented to the learner
SENTENCES = [
    "De kip zit in het hok.",
    "De vis zwemt in de kom.",
    "De hond blaft naar de kat.",
    "De muis eet kaas.",
    "De kat zit op de mat.",
    "De boot is mooi.",
    "Ik eet een appel.",
]

# Sample interactive stories used by the webapp. Each theme contains multiple
# levels. For now only a single theme/level is provided as an example.
STORIES = {
    "animals": {
        "easy": {
            "section1": [
                "De kat zit op het dak.",
                "De hond blaft naar de kip.",
                "Een koe staat in het veld.",
                "Het paard rent in de wei.",
                "De vogel zingt mooi.",
            ],
            "directions": [
                "Wil je naar de boerderij?",
                "Wil je naar het bos?",
            ],
        }
    }
}

# Voice configuration for TTS
VOICE_MODEL = "gpt-4o-mini-tts"
VOICE_NAME = "nova"
VOICE_INSTRUCTIONS = (
    "Nederlandse vrouwelijke leerkracht, vriendelijk, bemoedigend, "
    "spreek langzaam en duidelijk voor een kind van vijf jaar. "
    "Maak korte pauzes tussen de woorden en leg nadruk op fout verbeteringen."
)

# Separate model for word-level TTS generation
WORD_VOICE_MODEL = "gpt-4o-mini-tts"
WORD_VOICE_INSTRUCTIONS = "Spreek in Nederlands"

# Delay before playing filler sentence after stop (seconds)
DELAY_SECONDS = 0.5

# Overall pipeline mode: when ``False`` the backend expects a single WAV file
# instead of realtime chunks.
REALTIME = os.getenv("REALTIME", "true").lower() not in {"0", "false", "no"}

# Analysis settings for the individual engines.  These flags are independent of
# ``REALTIME`` and control which recognisers run in either mode.
REALTIME_FLAGS = {
    "azure_pron": True,
    "azure_plain": True,
    "w2v2_phonemes": False,
    "w2v2_asr": True,
}

PARALLEL_OFFLINE = True
CHUNK_DURATION = 10

# Stream audio to Azure instead of using a separate microphone.  Applies to both
# RecorderPipeline and RealtimeSession.
AZURE_PUSH_STREAM = True

# Keep Azure recognisers alive between recordings and start them asynchronously
KEEP_AZURE_RUNNING = True

# GPT model settings
GPT_PROVIDER = os.getenv("GPT_TUTOR_PROVIDER", "openai")
GPT_MODEL = os.getenv("GPT_TUTOR_MODEL", "gpt-4o")
# Temperature for GPT feedback (0 for deterministic output)
GPT_TEMPERATURE = float(os.getenv("GPT_TUTOR_TEMPERATURE", "0.0"))

# Ensure the environment variables are set so gpt_client can pick them up
os.environ.setdefault("GPT_TUTOR_PROVIDER", GPT_PROVIDER)
os.environ.setdefault("GPT_TUTOR_MODEL", GPT_MODEL)
os.environ.setdefault("GPT_TUTOR_TEMPERATURE", str(GPT_TEMPERATURE))
