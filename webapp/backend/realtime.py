import os
import uuid
import wave
import tempfile
import time
import json
import queue
import threading
from time import perf_counter_ns
from typing import Dict, Any

import numpy as np
from FASE2_wav2vec2_process import Wav2Vec2PhonemeExtractor, Wav2Vec2Transcriber
from FASE2_azure_process import AzurePronunciationEvaluator, AzurePlainTranscriber
from rich.console import Console
from . import config, analysis_pipeline
import prompt_builder

console = Console()
DEBUG_CHUNKS = False
DEBUG_TIMELINE = bool(os.getenv("DEBUG_TIMELINE"))


class Timeline:
    """Collect coarse timing marks relative to instantiation."""

    def __init__(self) -> None:
        self._start = perf_counter_ns()
        self._marks: dict[str, int] = {}

    def mark(self, name: str) -> None:
        self._marks[name] = perf_counter_ns()
        if DEBUG_TIMELINE:
            console.log(f"[timeline] {name}")

    def to_dict(self) -> dict[str, float]:
        return {k: (v - self._start) / 1_000_000 for k, v in self._marks.items()}


class RealtimeSession:
    """Manage realtime audio analysis for one sentence.

    A ``RealtimeSession`` instance is intended to be reused for multiple
    recordings.  Heavy recogniser objects are created once and a lightweight
    :py:meth:`reset` prepares the session for a new recording.
    """

    def __init__(
        self,
        sentence: str,
        sample_rate: int = 16000,
        *,
        filler_audio: str | None = None,
        teacher_id: int = 0,
        student_id: int = 0,
        timeline: Timeline | None = None,
    ):
        self.last_used = time.time()
        self.sample_rate = sample_rate
        self.sentence = sentence
        self.filler_audio = filler_audio
        self.teacher_id = teacher_id
        self.student_id = student_id

        self.timeline = timeline or Timeline()

        self.phon_q = queue.Queue()
        self.asr_q = queue.Queue()
        self.azure_pron_q = None
        self.azure_plain_q = None

        self.results: Dict[str, Any] = {}
        self.reset(
            sentence,
            sample_rate=sample_rate,
            filler_audio=filler_audio,
            teacher_id=teacher_id,
            student_id=student_id,
            timeline=self.timeline,
        )

    # ------------------------------------------------------------------ lifecycle
    def reset(
        self,
        sentence: str,
        *,
        sample_rate: int = 16000,
        filler_audio: str | None = None,
        teacher_id: int = 0,
        student_id: int = 0,
        timeline: Timeline | None = None,
    ) -> None:
        """Prepare the session for a new recording."""
        console.log(
            f"[reset] ASR thread alive before reset? {getattr(self, 'asr_thread', None) is not None and self.asr_thread.is_alive()}"
        )
        self.id = str(uuid.uuid4())
        self.last_used = time.time()
        self.sentence = sentence
        self.sample_rate = sample_rate
        self.filler_audio = filler_audio
        self.teacher_id = teacher_id
        self.student_id = student_id

        self.timeline = timeline or Timeline()

        rt = config.REALTIME_FLAGS
        self.phon_q = queue.Queue()
        self.asr_q = queue.Queue()
        self.azure_pron_q = queue.Queue() if config.AZURE_PUSH_STREAM and rt.get("azure_pron", True) else None
        self.azure_plain_q = queue.Queue() if config.AZURE_PUSH_STREAM and rt.get("azure_plain", True) else None

        if getattr(self, "phon_thread", None) is not None:
            self.phon_thread.on_new_recording(self.phon_q)
        if getattr(self, "asr_thread", None) is not None:
            self.asr_thread.on_new_recording(self.asr_q)

        self.results.clear()
        self.results.update(
            {
                "session_id": self.id,
                "reference_text": sentence,
                "reference_phonemes": analysis_pipeline._ref_ph_map(sentence),
                "audio_file": None,
                "start_time": time.time(),
                "end_time": None,
                "azure_plain": {"final_transcript": None, "interim_transcripts": []},
                "azure_pronunciation": {
                    "final_transcript": None,
                    "word_timings": [],
                    "pronunciation_scores": {},
                },
                "wav2vec2_asr": [],
                "wav2vec2_phonemes": [],
                "metadata": {
                    "language": "nl-NL",
                    "chunk_duration": config.CHUNK_DURATION,
                },
            }
        )

        self._init_engines()

        if self.azure_pron is not None and self.azure_pron_q is not None:
            self.azure_pron.update_reference_text(sentence)
            self.azure_pron.reset_stream(self.azure_pron_q, self.sample_rate)
        if self.azure_plain is not None and self.azure_plain_q is not None:
            self.azure_plain.reset_stream(self.azure_plain_q, self.sample_rate)

        sid = self.results["session_id"]
        if self.azure_pron:
            self.azure_pron.begin_turn(sid, self.results)
        if self.azure_plain:
            self.azure_plain.begin_turn(sid, self.results)

        if getattr(self, "phon_thread", None) is not None:
            self.phon_thread.results = self.results
        if getattr(self, "asr_thread", None) is not None:
            self.asr_thread.results = self.results

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        self.wav_path = tmp.name
        self.results["audio_file"] = self.wav_path
        self.wavefile = wave.open(self.wav_path, "wb")
        self.wavefile.setnchannels(1)
        self.wavefile.setsampwidth(2)
        self.wavefile.setframerate(self.sample_rate)
        self.chunk_count = 0

        if config.KEEP_AZURE_RUNNING:
            if (
                (self.azure_pron and not self.azure_pron._running)
                or (self.azure_plain and not self.azure_plain._running)
            ):
                self._ensure_azure_running_async()
        else:
            if self.azure_pron:
                self.azure_pron.start_if_needed()
            if self.azure_plain:
                self.azure_plain.start_if_needed()

        console.log(
            f"[reset] ASR thread alive after init? {getattr(self, 'asr_thread', None) is not None and self.asr_thread.is_alive()}"
        )
        if self.timeline:
            self.timeline.mark("engine_reset_done")

    def _init_engines(self) -> None:
        """Create or restart recogniser engines."""
        rt = config.REALTIME_FLAGS

        if getattr(self, "phon_thread", None) is None or not self.phon_thread.is_alive():
            self.phon_thread = Wav2Vec2PhonemeExtractor(
                sample_rate=self.sample_rate,
                chunk_duration=config.CHUNK_DURATION,
                results=self.results,
                realtime=rt.get("w2v2_phonemes", True),
                audio_queue=self.phon_q,
                timeline=self.timeline,
            )
            if self.phon_thread.realtime:
                self.phon_thread.start()
                if self.timeline:
                    self.timeline.mark("w2v2_ready_ph")
        else:
            if self.timeline:
                self.timeline.mark("w2v2_ready_ph")

        if getattr(self, "asr_thread", None) is None or not self.asr_thread.is_alive():
            self.asr_thread = Wav2Vec2Transcriber(
                sample_rate=self.sample_rate,
                chunk_duration=config.CHUNK_DURATION,
                results=self.results,
                realtime=rt.get("w2v2_asr", True),
                audio_queue=self.asr_q,
                timeline=self.timeline,
            )
            if self.asr_thread.realtime:
                self.asr_thread.start()
                if self.timeline:
                    self.timeline.mark("w2v2_ready_asr")
        else:
            if self.timeline:
                self.timeline.mark("w2v2_ready_asr")

        if self.azure_pron_q is not None:
            if getattr(self, "azure_pron", None) is None:
                self.azure_pron = AzurePronunciationEvaluator(
                    self.sentence,
                    results=self.results,
                    realtime=rt.get("azure_pron", True),
                    audio_queue=self.azure_pron_q,
                    sample_rate=self.sample_rate,
                    timeline=self.timeline,
                )

        if self.azure_plain_q is not None:
            if getattr(self, "azure_plain", None) is None:
                self.azure_plain = AzurePlainTranscriber(
                    results=self.results,
                    realtime=rt.get("azure_plain", True),
                    audio_queue=self.azure_plain_q,
                    sample_rate=self.sample_rate,
                    timeline=self.timeline,
                )

    def _ensure_azure_running_async(self) -> None:
        def _run():
            if self.timeline:
                self.timeline.mark("azure_start_called")
            try:
                if self.azure_pron:
                    self.azure_pron.start_if_needed()
                if self.azure_plain:
                    self.azure_plain.start_if_needed()
            finally:
                if self.timeline:
                    self.timeline.mark("azure_start_returned")
        threading.Thread(target=_run, daemon=True, name="azure-start").start()

    @property
    def idle_seconds(self) -> float:
        return time.time() - self.last_used

    def shutdown(self) -> None:
        """Terminate all recogniser threads and wait for them to finish."""
        try:
            if getattr(self, "phon_thread", None) is not None:
                self.phon_thread.terminate()
                self.phon_thread.join()
        except Exception:
            pass
        try:
            if getattr(self, "asr_thread", None) is not None:
                self.asr_thread.terminate()
                self.asr_thread.join()
        except Exception:
            pass
        try:
            self.azure_pron.stop()
        except Exception:
            pass
        try:
            self.azure_plain.stop()
        except Exception:
            pass

    def add_chunk(self, pcm_data: bytes):
        """Add a chunk of 16‑bit mono PCM data."""
        arr = np.frombuffer(pcm_data, dtype=np.int16)
        self.chunk_count += 1
        if self.chunk_count == 1 and self.timeline:
            self.timeline.mark("first_chunk_received")
        if DEBUG_CHUNKS:
            console.log(f"received chunk {self.chunk_count} of {len(pcm_data)} bytes")
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
        # Mark end of the current recording for each engine.  The W2V2 threads
        # remain alive, so we only enqueue ``None`` to signal a boundary.
        self.phon_q.put(None)
        self.asr_q.put(None)
        if self.azure_pron_q is not None:
            self.azure_pron_q.put(None)
        if self.azure_plain_q is not None:
            self.azure_plain_q.put(None)

        if getattr(self, "phon_thread", None) is not None and self.phon_thread.realtime:
            self.phon_thread.eor_event.wait()
        if getattr(self, "asr_thread", None) is not None and self.asr_thread.realtime:
            self.asr_thread.eor_event.wait()

        self.wavefile.close()

        # Offline modes still run synchronously on the recorded file.
        if not self.phon_thread.realtime:
            self.phon_thread.process_file(self.wav_path)

        if not self.asr_thread.realtime:
            self.asr_thread.process_file(self.wav_path)

        if self.azure_pron and self.azure_pron._feed_thread:
            self.azure_pron._feed_thread.join()
        if self.azure_plain and self.azure_plain._feed_thread:
            self.azure_plain._feed_thread.join()

        got_pron = True
        got_plain = True
        if self.azure_pron.realtime:
            got_pron = self.azure_pron.wait_for_final(timeout=1.0)
        else:
            self.azure_pron.process_file(self.wav_path)
        if self.azure_plain.realtime:
            got_plain = self.azure_plain.wait_for_final(timeout=1.0)
        else:
            self.azure_plain.process_file(self.wav_path)

        if self.azure_pron.realtime and not got_pron:
            self.azure_pron.stop_if_needed()
            self.azure_pron._done_event.wait(timeout=1.0)
        if self.azure_plain.realtime and not got_plain:
            self.azure_plain.stop_if_needed()
            self.azure_plain._done_event.wait(timeout=1.0)

        if self.azure_pron:
            self.azure_pron.end_turn()
        if self.azure_plain:
            self.azure_plain.end_turn()

        console.log(f"wrote {self.chunk_count} chunks totalling {os.path.getsize(self.wav_path)} bytes")
        self.results["end_time"] = time.time()
        self.last_used = self.results["end_time"]
        req, messages = prompt_builder.build(self.results, state={})
        console.rule("[bold green]System Prompt[/bold green]")
        console.print(messages[0]["content"])
        json_str = req.model_dump_json(indent=2)
        console.rule("[bold green]JSON Request[/bold green]")
        console.print_json(json_str)
        return self.results
