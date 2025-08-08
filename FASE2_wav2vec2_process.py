#%%
#%%
import time
import queue
import numpy as np
from functools import lru_cache
import resampy
import torch
import threading

from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from datetime import datetime

console = Console()


# ────────── ONE-TIME LOADERS ──────────────────────────────────────────
PHONEME_MODEL_ID = "Clementapa/wav2vec2-base-960h-phoneme-reco-dutch"
ASR_MODEL_ID     = "facebook/wav2vec2-large-xlsr-53-dutch"

@lru_cache(maxsize=1)
def _load_phoneme_model(device: str):
    console.print(f"[green]🔄 Loading phoneme model once on {device}…[/green]")
    proc = Wav2Vec2Processor.from_pretrained(PHONEME_MODEL_ID)
    mdl  = Wav2Vec2ForCTC.from_pretrained(PHONEME_MODEL_ID).to(device)
    mdl.eval()
    return proc, mdl

@lru_cache(maxsize=1)
def _load_asr_model(device: str):
    console.print(f"[green]🔄 Loading ASR model once on {device}…[/green]")
    proc = Wav2Vec2Processor.from_pretrained(ASR_MODEL_ID)
    mdl  = Wav2Vec2ForCTC.from_pretrained(ASR_MODEL_ID).to(device)
    mdl.eval()
    return proc, mdl
# ──────────────────────────────────────────────────────────────────────


#──────────────────────────────────────────────────────────────────────────────
# Wav2Vec2 PHONEME EXTRACTOR
#──────────────────────────────────────────────────────────────────────────────

class Wav2Vec2PhonemeExtractor(threading.Thread):
    """Extracts Dutch phonemes in either real‑time or offline mode."""

    def __init__(
        self,
        sample_rate: int,
        chunk_duration: float,
        results: dict | None,
        realtime: bool = True,
        *,
        audio_queue: queue.Queue | None = None,
        timeline=None,
    ):
        super().__init__(daemon=True)
        self.realtime = realtime
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_size = int(sample_rate * chunk_duration)
        self.buffer = np.zeros((0,), dtype=np.int16)
        # shutdown flag allows thread to run across recordings and only exit
        # when ``terminate`` is called.
        self._shutdown = False
        self.audio_q = audio_queue or queue.Queue()
        self.eor_event = threading.Event()

        # Reference to shared results dict:
        self.results = results
        if self.results is not None:
            self.results["wav2vec2_phonemes"] = []

        self.timeline = timeline

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor, self.model = _load_phoneme_model(self.device)

        console.rule(f"[bold magenta]Wav2Vec2 Phoneme Extractor[/bold magenta]", style="magenta")
        console.print(f"🔄  [magenta]Loading Wav2Vec2 phoneme model[/magenta] on [blue]{self.device}[/blue] …")
        self.model.eval()
        console.print("[magenta]✅  Model loaded.[/magenta]\n")

    def on_new_recording(self, q: queue.Queue):
        self.audio_q = q
        self.buffer = np.zeros((0,), dtype=np.int16)
        self.eor_event.clear()

    def run(self):
        if not self.realtime:
            return
        console.print(
            Panel.fit(
                Text(
                    f"[PhonemeExtractor] Running — need {self.chunk_size} samples (~{self.chunk_size/self.sample_rate:.2f}s) per chunk.",
                    style="white"
                ),
                title="📦 Buffer Info",
                border_style="magenta"
            )
        )

        # ─────────────── Phase 1: Normal processing ───────────────
        while not self._shutdown:
            try:
                pcm_frames = self.audio_q.get(timeout=1.0)
                if pcm_frames is None:
                    # Boundary between recordings – flush once and signal end.
                    if self.buffer.size:
                        self._process_final_chunk()
                    self.buffer = np.zeros((0,), dtype=np.int16)
                    self.eor_event.set()
                    continue
            except queue.Empty:
                continue
            self.buffer = np.concatenate((self.buffer, pcm_frames), axis=0)

            while len(self.buffer) >= self.chunk_size:
                chunk = self.buffer[: self.chunk_size]
                self.buffer = self.buffer[self.chunk_size :]

                # Resample to 16 kHz if needed
                if self.sample_rate != 16000:
                    float32_audio = chunk.astype(np.float32) / 32768.0
                    resampled = resampy.resample(float32_audio, self.sample_rate, 16000)
                    model_input = resampled
                else:
                    model_input = chunk.astype(np.float32) / 32768.0

                # Inference
                with torch.inference_mode():
                    inputs = self.processor(
                        model_input, sampling_rate=16000, return_tensors="pt", padding=True
                    )
                    iv = inputs.input_values.to(self.device)
                    logits = self.model(iv).logits
                    pred_ids = torch.argmax(logits, dim=-1)
                    transcription = self.processor.batch_decode(pred_ids)[0]
                    phonemes = transcription.split()

                if self.timeline is not None and "w2v2_first_decode" not in getattr(self.timeline, "_marks", {}):
                    self.timeline.mark("w2v2_first_decode")

                # Get wall-clock “HH:MM:SS” stamp:
                readable_ts = datetime.now().strftime("%H:%M:%S")

                # 1) Append this chunk to results:
                if self.results is not None:
                    self.results["wav2vec2_phonemes"].append({
                        "timestamp": readable_ts,
                        "phonemes": phonemes,
                    })

                # 2) Console preview:
                console.print(
                    Panel.fit(
                        Text(f"[{readable_ts}]  {' '.join(phonemes)}", style="white"),
                        title="[bold magenta]Phonemes (Wav2Vec2)[/bold magenta]",
                        border_style="magenta",
                        width=80
                    )
                )

        # ─────────────── Final short‐chunk inference ───────────────
        if self.buffer.size:
            self._process_final_chunk()

        console.print("[magenta]■ Wav2Vec2PhonemeExtractor thread stopped.[/magenta]\n")

    def _process_final_chunk(self) -> None:
        if self.sample_rate != 16000:
            float32_audio = self.buffer.astype(np.float32) / 32768.0
            resampled = resampy.resample(float32_audio, self.sample_rate, 16000)
            model_input = resampled
        else:
            model_input = self.buffer.astype(np.float32) / 32768.0

        with torch.inference_mode():
            inputs = self.processor(
                model_input, sampling_rate=16000, return_tensors="pt", padding=True
            )
            iv = inputs.input_values.to(self.device)
            logits = self.model(iv).logits
            pred_ids = torch.argmax(logits, dim=-1)
            transcription = self.processor.batch_decode(pred_ids)[0]
            phonemes = transcription.split()

        if not phonemes:
            rms = float(np.sqrt(np.mean(model_input ** 2)))
            console.log(
                f"[yellow][W2V2 phonemes] empty decode; samples={len(model_input)}, rms={rms:.6f}[/yellow]"
            )
            if self.results is not None:
                self.results.setdefault("wav2vec2_phonemes_debug", []).append(
                    {
                        "stage": "final_chunk",
                        "samples": int(len(model_input)),
                        "rms": rms,
                    }
                )

        readable_ts = datetime.now().strftime("%H:%M:%S")
        if self.results is not None:
            self.results["wav2vec2_phonemes"].append(
                {"timestamp": readable_ts, "phonemes": phonemes}
            )
        console.print(
            Panel.fit(
                Text(f"[{readable_ts}]  {' '.join(phonemes)}", style="white"),
                title="[bold magenta]Phonemes (Wav2Vec2)[/bold magenta]  (final short chunk)",
                border_style="magenta",
                width=80,
            )
        )
        self.buffer = np.zeros((0,), dtype=np.int16)

    def terminate(self) -> None:
        """Signal the thread to exit after the current recording."""
        self._shutdown = True
        try:
            # Wake the thread if it is waiting on the queue.
            self.audio_q.put_nowait(None)
        except Exception:
            pass

    # Backwards compatibility – ``stop`` used to stop the thread.  Now it
    # simply forwards to :py:meth:`terminate`.
    def stop(self) -> None:  # pragma: no cover - legacy API
        self.terminate()

    # ------------------------------------------------------------------ offline
    def process_file(self, wav_path: str):
        """Run phoneme extraction on a saved WAV file."""
        import soundfile as sf

        data, sr = sf.read(wav_path)
        # Skip processing if the file is empty
        if data.size == 0:
            console.log(f"[red][W2V2 phonemes] loaded empty file: {wav_path}[/red]")
            if self.results is not None:
                self.results["wav2vec2_phonemes"].append({
                    "timestamp": "0",
                    "phonemes": []
                })
            return
        if sr != 16000:
            data = resampy.resample(data, sr, 16000)
        if data.ndim > 1:
            data = data[:, 0]

        rms = float(np.sqrt(np.mean(data ** 2)))
        duration_s = len(data) / 16000.0

        with torch.inference_mode():
            inputs = self.processor(data, sampling_rate=16000, return_tensors="pt", padding=True)
            iv = inputs.input_values.to(self.device)
            logits = self.model(iv).logits
            pred_ids = torch.argmax(logits, dim=-1)
            phonemes = self.processor.batch_decode(pred_ids)[0].split()

        if not phonemes:
            console.log(
                f"[yellow][W2V2 phonemes] empty decode from file; duration={duration_s:.2f}s, rms={rms:.6f}[/yellow]"
            )

        if self.results is not None:
            self.results["wav2vec2_phonemes"].append({
                "timestamp": "0",
                "phonemes": phonemes
            })
            self.results.setdefault("wav2vec2_phonemes_debug", []).append({
                "stage": "offline",
                "file": wav_path,
                "samples": int(len(data)),
                "duration_s": duration_s,
                "rms": rms,
            })


#──────────────────────────────────────────────────────────────────────────────
# Wav2Vec2 TRANSCRIBER
#──────────────────────────────────────────────────────────────────────────────

class Wav2Vec2Transcriber(threading.Thread):
    """Streams Dutch ASR text in real‑time or processes a file offline."""

    def __init__(
        self,
        sample_rate: int,
        chunk_duration: float,
        results: dict | None,
        realtime: bool = True,
        *,
        audio_queue: queue.Queue | None = None,
        timeline=None,
    ):
        super().__init__(daemon=True)
        self.realtime = realtime
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_size = int(sample_rate * chunk_duration)
        self.buffer = np.zeros((0,), dtype=np.int16)
        self._shutdown = False
        self.audio_q = audio_queue or queue.Queue()
        self.eor_event = threading.Event()

        self.results = results
        if self.results is not None:
            self.results["wav2vec2_asr"] = []

        self.timeline = timeline

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor, self.model = _load_asr_model(self.device)

        console.rule(f"[bold cyan]Wav2Vec2 Transcriber[/bold cyan]", style="cyan")
        console.print(f"🔄  [cyan]Loading Wav2Vec2 ASR model[/cyan] '{ASR_MODEL_ID}' on [blue]{self.device}[/blue] …")

        self.model.eval()
        console.print("[cyan]✅  Model loaded and ready.[/cyan]\n")

    def on_new_recording(self, q: queue.Queue):
        self.audio_q = q
        self.buffer = np.zeros((0,), dtype=np.int16)
        self.eor_event.clear()

    def run(self):
        if not self.realtime:
            return
        console.print(
            Panel.fit(
                Text(
                    f"[Wav2Vec2Transcriber] Running — need {self.chunk_size} samples (~{self.chunk_duration:.2f}s) per chunk.",
                    style="white"
                ),
                title="📦 Buffer Info",
                border_style="cyan"
            )
        )

        # ─────────────── Phase 1: Normal processing ───────────────
        while not self._shutdown:
            try:
                pcm_frames = self.audio_q.get(timeout=1.0)
                if pcm_frames is None:
                    if self.buffer.size:
                        self._process_final_chunk()
                    self.buffer = np.zeros((0,), dtype=np.int16)
                    self.eor_event.set()
                    continue
            except queue.Empty:
                continue

            self.buffer = np.concatenate((self.buffer, pcm_frames), axis=0)

            while len(self.buffer) >= self.chunk_size:
                chunk = self.buffer[: self.chunk_size]
                self.buffer = self.buffer[self.chunk_size :]

                if self.sample_rate != 16000:
                    float_chunk = chunk.astype(np.float32) / 32768.0
                    float_chunk = resampy.resample(float_chunk, self.sample_rate, 16000)
                else:
                    float_chunk = chunk.astype(np.float32) / 32768.0

                input_values = self.processor(
                    float_chunk, sampling_rate=16000, return_tensors="pt", padding=True
                ).input_values.to(self.device)

                with torch.inference_mode():
                    logits = self.model(input_values).logits
                    pred_ids = torch.argmax(logits, dim=-1)
                    transcript = self.processor.batch_decode(pred_ids)[0]

                if self.timeline is not None and "w2v2_first_decode" not in getattr(self.timeline, "_marks", {}):
                    self.timeline.mark("w2v2_first_decode")

                ts = datetime.now().strftime("%H:%M:%S")

                if self.results is not None:
                    self.results["wav2vec2_asr"].append({
                        "timestamp": ts,
                        "transcript": transcript
                    })

                console.print(
                    Panel.fit(
                        Text(f"[{ts}]  {transcript}", style="white"),
                        title="[bold cyan]ASR Text (Wav2Vec2)[/bold cyan]",
                        border_style="cyan",
                        width=80
                    )
                )

        # ─────────────── Final short‐chunk inference ───────────────
        if self.buffer.size:
            self._process_final_chunk()

        console.print("[cyan]■ Wav2Vec2Transcriber thread stopped.[/cyan]\n")

    def _process_final_chunk(self) -> None:
        if self.sample_rate != 16000:
            float_chunk = self.buffer.astype(np.float32) / 32768.0
            float_chunk = resampy.resample(float_chunk, self.sample_rate, 16000)
        else:
            float_chunk = self.buffer.astype(np.float32) / 32768.0

        input_values = self.processor(
            float_chunk, sampling_rate=16000, return_tensors="pt", padding=True
        ).input_values.to(self.device)

        with torch.inference_mode():
            logits = self.model(input_values).logits
            pred_ids = torch.argmax(logits, dim=-1)
            transcript = self.processor.batch_decode(pred_ids)[0]

        ts = datetime.now().strftime("%H:%M:%S")

        if not transcript.strip():
            rms = float(np.sqrt(np.mean(float_chunk ** 2)))
            console.log(
                f"[yellow][W2V2 ASR] empty decode; samples={len(float_chunk)}, rms={rms:.6f}[/yellow]"
            )
            if self.results is not None:
                self.results.setdefault("wav2vec2_asr_debug", []).append(
                    {
                        "stage": "final_chunk",
                        "samples": int(len(float_chunk)),
                        "rms": rms,
                    }
                )

        if self.results is not None:
            self.results["wav2vec2_asr"].append(
                {"timestamp": ts, "transcript": transcript}
            )
        console.print(
            Panel.fit(
                Text(f"[{ts}]  {transcript}", style="white"),
                title="[bold cyan]ASR Text (Wav2Vec2)[/bold cyan]  (final short chunk)",
                border_style="cyan",
                width=80,
            )
        )
        self.buffer = np.zeros((0,), dtype=np.int16)

    def terminate(self) -> None:
        """Signal the thread to exit after the current recording."""
        self._shutdown = True
        try:
            self.audio_q.put_nowait(None)
        except Exception:
            pass

    def stop(self) -> None:  # pragma: no cover - legacy API
        self.terminate()

    # ------------------------------------------------------------------ offline
    def process_file(self, wav_path: str):
        """Run ASR on a saved WAV file."""
        import soundfile as sf

        data, sr = sf.read(wav_path)
        if data.size == 0:
            console.log(f"[red][W2V2 ASR] loaded empty file: {wav_path}[/red]")
            if self.results is not None:
                self.results["wav2vec2_asr"].append({
                    "timestamp": "0",
                    "transcript": "",
                })
            return
        if sr != 16000:
            data = resampy.resample(data, sr, 16000)
        if data.ndim > 1:
            data = data[:, 0]

        rms = float(np.sqrt(np.mean(data ** 2)))
        duration_s = len(data) / 16000.0

        with torch.inference_mode():
            inputs = self.processor(data, sampling_rate=16000, return_tensors="pt", padding=True)
            logits = self.model(inputs.input_values.to(self.device)).logits
            pred_ids = torch.argmax(logits, dim=-1)
            transcript = self.processor.batch_decode(pred_ids)[0]

        if not transcript.strip():
            console.log(
                f"[yellow][W2V2 ASR] empty decode from file; duration={duration_s:.2f}s, rms={rms:.6f}[/yellow]"
            )

        if self.results is not None:
            self.results["wav2vec2_asr"].append({
                "timestamp": "0",
                "transcript": transcript
            })
            self.results.setdefault("wav2vec2_asr_debug", []).append({
                "stage": "offline",
                "file": wav_path,
                "samples": int(len(data)),
                "duration_s": duration_s,
                "rms": rms,
            })
