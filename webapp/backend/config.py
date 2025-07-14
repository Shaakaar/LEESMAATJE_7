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

# Voice configuration for TTS
VOICE_MODEL = "gpt-4o-mini-tts"
VOICE_NAME = "nova"
VOICE_INSTRUCTIONS = (
    "Nederlandse vrouwelijke leerkracht, vriendelijk, bemoedigend, "
    "spreek langzaam en duidelijk voor een kind van vijf jaar. "
    "Maak korte pauzes tussen de woorden en leg nadruk op fout verbeteringen."
)

# Delay before playing filler sentence after stop (seconds)
DELAY_SECONDS = 0.5

# Analysis settings
REALTIME_FLAGS = {
    "azure_pron": True,
    "azure_plain": True,
    "w2v2_phonemes": False,
    "w2v2_asr": True,
}

PARALLEL_OFFLINE = True
CHUNK_DURATION = 10

# GPT model settings
GPT_MODEL = os.getenv("GPT_TUTOR_MODEL", "gpt-4o-mini")
# Temperature for GPT feedback (0 for deterministic output)
GPT_TEMPERATURE = float(os.getenv("GPT_TUTOR_TEMPERATURE", "0.0"))

# Ensure the environment variable is set so gpt_client can pick it up
os.environ.setdefault("GPT_TUTOR_TEMPERATURE", str(GPT_TEMPERATURE))

