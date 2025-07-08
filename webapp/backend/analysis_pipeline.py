"""Run analysis engines on an uploaded WAV file."""
from __future__ import annotations

import os
import time
import uuid
import tempfile
from typing import Dict, Any

import soundfile as sf
import resampy
from phonemizer import phonemize

from FASE2_azure_process import AzurePronunciationEvaluator, AzurePlainTranscriber
from FASE2_wav2vec2_process import Wav2Vec2PhonemeExtractor, Wav2Vec2Transcriber
from . import config


def _ref_ph_map(text: str) -> Dict[str, str]:
    return {
        w: phonemize(
            w,
            language="nl",
            backend="espeak",
            strip=True,
            preserve_punctuation=True,
            with_stress=False,
        )
        for w in text.split()
    }


def ensure_wav_16k(wav_bytes: bytes) -> str:
    """Convert uploaded audio bytes to 16 kHz mono WAV file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    with open(tmp_path, "wb") as f:
        f.write(wav_bytes)

    data, sr = sf.read(tmp_path)
    if sr != 16000:
        data = resampy.resample(data, sr, 16000)
        sr = 16000
    if data.ndim > 1:
        data = data[:, 0]
    sf.write(tmp_path, data, sr, subtype="PCM_16")
    return tmp_path


def analyze_audio(wav_bytes: bytes, sentence: str) -> Dict[str, Any]:
    wav_path = ensure_wav_16k(wav_bytes)
    session_id = str(uuid.uuid4())
    results: Dict[str, Any] = {
        "session_id": session_id,
        "reference_text": sentence,
        "reference_phonemes": _ref_ph_map(sentence),
        "audio_file": wav_path,
        "start_time": time.time(),
        "azure_plain": None,
        "azure_pronunciation": None,
        "wav2vec2_asr": None,
        "wav2vec2_phonemes": None,
        "metadata": {"language": "nl-NL", "chunk_duration": config.CHUNK_DURATION},
    }
    engine_times: Dict[str, Dict[str, float]] = {
        "azure_pron": {},
        "azure_plain": {},
        "w2v2_phonemes": {},
        "w2v2_asr": {},
    }

    # Azure pronunciation
    ap = AzurePronunciationEvaluator(sentence, results=results, realtime=False)
    engine_times["azure_pron"]["start"] = time.perf_counter()
    ap.process_file(wav_path)
    engine_times["azure_pron"]["end"] = time.perf_counter()

    # Azure plain transcription
    at = AzurePlainTranscriber(results=results, realtime=False)
    engine_times["azure_plain"]["start"] = time.perf_counter()
    at.process_file(wav_path)
    engine_times["azure_plain"]["end"] = time.perf_counter()

    # Wav2Vec2 phonemes
    pe = Wav2Vec2PhonemeExtractor(16000, config.CHUNK_DURATION, results, realtime=False)
    engine_times["w2v2_phonemes"]["start"] = time.perf_counter()
    pe.process_file(wav_path)
    engine_times["w2v2_phonemes"]["end"] = time.perf_counter()

    # Wav2Vec2 ASR
    asr = Wav2Vec2Transcriber(16000, config.CHUNK_DURATION, results, realtime=False)
    engine_times["w2v2_asr"]["start"] = time.perf_counter()
    asr.process_file(wav_path)
    engine_times["w2v2_asr"]["end"] = time.perf_counter()

    results["end_time"] = time.time()
    results["timing"] = {"engines": engine_times}
    return results
