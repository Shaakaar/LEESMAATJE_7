#%%
# FASE2_azure_process.py
# ---------------------------------------------------------------------------
# Azure PronunciationEvaluator  +  Azure PlainTranscriber
# – Uses default microphone (no shared stream)
# – Event-based wait on stop() to capture final results
# ---------------------------------------------------------------------------
import os
import json
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
    def __init__(self, reference_text: str, results: dict | None = None, realtime: bool = True):
        load_dotenv()
        key    = os.getenv("AZURE_SPEECH_KEY")
        region = os.getenv("AZURE_SPEECH_REGION")
        if not key or not region:
            raise ValueError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars")

        self.reference_text = reference_text
        self.realtime = realtime

        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.speech_recognition_language = "nl-NL"
        speech_config.output_format = speechsdk.OutputFormat.Detailed

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
                audio_config=audio_config
            )
            self.pa_cfg.apply_to(self.recognizer)

            phrase_list = speechsdk.PhraseListGrammar.from_recognizer(self.recognizer)
            phrase_list.addPhrase(self.reference_text)

            # ── Event handlers
            self.recognizer.recognizing.connect(self._on_interim)
            self.recognizer.recognized.connect(self._on_final)

        # ── Event-based “done” flag
        self._done_event = threading.Event()
        if self.realtime:
            self.recognizer.session_stopped.connect(lambda _: self._done_event.set())
            self.recognizer.canceled.connect(lambda _: self._done_event.set())

        self._running = False

        # Shared results dict
        self.results = results
        if self.results is not None:
            self.results["azure_pronunciation"] = {
                "final_transcript": None,
                "word_timings": [],
                "pronunciation_scores": {}
            }

    def reset_results(self, results: dict | None = None):
        """Attach a new results dict and clear cached values."""
        self.results = results
        if self.results is not None:
            self.results["azure_pronunciation"] = {
                "final_transcript": None,
                "word_timings": [],
                "pronunciation_scores": {},
            }

    def update_reference(self, text: str):
        """Change the reference text without rebuilding the recognizer."""
        self.reference_text = text
        pa_json = json.dumps(
            {
                "referenceText": self.reference_text,
                "gradingSystem": "HundredMark",
                "granularity": "Phoneme",
                "phonemeAlphabet": "SAPI",
                "nBestPhonemeCount": 1,
            }
        )
        self.pa_cfg = speechsdk.PronunciationAssessmentConfig(json_string=pa_json)
        self.pa_cfg.enable_prosody_assessment()
        if self.realtime:
            self.pa_cfg.apply_to(self.recognizer)
            phrase_list = speechsdk.PhraseListGrammar.from_recognizer(self.recognizer)
            phrase_list.addPhrase(self.reference_text)

    # ------------------------------------------------------------------ callbacks
    def _on_interim(self, evt):
        console.print(f"[yellow][Azure Pron interim][/yellow] {evt.result.text}", end="\r")

    def _on_final(self, evt):
        text = evt.result.text
        console.print(f"\n[bold green][Azure Pron final][/bold green] {text}")

        if self.results is not None:
            prev = self.results["azure_pronunciation"].get("final_transcript")
            if prev:
                self.results["azure_pronunciation"]["final_transcript"] = f"{prev} {text}".strip()
            else:
                self.results["azure_pronunciation"]["final_transcript"] = text

        raw_json = evt.result.properties.get(
            speechsdk.PropertyId.SpeechServiceResponse_JsonResult
        )
        if not raw_json:
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

    # ------------------------------------------------------------------ control
    def start(self):
        if not self.realtime or self._running:
            return
        self._running = True
        console.print(
            Panel.fit(
                f"▶ [bold green]Azure PronunciationEvaluator[/bold green] listening…\n   “[cyan]{self.reference_text}[/cyan]”",
                border_style="green"
            )
        )
        self.recognizer.start_continuous_recognition()

    def stop(self, timeout: float = 1.0):
        if not self.realtime or not self._running:
            return
        self._running = False
        console.print("[red]■ Stopping Azure Pron…[/red]")
        self.recognizer.stop_continuous_recognition()
        self._done_event.wait(timeout=timeout)
        console.print("[red]■ Azure Pron stopped.[/red]\n")

    def process_file(self, wav_path: str):
        """Run pronunciation assessment on a saved WAV."""
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
    def __init__(self, language: str = "nl-NL", results: dict | None = None, realtime: bool = True):
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
        if self.realtime:
            audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)
            self.recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                audio_config=audio_config
            )

        if self.realtime:
            self.recognizer.recognizing.connect(self._on_interim)
            self.recognizer.recognized.connect(self._on_final)

        self._done_event = threading.Event()
        if self.realtime:
            self.recognizer.session_stopped.connect(lambda _: self._done_event.set())
            self.recognizer.canceled.connect(lambda _: self._done_event.set())

        self._running = False
        self.results = results
        if self.results is not None:
            self.results["azure_plain"] = {
                "final_transcript": None,
                "interim_transcripts": []
            }

    def reset_results(self, results: dict | None = None):
        """Attach a new results dict and clear cached values."""
        self.results = results
        if self.results is not None:
            self.results["azure_plain"] = {
                "final_transcript": None,
                "interim_transcripts": [],
            }

    # ------------------------------------------------------------------ callbacks
    def _on_interim(self, evt):
        txt = evt.result.text
        console.print(f"[blue][Azure Plain interim][/blue] {txt}", end="\r")
        if self.results is not None:
            self.results["azure_plain"]["interim_transcripts"].append({
                "text": txt,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

    def _on_final(self, evt):
        txt = evt.result.text
        console.print(f"\n[bold blue][Azure Plain final][/bold blue] {txt}")
        if self.results is not None:
            prev = self.results["azure_plain"].get("final_transcript")
            if prev:
                self.results["azure_plain"]["final_transcript"] = f"{prev} {txt}".strip()
            else:
                self.results["azure_plain"]["final_transcript"] = txt

    # ------------------------------------------------------------------ control
    def start(self):
        if not self.realtime or self._running:
            return
        self._running = True
        console.print(Panel.fit("▶ [bold blue]Azure PlainTranscriber listening…[/bold blue]", border_style="blue"))
        self.recognizer.start_continuous_recognition()

    def stop(self, timeout: float = 1.0):
        if not self.realtime or not self._running:
            return
        self._running = False
        console.print("[red]■ Stopping Azure Plain…[/red]")
        self.recognizer.stop_continuous_recognition()
        self._done_event.wait(timeout=timeout)
        console.print("[red]■ Azure Plain stopped.[/red]\n")

    def process_file(self, wav_path: str):
        """Transcribe a saved WAV using Azure."""
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
