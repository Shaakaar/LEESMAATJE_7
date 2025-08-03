#%%
#%%
import queue
import threading
import time
import wave
from pathlib import Path

import numpy as np
import sounddevice as sd
import webrtcvad
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

#─── Global console ─────────────────────────────────────────────────────────────
console = Console()

# Shared queue for raw PCM frames (kept for backward compatibility)
audio_q = queue.Queue()

def flush_audio_queue(q: queue.Queue | list[queue.Queue] = None):
    """Remove all pending items from one or many queues.

    Args:
        q: A single ``queue.Queue`` or a list of queues.  If ``None`` the
           global ``audio_q`` is flushed.
    """
    if q is None:
        q = audio_q

    if isinstance(q, list):
        for sub_q in q:
            flush_audio_queue(sub_q)
        return

    while not q.empty():
        try:
            q.get_nowait()
        except queue.Empty:
            break


class AudioRecorder:
    """
    Records from the default microphone, writes to a WAV file, and
    simultaneously enqueues raw PCM frames (int16) into `audio_q`.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        block_duration_ms: int = 20,
        use_vad: bool = False,
        vad_aggressiveness: int = 2,
        silence_timeout_s: float = 1.0,
        *,
        audio_queue: queue.Queue | list[queue.Queue] = audio_q,
    ):
        """
        Args:
            sample_rate:         Mic sampling rate (Hz). Typically 16000 or 48000.
            channels:            Number of channels (1 = mono).
            block_duration_ms:   Size of each block (milliseconds).
            use_vad:             If True, stop after `silence_timeout_s` of silence.
            vad_aggressiveness:  webrtcvad aggressiveness (0–3).
            silence_timeout_s:   Seconds of continuous silence to trigger stop.
        """
        self.sample_rate = sample_rate
        self.channels = channels
        self.block_duration_ms = block_duration_ms
        self.block_size = int(sample_rate * block_duration_ms / 1000)
        self.use_vad = use_vad
        self.silence_timeout_s = silence_timeout_s

        # Support one or multiple subscriber queues.
        if isinstance(audio_queue, list):
            self.audio_qs = audio_queue
        else:
            self.audio_qs = [audio_queue]

        if use_vad:
            self.vad = webrtcvad.Vad(vad_aggressiveness)
            self._silence_accum = 0.0
        else:
            self.vad = None

        self.wavefile = None
        self.filename = None
        self._running = threading.Event()
        self._stream = None

    def _open_wavefile(self):
        ts = time.strftime("%Y%m%d_%H%M%S")
        out_path = Path(f"recording_{ts}.wav")
        self.filename = str(out_path)  # Expose for main
        wf = wave.open(str(out_path), "wb")
        wf.setnchannels(self.channels)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(self.sample_rate)
        self.wavefile = wf

        label = Text(" 🎙️  Saving audio to:", style="bold blue")
        console.print(Panel.fit(label + Text(f" {out_path}", style="white"), border_style="blue"))

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info, status):
        if status:
            console.log(f"[yellow][AudioRecorder warning][/yellow] {status}")

        # float32 in [-1,+1] → int16 PCM
        pcm = (indata[:, 0] * 32767).astype(np.int16)

        # Enqueue for downstream consumers (fan out to all queues)
        for q in self.audio_qs:
            q.put(pcm)

        # Write to WAV file
        if self.wavefile:
            self.wavefile.writeframes(pcm.tobytes())

        # If VAD enabled, check for speech/silence
        if self.use_vad:
            raw_bytes = pcm.tobytes()
            is_speech = True
            try:
                is_speech = self.vad.is_speech(raw_bytes, sample_rate=self.sample_rate)
            except Exception:
                pass

            if is_speech:
                self._silence_accum = 0.0
            else:
                self._silence_accum += self.block_duration_ms / 1000.0
                if self._silence_accum >= self.silence_timeout_s:
                    self.stop()

    def start(self, max_duration_s: float = None):
        """
        Begin recording. Opens the WAV file and starts the mic stream.

        Args:
            max_duration_s: If provided, auto‐stop after this many seconds.
                            Otherwise record until `stop()` is called (or VAD).
        """
        console.rule("[bold green]● Audio Recorder Starting", style="green")
        self._open_wavefile()
        self._running.set()
        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="float32",
                callback=self._audio_callback,
                blocksize=self.block_size,
            )
            self._stream.start()
            console.print(f"[green]▶ Recording started:[/green] [cyan]SR={self.sample_rate} Hz[/cyan], [cyan]block={self.block_duration_ms} ms[/cyan]\n")
        except Exception as e:
            console.print(f"[red]✖ Failed to start audio stream:[/red] {e}")
            self._running.clear()
            if self._stream:
                try:
                    self._stream.close()
                except Exception:
                    pass
                self._stream = None
            if self.wavefile:
                self.wavefile.close()
                self.wavefile = None
                # remove partially created file
                try:
                    Path(self.filename).unlink(missing_ok=True)
                except Exception:
                    pass
            return

        if max_duration_s is not None:
            def _stop_after():
                time.sleep(max_duration_s)
                if self._running.is_set():
                    self.stop()

            threading.Thread(target=_stop_after, daemon=True).start()

    def stop(self):
        """
        Stop recording (called automatically for VAD or max‐duration, or manually).
        Closes WAV file and stops the mic stream.
        """
        if not self._running.is_set():
            return

        self._running.clear()
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

        if self.wavefile:
            self.wavefile.close()
            self.wavefile = None

        time.sleep(0.05)      # optional but robust
        for q in self.audio_qs:
            q.put(None)     # <-- NEW sentinel for each queue

        console.print("[red]■ Recording stopped.[/red]\n")

    def is_running(self) -> bool:
        return self._running.is_set()
