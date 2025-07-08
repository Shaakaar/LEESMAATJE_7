import os
import uuid
import wave
import tempfile
import time
from typing import Dict, Any

import numpy as np

from FASE2_audio import audio_q
from FASE2_wav2vec2_process import Wav2Vec2PhonemeExtractor, Wav2Vec2Transcriber
from FASE2_azure_process import AzurePronunciationEvaluator, AzurePlainTranscriber
from . import config, analysis_pipeline


class RealtimeSession:
    """Manage realtime audio analysis for one sentence."""

    def __init__(self, sentence: str, sample_rate: int = 16000):
        self.id = str(uuid.uuid4())
        self.sentence = sentence
        self.sample_rate = sample_rate
        self.results: Dict[str, Any] = {
            "session_id": self.id,
            "reference_text": sentence,
            "reference_phonemes": analysis_pipeline._ref_ph_map(sentence),
            "audio_file": None,
            "start_time": time.time(),
            "end_time": None,
            "azure_plain": None,
            "azure_pronunciation": None,
            "wav2vec2_asr": None,
            "wav2vec2_phonemes": None,
            "metadata": {"language": "nl-NL", "chunk_duration": config.CHUNK_DURATION},
        }

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        self.wav_path = tmp.name
        self.results["audio_file"] = self.wav_path
        self.wavefile = wave.open(self.wav_path, "wb")
        self.wavefile.setnchannels(1)
        self.wavefile.setsampwidth(2)
        self.wavefile.setframerate(self.sample_rate)

        # Start realtime wav2vec2 engines
        self.phon_thread = Wav2Vec2PhonemeExtractor(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=True,
        )
        self.asr_thread = Wav2Vec2Transcriber(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=True,
        )
        self.phon_thread.start()
        self.asr_thread.start()

    def add_chunk(self, pcm_data: bytes):
        """Add a chunk of 16‑bit mono PCM data."""
        arr = np.frombuffer(pcm_data, dtype=np.int16)
        audio_q.put(arr)
        self.wavefile.writeframes(pcm_data)

    def stop(self) -> Dict[str, Any]:
        """Finalize processing and return results."""
        audio_q.put(None)
        self.phon_thread.stop()
        self.asr_thread.stop()
        self.phon_thread.join()
        self.asr_thread.join()
        self.wavefile.close()

        # Run Azure engines offline on the saved WAV
        ap = AzurePronunciationEvaluator(self.sentence, results=self.results, realtime=False)
        ap.process_file(self.wav_path)
        at = AzurePlainTranscriber(results=self.results, realtime=False)
        at.process_file(self.wav_path)

        self.results["end_time"] = time.time()
        return self.results
