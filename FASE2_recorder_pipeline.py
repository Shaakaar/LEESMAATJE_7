"""
recorder_pipeline.py
--------------------
High-level wrapper around the existing audio, W2V2 and Azure threads.

Usage
-----
from recorder_pipeline import RecorderPipeline
rec = RecorderPipeline()                  # one instance per tutoring session
results = rec.record_sentence("De kat zit op de mat.")
# `results` now ready for GPT
"""
from __future__ import annotations

import time, uuid, json, os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Callable, Tuple
import threading

import sounddevice as sd
from rich.console import Console
from rich.panel import Panel

# Existing engine modules
from FASE2_audio import AudioRecorder, audio_q, flush_audio_queue          # sentinel already handled
from FASE2_wav2vec2_process import (
    Wav2Vec2PhonemeExtractor,
    Wav2Vec2Transcriber,
)
from FASE2_azure_process import (
    AzurePronunciationEvaluator,
    AzurePlainTranscriber,
)

from phonemizer import phonemize

console = Console()

def _ref_ph_map(text: str) -> dict[str, str]:
    return {
        w: phonemize(
            w, language="nl", backend="espeak",
            strip=True, preserve_punctuation=True, with_stress=False
        )
        for w in text.split()
    }

class RecorderPipeline:
    """Orchestrates audio capture + ASR/pronunciation threads for one sentence.

    The realtime behavior of each engine can be configured via ``rt_flags``.
    Pass a dict like ``{"azure_pron": False, "w2v2_phonemes": True}`` to
    override the default environment-variable driven settings.
    """

    def __init__(self,
                 sample_rate: Optional[int] = None,
                 chunk_duration: float = 5,
                 language: str = "nl-NL",
                 rt_flags: Optional[Dict[str, bool]] = None):

        # Pick best available sample rate if not supplied
        if sample_rate is None:
            for sr in (16000, 48000):
                try:
                    sd.check_input_settings(samplerate=sr, channels=1, dtype="float32")
                    sample_rate = sr
                    break
                except Exception:
                    continue
            if sample_rate is None:
                raise RuntimeError("No supported samplerate (need 16000 or 48000 Hz).")

        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.language = language
        self._ph_cache: dict[str, dict[str, str]] = {}

        def _env_flag(key: str, default: str = "true") -> bool:
            return os.getenv(key, default).lower() in ("1", "true", "yes", "on")

        self.rt_flags = {
            "azure_pron": _env_flag("REALTIME_AZURE_PRON", "true"),
            "azure_plain": _env_flag("REALTIME_AZURE_PLAIN", "true"),
            "w2v2_phonemes": _env_flag("REALTIME_W2V2_PHONEMES", "true"),
            "w2v2_asr": _env_flag("REALTIME_W2V2_ASR", "true"),
        }
        if rt_flags:
            self.rt_flags.update(rt_flags)


    def _get_reference_phonemes(self, text: str) -> dict[str, str]:
        if text not in self._ph_cache:
            self._ph_cache[text] = _ref_ph_map(text)
        return self._ph_cache[text]
    
    # ------------------------------------------------------------------ public
    def record_sentence(
        self,
        reference_text: str,
        filler_cb: Callable[[str, float], threading.Thread] | None = None,
        *,
        parallel_offline: bool = False,
    ) -> Tuple[Dict[str, Any], threading.Thread | None]:
        """
        Start recording, wait for Ctrl+C (or VAD auto-stop), stop everything,
        and return a complete results dict.
        """
        session_id = str(uuid.uuid4())
        start_time_iso = datetime.now(timezone.utc).isoformat()
        flush_audio_queue()
        # ---------- shared results dict ----------------------------------
        results: Dict[str, Any] = {
            "session_id": session_id,
            "reference_text": reference_text,
            "reference_phonemes": self._get_reference_phonemes(reference_text),
            "audio_file": None,
            "start_time": start_time_iso,
            "end_time": None,
            "azure_plain": None,
            "azure_pronunciation": None,
            "wav2vec2_asr": None,
            "wav2vec2_phonemes": None,
            "metadata": {
                "language": self.language,
                "chunk_duration": self.chunk_duration
            }
        }

        engine_times: Dict[str, Dict[str, float]] = {
            "azure_pron": {},
            "azure_plain": {},
            "w2v2_phonemes": {},
            "w2v2_asr": {},
        }

        # ---------- create engine threads --------------------------------
        azure_pron = AzurePronunciationEvaluator(
            reference_text,
            results=results,
            realtime=self.rt_flags["azure_pron"],
        )
        azure_plain = AzurePlainTranscriber(
            language=self.language,
            results=results,
            realtime=self.rt_flags["azure_plain"],
        )

        extractor_phonemes = Wav2Vec2PhonemeExtractor(
            sample_rate=self.sample_rate,
            chunk_duration=self.chunk_duration,
            results=results,
            realtime=self.rt_flags["w2v2_phonemes"],
        )
        extractor_text = Wav2Vec2Transcriber(
            sample_rate=self.sample_rate,
            chunk_duration=self.chunk_duration,
            results=results,
            realtime=self.rt_flags["w2v2_asr"],
        )

        recorder = AudioRecorder(
            sample_rate=self.sample_rate,
            channels=1,
            block_duration_ms=20,
            use_vad=False,          # you can expose this as parameter later
        )

        # ---------- start threads ----------------------------------------
        if azure_pron.realtime:
            engine_times["azure_pron"]["start"] = time.perf_counter()
            azure_pron.start()
        if azure_plain.realtime:
            engine_times["azure_plain"]["start"] = time.perf_counter()
            azure_plain.start()
        if extractor_phonemes.realtime:
            engine_times["w2v2_phonemes"]["start"] = time.perf_counter()
            extractor_phonemes.start()
        if extractor_text.realtime:
            engine_times["w2v2_asr"]["start"] = time.perf_counter()
            extractor_text.start()
        recorder.start()

        # filename now known
        results["audio_file"] = recorder.filename

        console.print(Panel.fit(
            f"[green]▶ Speak the sentence now[/green]\n{reference_text}\n"
            "[yellow]Press Ctrl+C when done.[/yellow]",
            border_style="green"
        ))

        # ---------- wait for stop ----------------------------------------
        t_stop_press = None
        try:
            while recorder.is_running():
                time.sleep(0.1)
        except KeyboardInterrupt:
            t_stop_press = time.perf_counter()
            recorder.stop()
            time.sleep(0.1)   # let callbacks flush
            # Ensure all Wav2Vec2 threads see the end-of-stream sentinel
            extra_sentinels = (
                int(extractor_phonemes.realtime)
                + int(extractor_text.realtime)
                - 1
            )
            for _ in range(max(extra_sentinels, 0)):
                recorder.audio_q.put(None)
        else:
            # recorder stopped automatically
            t_stop_press = time.perf_counter()

        filler_thread = (
            filler_cb(reference_text, t_stop_press) if filler_cb else None
        )

        # ---------- shutdown order ---------------------------------------
        offline_threads = []

        if extractor_phonemes.realtime:
            extractor_phonemes.stop()
            extractor_phonemes.join()
            engine_times["w2v2_phonemes"]["end"] = time.perf_counter()
        else:
            def _do_phon():
                extractor_phonemes.process_file(recorder.filename)
            if parallel_offline:
                engine_times["w2v2_phonemes"]["start"] = time.perf_counter()
                def _wrap():
                    _do_phon()
                    engine_times["w2v2_phonemes"]["end"] = time.perf_counter()
                t = threading.Thread(target=_wrap)
                t.start()
                offline_threads.append(t)
            else:
                engine_times["w2v2_phonemes"]["start"] = time.perf_counter()
                _do_phon()
                engine_times["w2v2_phonemes"]["end"] = time.perf_counter()

        if extractor_text.realtime:
            extractor_text.stop()
            extractor_text.join()
            engine_times["w2v2_asr"]["end"] = time.perf_counter()
        else:
            def _do_asr():
                extractor_text.process_file(recorder.filename)
            if parallel_offline:
                engine_times["w2v2_asr"]["start"] = time.perf_counter()
                def _wrap():
                    _do_asr()
                    engine_times["w2v2_asr"]["end"] = time.perf_counter()
                t = threading.Thread(target=_wrap)
                t.start()
                offline_threads.append(t)
            else:
                engine_times["w2v2_asr"]["start"] = time.perf_counter()
                _do_asr()
                engine_times["w2v2_asr"]["end"] = time.perf_counter()

        if azure_pron.realtime:
            azure_pron.stop()
            engine_times["azure_pron"]["end"] = time.perf_counter()
        else:
            def _do_pron():
                azure_pron.process_file(recorder.filename)
            if parallel_offline:
                engine_times["azure_pron"]["start"] = time.perf_counter()
                def _wrap():
                    _do_pron()
                    engine_times["azure_pron"]["end"] = time.perf_counter()
                t = threading.Thread(target=_wrap)
                t.start()
                offline_threads.append(t)
            else:
                engine_times["azure_pron"]["start"] = time.perf_counter()
                _do_pron()
                engine_times["azure_pron"]["end"] = time.perf_counter()

        if azure_plain.realtime:
            azure_plain.stop()
            engine_times["azure_plain"]["end"] = time.perf_counter()
        else:
            def _do_plain():
                azure_plain.process_file(recorder.filename)
            if parallel_offline:
                engine_times["azure_plain"]["start"] = time.perf_counter()
                def _wrap():
                    _do_plain()
                    engine_times["azure_plain"]["end"] = time.perf_counter()
                t = threading.Thread(target=_wrap)
                t.start()
                offline_threads.append(t)
            else:
                engine_times["azure_plain"]["start"] = time.perf_counter()
                _do_plain()
                engine_times["azure_plain"]["end"] = time.perf_counter()

        for t in offline_threads:
            t.join()

        results["end_time"] = datetime.now(timezone.utc).isoformat()
        results["timing"] = {
            "stop_press": t_stop_press,                  # moment Ctrl+C or auto-stop
            "json_ready": time.perf_counter(),           # END of stop→JSON interval
            "engines": engine_times,
        }
        
        # ─── Print the full JSON to the console ───────────────
        json_payload = json.dumps(results, ensure_ascii=False, indent=2)
        console.print(Panel.fit(json_payload, border_style="blue", title="Full JSON"))
        return results, filler_thread

# ---------------------------------------------------------------------------
# quick manual test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    rec = RecorderPipeline()
    res, filler = rec.record_sentence("De kat zit op de mat.")
    if filler:
        filler.join()
    print(json.dumps(res, indent=2, ensure_ascii=False))