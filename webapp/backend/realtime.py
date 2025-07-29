import uuid
import wave
import tempfile
import time
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
        self.audio_q = queue.Queue()
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

        # Start wav2vec2 engines
        self.phon_thread = Wav2Vec2PhonemeExtractor(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=rt.get("w2v2_phonemes", True),
            audio_queue=self.audio_q,
        )
        self.asr_thread = Wav2Vec2Transcriber(
            sample_rate=self.sample_rate,
            chunk_duration=config.CHUNK_DURATION,
            results=self.results,
            realtime=rt.get("w2v2_asr", True),
            audio_queue=self.audio_q,
        )

        # Azure engines
        self.azure_pron = AzurePronunciationEvaluator(
            self.sentence,
            results=self.results,
            realtime=rt.get("azure_pron", True),
        )
        self.azure_plain = AzurePlainTranscriber(
            results=self.results,
            realtime=rt.get("azure_plain", True),
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
        self.audio_q.put(arr)
        self.wavefile.writeframes(pcm_data)

    def stop(self) -> Dict[str, Any]:
        """Finalize processing and return results."""
        # Allow final chunks to arrive before signaling end-of-stream
        time.sleep(0.5)
        self.audio_q.put(None)
        # Close the WAV file before any offline processing so that the
        # written header is finalised.  If the file remains open the header
        # is incomplete and ``soundfile`` will fail to read it on Windows.
        self.wavefile.close()

        if self.phon_thread.realtime:
            self.phon_thread.stop()
            self.phon_thread.join()
        else:
            self.phon_thread.process_file(self.wav_path)

        if self.asr_thread.realtime:
            self.asr_thread.stop()
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
        flush_audio_queue(self.audio_q)

        self.results["end_time"] = time.time()
        req, messages = prompt_builder.build(self.results, state={})
        console.rule("[bold green]System Prompt[/bold green]")
        console.print(messages[0]["content"])
        json_str = req.model_dump_json(indent=2)
        console.rule("[bold green]JSON Request[/bold green]")
        console.print_json(json_str)
        return self.results
