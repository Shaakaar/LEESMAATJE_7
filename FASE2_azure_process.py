#%%
# FASE2_azure_process.py
# ---------------------------------------------------------------------------
# Azure PronunciationEvaluator  +  Azure PlainTranscriber
# – Realtime mode can use the default microphone *or* a push audio stream fed
#   from the shared ``AudioRecorder``.  When a queue is supplied the class will
#   consume PCM frames from that queue and forward them to Azure via a
#   ``PushAudioInputStream``.  This allows all engines (Wav2Vec2 + Azure) to use
#   the same microphone source.
# – Event-based wait on stop() to capture final results
# ---------------------------------------------------------------------------
import os
import json
import queue
import threading
from datetime import datetime, timezone

from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk
from rich.console import Console
from rich.panel import Panel

console = Console()


# ─────────────────────────────────────────────────────────────────────────────
# Pronunciation Evaluator
# ─────────────────────────────────────────────────────────────────────────────
class AzurePronunciationEvaluator:
    def __init__(
        self,
        reference_text: str,
        results: dict | None = None,
        realtime: bool = True,
        *,
        audio_queue: queue.Queue | None = None,
        sample_rate: int = 16000,
        timeline=None,
    ):
        """Pronunciation assessment via Azure.

        Parameters
        ----------
        reference_text:
            The sentence the learner should read.
        results:
            Shared results dictionary; populated in-place.
        realtime:
            If ``True`` run in streaming mode, otherwise expect to be called on
            a saved WAV file via :func:`process_file`.
        audio_queue:
            Optional queue of PCM ``int16`` numpy arrays.  When provided the
            queue is consumed and forwarded to Azure via a
            ``PushAudioInputStream`` so that all engines share the same
            microphone recording.
        sample_rate:
            Sample rate of the audio in ``audio_queue``.
        """

        load_dotenv()
        key    = os.getenv("AZURE_SPEECH_KEY")
        region = os.getenv("AZURE_SPEECH_REGION")
        if not key or not region:
            raise ValueError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars")

        self.reference_text = reference_text
        self.realtime = realtime
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.timeline = timeline
        self._feed_thread = None
        self._push_stream = None
        self.bytes_pushed = 0
        self._event_counts = {"recognizing": 0, "recognized": 0, "canceled": 0}
        self._handlers_attached = False

        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.speech_recognition_language = "nl-NL"
        speech_config.output_format = speechsdk.OutputFormat.Detailed

        if self.realtime and self.audio_queue is not None:
            fmt = speechsdk.audio.AudioStreamFormat(
                samples_per_second=self.sample_rate,
                bits_per_sample=16,
                channels=1,
            )
            self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=fmt)
            audio_config = speechsdk.audio.AudioConfig(stream=self._push_stream)
        else:
            audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        # Build pronunciation-assessment config
        pa_json = json.dumps({
            "referenceText": self.reference_text,
            "gradingSystem": "HundredMark",
            "granularity": "Phoneme",
            "phonemeAlphabet": "SAPI",
            "nBestPhonemeCount": 1
        })
        pa_cfg = speechsdk.PronunciationAssessmentConfig(json_string=pa_json)
        pa_cfg.enable_prosody_assessment()

        self.speech_config = speech_config
        self.pa_cfg = pa_cfg
        if self.realtime:
            self.recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                audio_config=audio_config,
            )
            self.pa_cfg.apply_to(self.recognizer)

            phrase_list = speechsdk.PhraseListGrammar.from_recognizer(self.recognizer)
            phrase_list.addPhrase(self.reference_text)

        # ── Event-based “done” flag
        self._done_event = threading.Event()
        self._running = False

        # Per-turn gating
        self._turn_id = None  # type: str | None
        self._turn_recognized_baseline = 0
        self._turn_final_event = threading.Event()

        # Shared results dict
        self.results = results
        if self.results is not None:
            self.results["azure_pronunciation"] = {
                "final_transcript": None,
                "word_timings": [],
                "pronunciation_scores": {}
            }

        if self.timeline is not None and "azure_constructed" not in getattr(self.timeline, "_marks", {}):
            self.timeline.mark("azure_constructed")

    # ------------------------------------------------------------------ internal
    def _feed_audio(self):
        """Forward PCM frames from ``audio_queue`` into Azure."""
        if self._push_stream is None or self.audio_queue is None:
            return
        while True:
            pcm = self.audio_queue.get()
            if pcm is None:
                break
            try:
                data = pcm.tobytes()
                if self.timeline is not None and "azure_first_write" not in getattr(self.timeline, "_marks", {}):
                    self.timeline.mark("azure_first_write")
                self.bytes_pushed += len(data)
                self._push_stream.write(data)
            except Exception:
                break

    # ------------------------------------------------------------------ callbacks
    def _on_interim(self, evt):
        if self._turn_id is None:
            return
        self._event_counts["recognizing"] += 1
        if self.timeline is not None and "azure_handshake_first_event" not in getattr(self.timeline, "_marks", {}):
            self.timeline.mark("azure_handshake_first_event")
        console.print(f"[yellow][Azure Pron interim][/yellow] {evt.result.text}", end="\r")

    def _on_final(self, evt):
        if self._turn_id is None:
            return
        if self.results is None or "azure_pronunciation" not in self.results:
            self._turn_final_event.set()
            return
        self._event_counts["recognized"] += 1
        text = evt.result.text
        console.print(f"\n[bold green][Azure Pron final][/bold green] {text}")

        prev = self.results["azure_pronunciation"].get("final_transcript")
        if prev:
            self.results["azure_pronunciation"]["final_transcript"] = f"{prev} {text}".strip()
        else:
            self.results["azure_pronunciation"]["final_transcript"] = text

        raw_json = evt.result.properties.get(
            speechsdk.PropertyId.SpeechServiceResponse_JsonResult
        )
        if not raw_json:
            self._turn_final_event.set()
            return

        parsed = json.loads(raw_json)
        best = parsed.get("NBest", [{}])[0]

        # word timings
        for w in best.get("Words", []):
            offset = w.get("Offset", 0) / 10_000_000
            duration = w.get("Duration", 0) / 10_000_000
            self.results["azure_pronunciation"]["word_timings"].append({
                "word": w.get("Word", ""),
                "start_s": round(offset, 2),
                "end_s": round(offset + duration, 2),
                "accuracy_score": round(
                    w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0), 1
                ),
                "error_type": w.get("PronunciationAssessment", {}).get("ErrorType", None),
                "phoneme_scores": [
                    p.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0)
                    for p in w.get("Phonemes", [])
                ]
            })

        # overall scores
        pa = best.get("PronunciationAssessment", {})
        self.results["azure_pronunciation"]["pronunciation_scores"] = {
            "pron_score": round(pa.get("PronScore", 0.0), 1),
            "accuracy_score": round(pa.get("AccuracyScore", 0.0), 1),
            "fluency_score": round(pa.get("FluencyScore", 0.0), 1),
            "completeness_score": round(pa.get("CompletenessScore", 0.0), 1),
            "prosody_score": round(pa.get("ProsodyScore", 0.0), 1)
            if "ProsodyScore" in pa else None
        }
        self._turn_final_event.set()

    def _on_canceled(self, evt):
        self._event_counts["canceled"] += 1
        self._running = False

    # ------------------------------------------------------------------ control
    def _attach_handlers_once(self):
        if self._handlers_attached or not self.realtime:
            return
        self.recognizer.recognizing.connect(self._on_interim)
        self.recognizer.recognized.connect(self._on_final)
        self.recognizer.canceled.connect(self._on_canceled)
        self.recognizer.session_stopped.connect(lambda _: self._done_event.set())
        self.recognizer.canceled.connect(lambda _: self._done_event.set())
        self._handlers_attached = True

    def start_if_needed(self):
        """Start continuous recognition if not already running."""
        if not self.realtime or self._running:
            return
        self._attach_handlers_once()
        self.recognizer.start_continuous_recognition()
        self._running = True

    def stop_if_needed(self):
        """Stop continuous recognition if running."""
        if not self.realtime or not self._running:
            return
        self.recognizer.stop_continuous_recognition()
        self._running = False

    def start(self):
        if not self.realtime:
            return
        if self.audio_queue is not None and (self._feed_thread is None or not self._feed_thread.is_alive()):
            self._feed_thread = threading.Thread(target=self._feed_audio, daemon=True)
            self._feed_thread.start()
            console.log("[Azure Pron] feed thread started")
        self.start_if_needed()

    def stop(self, timeout: float | None = None):
        if not self.realtime:
            return
        if self._feed_thread is not None:
            self._feed_thread.join()
        self.stop_if_needed()
        self._done_event.wait(timeout=timeout)
        console.log(
            f"[Azure Pron] bytes pushed={self.bytes_pushed}; events={self._event_counts}"
        )

    # ------------------------------------------------------------------ turns
    def begin_turn(self, turn_id: str, results: dict) -> None:
        self._turn_id = turn_id
        self.results = results
        self._turn_final_event.clear()
        self._turn_recognized_baseline = self._event_counts["recognized"]

    def end_turn(self) -> None:
        self._turn_id = None

    def wait_for_final(self, timeout: float) -> bool:
        if self.bytes_pushed == 0:
            return True
        if self._event_counts["recognized"] > self._turn_recognized_baseline:
            return True
        return self._turn_final_event.wait(timeout)

    def update_reference_text(self, text: str):
        """Replace the reference sentence used for pronunciation scoring."""
        self.reference_text = text
        pa_json = json.dumps({
            "referenceText": self.reference_text,
            "gradingSystem": "HundredMark",
            "granularity": "Phoneme",
            "phonemeAlphabet": "SAPI",
            "nBestPhonemeCount": 1,
        })
        self.pa_cfg = speechsdk.PronunciationAssessmentConfig(json_string=pa_json)
        self.pa_cfg.enable_prosody_assessment()
        if self.realtime:
            self.pa_cfg.apply_to(self.recognizer)
            phrase_list = speechsdk.PhraseListGrammar.from_recognizer(self.recognizer)
            try:
                phrase_list.clear()
            except Exception:
                pass
            phrase_list.addPhrase(self.reference_text)

    # ------------------------------------------------------------------ reuse
    def reset_stream(self, audio_queue: queue.Queue, sample_rate: int = 16000):
        """Close previous push stream and create a fresh one."""
        if not self.realtime:
            return
        try:
            if self._push_stream is not None:
                self._push_stream.close()
        except Exception:
            pass

        old_q = getattr(self, "audio_queue", None)
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.bytes_pushed = 0
        self._event_counts = {"recognizing": 0, "recognized": 0, "canceled": 0}

        fmt = speechsdk.audio.AudioStreamFormat(
            samples_per_second=self.sample_rate, bits_per_sample=16, channels=1
        )
        self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=fmt)
        audio_config = speechsdk.audio.AudioConfig(stream=self._push_stream)

        self.recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config, audio_config=audio_config
        )
        # Reapply configs / phrase list
        self.pa_cfg.apply_to(self.recognizer)
        phrase_list = speechsdk.PhraseListGrammar.from_recognizer(self.recognizer)
        try:
            phrase_list.clear()
        except Exception:
            pass
        phrase_list.addPhrase(self.reference_text)

        self._handlers_attached = False
        self._attach_handlers_once()

        console.log("[Azure Pron] reset_stream: new push stream")

        if self._feed_thread is not None and self._feed_thread.is_alive():
            try:
                if old_q is not None:
                    old_q.put_nowait(None)
            except Exception:
                pass
            self._feed_thread.join()
        self._feed_thread = threading.Thread(target=self._feed_audio, daemon=True)
        self._feed_thread.start()

    def process_file(self, wav_path: str):
        """Run pronunciation assessment on a saved WAV."""
        if os.path.getsize(wav_path) == 0:
            if self.results is not None:
                self.results["azure_pronunciation"]["final_transcript"] = ""
            return
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=audio_config
        )
        self.pa_cfg.apply_to(recognizer)
        result = recognizer.recognize_once()

        if self.results is not None:
            prev = self.results["azure_pronunciation"].get("final_transcript")
            if prev:
                self.results["azure_pronunciation"]["final_transcript"] = f"{prev} {result.text}".strip()
            else:
                self.results["azure_pronunciation"]["final_transcript"] = result.text

        raw_json = result.properties.get(
            speechsdk.PropertyId.SpeechServiceResponse_JsonResult
        )
        if not raw_json:
            return

        parsed = json.loads(raw_json)
        best = parsed.get("NBest", [{}])[0]
        for w in best.get("Words", []):
            offset = w.get("Offset", 0) / 10_000_000
            duration = w.get("Duration", 0) / 10_000_000
            self.results["azure_pronunciation"]["word_timings"].append({
                "word": w.get("Word", ""),
                "start_s": round(offset, 2),
                "end_s": round(offset + duration, 2),
                "accuracy_score": round(
                    w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0), 1
                ),
                "error_type": w.get("PronunciationAssessment", {}).get("ErrorType", None),
                "phoneme_scores": [
                    p.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0)
                    for p in w.get("Phonemes", [])
                ]
            })

        pa = best.get("PronunciationAssessment", {})
        self.results["azure_pronunciation"]["pronunciation_scores"] = {
            "pron_score": round(pa.get("PronScore", 0.0), 1),
            "accuracy_score": round(pa.get("AccuracyScore", 0.0), 1),
            "fluency_score": round(pa.get("FluencyScore", 0.0), 1),
            "completeness_score": round(pa.get("CompletenessScore", 0.0), 1),
            "prosody_score": round(pa.get("ProsodyScore", 0.0), 1)
            if "ProsodyScore" in pa else None
        }


# ─────────────────────────────────────────────────────────────────────────────
# Plain Transcriber
# ─────────────────────────────────────────────────────────────────────────────
class AzurePlainTranscriber:
    def __init__(
        self,
        language: str = "nl-NL",
        results: dict | None = None,
        realtime: bool = True,
        *,
        audio_queue: queue.Queue | None = None,
        sample_rate: int = 16000,
        timeline=None,
    ):
        load_dotenv()
        key    = os.getenv("AZURE_SPEECH_KEY")
        region = os.getenv("AZURE_SPEECH_REGION")
        if not key or not region:
            raise ValueError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars")

        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.speech_recognition_language = language
        speech_config.output_format = speechsdk.OutputFormat.Simple

        self.realtime = realtime
        self.speech_config = speech_config
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.timeline = timeline
        self._push_stream = None
        self._feed_thread = None
        self.bytes_pushed = 0
        self._event_counts = {"recognizing": 0, "recognized": 0, "canceled": 0}
        self._handlers_attached = False

        if self.realtime and self.audio_queue is not None:
            fmt = speechsdk.audio.AudioStreamFormat(
                samples_per_second=self.sample_rate,
                bits_per_sample=16,
                channels=1,
            )
            self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=fmt)
            audio_config = speechsdk.audio.AudioConfig(stream=self._push_stream)
        else:
            audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)

        if self.realtime:
            self.recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                audio_config=audio_config
            )

        self._done_event = threading.Event()
        self._running = False
        # Per-turn gating
        self._turn_id = None  # type: str | None
        self._turn_recognized_baseline = 0
        self._turn_final_event = threading.Event()
        self.results = results
        if self.results is not None:
            self.results["azure_plain"] = {
                "final_transcript": None,
                "interim_transcripts": []
            }

        if self.timeline is not None and "azure_constructed" not in getattr(self.timeline, "_marks", {}):
            self.timeline.mark("azure_constructed")

    # ------------------------------------------------------------------ internal
    def _feed_audio(self):
        if self._push_stream is None or self.audio_queue is None:
            return
        while True:
            pcm = self.audio_queue.get()
            if pcm is None:
                break
            try:
                data = pcm.tobytes()
                if self.timeline is not None and "azure_first_write" not in getattr(self.timeline, "_marks", {}):
                    self.timeline.mark("azure_first_write")
                self.bytes_pushed += len(data)
                self._push_stream.write(data)
            except Exception:
                break

    # ------------------------------------------------------------------ callbacks
    def _on_interim(self, evt):
        if self._turn_id is None:
            return
        self._event_counts["recognizing"] += 1
        if self.timeline is not None and "azure_handshake_first_event" not in getattr(self.timeline, "_marks", {}):
            self.timeline.mark("azure_handshake_first_event")
        txt = evt.result.text
        console.print(f"[blue][Azure Plain interim][/blue] {txt}", end="\r")
        if self.results is not None and "azure_plain" in self.results:
            self.results["azure_plain"]["interim_transcripts"].append({
                "text": txt,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

    def _on_final(self, evt):
        if self._turn_id is None:
            return
        if self.results is None or "azure_plain" not in self.results:
            self._turn_final_event.set()
            return
        self._event_counts["recognized"] += 1
        txt = evt.result.text
        console.print(f"\n[bold blue][Azure Plain final][/bold blue] {txt}")
        prev = self.results["azure_plain"].get("final_transcript")
        if prev:
            self.results["azure_plain"]["final_transcript"] = f"{prev} {txt}".strip()
        else:
            self.results["azure_plain"]["final_transcript"] = txt
        self._turn_final_event.set()

    def _on_canceled(self, evt):
        self._event_counts["canceled"] += 1
        self._running = False

    # ------------------------------------------------------------------ control
    def _attach_handlers_once(self):
        if self._handlers_attached or not self.realtime:
            return
        self.recognizer.recognizing.connect(self._on_interim)
        self.recognizer.recognized.connect(self._on_final)
        self.recognizer.canceled.connect(self._on_canceled)
        self.recognizer.session_stopped.connect(lambda _: self._done_event.set())
        self.recognizer.canceled.connect(lambda _: self._done_event.set())
        self._handlers_attached = True

    def start_if_needed(self):
        """Start continuous recognition if not already running."""
        if not self.realtime or self._running:
            return
        self._attach_handlers_once()
        self.recognizer.start_continuous_recognition()
        self._running = True

    def stop_if_needed(self):
        """Stop continuous recognition if running."""
        if not self.realtime or not self._running:
            return
        self.recognizer.stop_continuous_recognition()
        self._running = False

    def start(self):
        if not self.realtime:
            return
        if self.audio_queue is not None and (self._feed_thread is None or not self._feed_thread.is_alive()):
            self._feed_thread = threading.Thread(target=self._feed_audio, daemon=True)
            self._feed_thread.start()
            console.log("[Azure Plain] feed thread started")
        self.start_if_needed()

    def stop(self, timeout: float | None = None):
        if not self.realtime:
            return
        if self._feed_thread is not None:
            self._feed_thread.join()
        self.stop_if_needed()
        self._done_event.wait(timeout=timeout)
        console.log(
            f"[Azure Plain] bytes pushed={self.bytes_pushed}; events={self._event_counts}"
        )

    # ------------------------------------------------------------------ turns
    def begin_turn(self, turn_id: str, results: dict) -> None:
        self._turn_id = turn_id
        self.results = results
        self._turn_final_event.clear()
        self._turn_recognized_baseline = self._event_counts["recognized"]

    def end_turn(self) -> None:
        self._turn_id = None

    def wait_for_final(self, timeout: float) -> bool:
        if self.bytes_pushed == 0:
            return True
        if self._event_counts["recognized"] > self._turn_recognized_baseline:
            return True
        return self._turn_final_event.wait(timeout)

    def process_file(self, wav_path: str):
        """Transcribe a saved WAV using Azure."""
        if os.path.getsize(wav_path) == 0:
            if self.results is not None:
                self.results["azure_plain"]["final_transcript"] = ""
            return
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=audio_config
        )
        result = recognizer.recognize_once()
        if self.results is not None:
            prev = self.results["azure_plain"].get("final_transcript")
            if prev:
                self.results["azure_plain"]["final_transcript"] = f"{prev} {result.text}".strip()
            else:
                self.results["azure_plain"]["final_transcript"] = result.text

    # ------------------------------------------------------------------ reuse
    def reset_stream(self, audio_queue: queue.Queue, sample_rate: int = 16000):
        """Close previous push stream and create a fresh one."""
        if not self.realtime:
            return
        try:
            if self._push_stream is not None:
                self._push_stream.close()
        except Exception:
            pass

        old_q = getattr(self, "audio_queue", None)
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.bytes_pushed = 0
        self._event_counts = {"recognizing": 0, "recognized": 0, "canceled": 0}

        fmt = speechsdk.audio.AudioStreamFormat(
            samples_per_second=self.sample_rate, bits_per_sample=16, channels=1
        )
        self._push_stream = speechsdk.audio.PushAudioInputStream(stream_format=fmt)
        audio_config = speechsdk.audio.AudioConfig(stream=self._push_stream)

        self.recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config, audio_config=audio_config
        )

        self._handlers_attached = False
        self._attach_handlers_once()

        console.log("[Azure Plain] reset_stream: new push stream")

        if self._feed_thread is not None and self._feed_thread.is_alive():
            try:
                if old_q is not None:
                    old_q.put_nowait(None)
            except Exception:
                pass
            self._feed_thread.join()
        self._feed_thread = threading.Thread(target=self._feed_audio, daemon=True)
        self._feed_thread.start()
