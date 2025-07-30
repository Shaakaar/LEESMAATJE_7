#%%
#%%
import time
import queue
import numpy as np
from functools import lru_cache
import resampy
import torch
import threading

from FASE2_audio import audio_q
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

    def __init__(self, sample_rate: int, chunk_duration: float, results: dict | None, realtime: bool = True, *, audio_queue: queue.Queue = audio_q):
        super().__init__(daemon=True)
        self.realtime = realtime
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_size = int(sample_rate * chunk_duration)
        self.buffer = np.zeros((0,), dtype=np.int16)
        self.running = True
        self.audio_q = audio_queue

        # Reference to shared results dict:
        self.results = results
        if self.results is not None:
            self.results["wav2vec2_phonemes"] = []

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor, self.model = _load_phoneme_model(self.device)

        console.rule(f"[bold magenta]Wav2Vec2 Phoneme Extractor[/bold magenta]", style="magenta")
        console.print(f"🔄  [magenta]Loading Wav2Vec2 phoneme model[/magenta] on [blue]{self.device}[/blue] …")
        self.model.eval()
        console.print("[magenta]✅  Model loaded.[/magenta]\n")

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
        while self.running:
            try:
                pcm_frames = self.audio_q.get(timeout=1.0)
                # Sentinel value None means end-of-stream
                if pcm_frames is None:
                    break
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
        if len(self.buffer) > 0:
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

            readable_ts = datetime.now().strftime("%H:%M:%S")

            if self.results is not None:
                self.results["wav2vec2_phonemes"].append({
                    "timestamp": readable_ts,
                    "phonemes": phonemes
                })

            console.print(
                Panel.fit(
                    Text(f"[{readable_ts}]  {' '.join(phonemes)}", style="white"),
                    title="[bold magenta]Phonemes (Wav2Vec2)[/bold magenta]  (final short chunk)",
                    border_style="magenta",
                    width=80
                )
            )

        console.print("[magenta]■ Wav2Vec2PhonemeExtractor thread stopped.[/magenta]\n")

    def stop(self):
        self.running = False

    # ------------------------------------------------------------------ offline
    def process_file(self, wav_path: str):
        """Run phoneme extraction on a saved WAV file."""
        import soundfile as sf

        data, sr = sf.read(wav_path)
        # Skip processing if the file is empty
        if data.size == 0:
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

        with torch.inference_mode():
            inputs = self.processor(data, sampling_rate=16000, return_tensors="pt", padding=True)
            iv = inputs.input_values.to(self.device)
            logits = self.model(iv).logits
            pred_ids = torch.argmax(logits, dim=-1)
            phonemes = self.processor.batch_decode(pred_ids)[0].split()

        if self.results is not None:
            self.results["wav2vec2_phonemes"].append({
                "timestamp": "0",
                "phonemes": phonemes
            })


#──────────────────────────────────────────────────────────────────────────────
# Wav2Vec2 TRANSCRIBER
#──────────────────────────────────────────────────────────────────────────────

class Wav2Vec2Transcriber(threading.Thread):
    """Streams Dutch ASR text in real‑time or processes a file offline."""

    def __init__(self, sample_rate: int, chunk_duration: float, results: dict | None, realtime: bool = True, *, audio_queue: queue.Queue = audio_q):
        super().__init__(daemon=True)
        self.realtime = realtime
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_size = int(sample_rate * chunk_duration)
        self.buffer = np.zeros((0,), dtype=np.int16)
        self.running = True
        self.audio_q = audio_queue

        self.results = results
        if self.results is not None:
            self.results["wav2vec2_asr"] = []

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor, self.model = _load_asr_model(self.device)

        console.rule(f"[bold cyan]Wav2Vec2 Transcriber[/bold cyan]", style="cyan")
        console.print(f"🔄  [cyan]Loading Wav2Vec2 ASR model[/cyan] '{ASR_MODEL_ID}' on [blue]{self.device}[/blue] …")

        self.model.eval()
        console.print("[cyan]✅  Model loaded and ready.[/cyan]\n")

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
        while self.running:
            try:
                pcm_frames = self.audio_q.get(timeout=1.0)
                # Sentinel value None means end-of-stream
                if pcm_frames is None:
                    break
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
        if len(self.buffer) > 0:
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

            if self.results is not None:
                self.results["wav2vec2_asr"].append({
                    "timestamp": ts,
                    "transcript": transcript
                })

            console.print(
                Panel.fit(
                    Text(f"[{ts}]  {transcript}", style="white"),
                    title="[bold cyan]ASR Text (Wav2Vec2)[/bold cyan]  (final short chunk)",
                    border_style="cyan",
                    width=80
                )
            )

        console.print("[cyan]■ Wav2Vec2Transcriber thread stopped.[/cyan]\n")

    def stop(self):
        self.running = False

    # ------------------------------------------------------------------ offline
    def process_file(self, wav_path: str):
        """Run ASR on a saved WAV file."""
        import soundfile as sf

        data, sr = sf.read(wav_path)
        if data.size == 0:
            if self.results is not None:
                self.results["wav2vec2_asr"].append({
                    "timestamp": "0",
                    "transcript": ""
                })
            return
        if sr != 16000:
            data = resampy.resample(data, sr, 16000)
        if data.ndim > 1:
            data = data[:, 0]

        with torch.inference_mode():
            inputs = self.processor(data, sampling_rate=16000, return_tensors="pt", padding=True)
            logits = self.model(inputs.input_values.to(self.device)).logits
            pred_ids = torch.argmax(logits, dim=-1)
            transcript = self.processor.batch_decode(pred_ids)[0]

        if self.results is not None:
            self.results["wav2vec2_asr"].append({
                "timestamp": "0",
                "transcript": transcript
            })