import os
import uuid
import wave
import tempfile
import time
import json
import queue
from typing import Dict, Any

import numpy as np

from FASE2_audio import flush_audio_queue
from FASE2_wav2vec2_process import Wav2Vec2PhonemeExtractor, Wav2Vec2Transcriber
from FASE2_azure_process import AzurePronunciationEvaluator, AzurePlainTranscriber
from rich.console import Console
from . import config, analysis_pipeline
import prompt_builder

console = Console()


class RealtimeSession:
    """Manage realtime audio analysis for one sentence."""

    def __init__(self, sentence: str, sample_rate: int = 16000, *, filler_audio: str | None = None, teacher_id: int = 0, student_id: int = 0):
        # Separate queues for phoneme, ASR and (optionally) Azure engines so
        # each receives the full stream.
        self.phon_q = queue.Queue()
        self.asr_q = queue.Queue()
        self.azure_pron_q = None
        self.azure_plain_q = None
        self.id = str(uuid.uuid4())
        self.sentence = sentence
        self.sample_rate = sample_rate
        self.filler_audio = filler_audio
        self.teacher_id = teacher_id
        self.student_id = student_id
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

        rt = config.REALTIME_FLAGS

        # Queues for Azure engines when using push-stream instead of the
        # default microphone.
        if config.AZURE_PUSH_STREAM and rt.get("azure_pron", True):
            self.azure_pron_q = queue.Queue()
        if config.AZURE_PUSH_STREAM and rt.get("azure_plain", True):
            self.azure_plain_q = queue.Queue()

        # Start wav2vec2 engines
        self.phon_thread = Wav2Vec2PhonemeExtractor(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=rt.get("w2v2_phonemes", True),
            audio_queue=self.phon_q,
        )
        self.asr_thread = Wav2Vec2Transcriber(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=rt.get("w2v2_asr", True),
            audio_queue=self.asr_q,
        )

        # Azure engines
        self.azure_pron = AzurePronunciationEvaluator(
            self.sentence,
            results=self.results,
            realtime=rt.get("azure_pron", True),
            audio_queue=self.azure_pron_q,
            sample_rate=self.sample_rate,
        )
        self.azure_plain = AzurePlainTranscriber(
            results=self.results,
            realtime=rt.get("azure_plain", True),
            audio_queue=self.azure_plain_q,
            sample_rate=self.sample_rate,
        )

        if self.phon_thread.realtime:
            self.phon_thread.start()
        if self.asr_thread.realtime:
            self.asr_thread.start()
        if self.azure_pron.realtime:
            self.azure_pron.start()
        if self.azure_plain.realtime:
            self.azure_plain.start()

    def add_chunk(self, pcm_data: bytes):
        """Add a chunk of 16‑bit mono PCM data."""
        arr = np.frombuffer(pcm_data, dtype=np.int16)
        # Fan out chunk to all engine queues
        self.phon_q.put(arr)
        self.asr_q.put(arr)
        if self.azure_pron_q is not None:
            self.azure_pron_q.put(arr)
        if self.azure_plain_q is not None:
            self.azure_plain_q.put(arr)
        self.wavefile.writeframes(pcm_data)

    def stop(self) -> Dict[str, Any]:
        """Finalize processing and return results."""
        # Allow final chunks to arrive before signaling end-of-stream
        time.sleep(0.5)
        self.phon_q.put(None)
        self.asr_q.put(None)
        if self.azure_pron_q is not None:
            self.azure_pron_q.put(None)
        if self.azure_plain_q is not None:
            self.azure_plain_q.put(None)
        self.wavefile.close()
        if self.phon_thread.realtime:
            # Allow the thread to drain remaining audio from the queue.
            # A sentinel has already been enqueued, so simply join instead
            # of calling ``stop()``; forcing ``stop()`` here can interrupt
            # processing and yield empty results.
            self.phon_thread.join()
        else:
            self.phon_thread.process_file(self.wav_path)

        if self.asr_thread.realtime:
            # Same reasoning as above – joining lets the transcriber finish
            # processing any buffered audio before exiting.
            self.asr_thread.join()
        else:
            self.asr_thread.process_file(self.wav_path)

        if self.azure_pron.realtime:
            self.azure_pron.stop()
        else:
            self.azure_pron.process_file(self.wav_path)

        if self.azure_plain.realtime:
            self.azure_plain.stop()
        else:
            self.azure_plain.process_file(self.wav_path)

        queues = [q for q in (self.phon_q, self.asr_q, self.azure_pron_q, self.azure_plain_q) if q is not None]
        flush_audio_queue(queues)

        self.results["end_time"] = time.time()
        req, messages = prompt_builder.build(self.results, state={})
        console.rule("[bold green]System Prompt[/bold green]")
        console.print(messages[0]["content"])
        json_str = req.model_dump_json(indent=2)
        console.rule("[bold green]JSON Request[/bold green]")
        console.print_json(json_str)
        return self.results
