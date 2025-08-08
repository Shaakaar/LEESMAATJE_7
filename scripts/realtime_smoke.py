#!/usr/bin/env python3
"""Backend smoke test for realtime session.

This script simulates multiple recordings by feeding a WAV file into the
``RealtimeSession`` queues.  It asserts that all engines complete per-recording
and that Azure streams receive audio.
"""

import argparse
from pathlib import Path
import sys

import numpy as np
import resampy

sys.path.append(str(Path(__file__).resolve().parent.parent))
from webapp.backend import config
from webapp.backend.realtime import RealtimeSession


def _read_wav(path: Path, target_sr: int = 16000) -> np.ndarray:
    """Load ``path`` and resample to ``target_sr``."""
    import wave

    with wave.open(str(path), "rb") as wf:
        sr = wf.getframerate()
        data = wf.readframes(wf.getnframes())
    pcm = np.frombuffer(data, dtype=np.int16)
    if sr != target_sr:
        pcm = resampy.resample(pcm.astype(np.float32), sr, target_sr).astype(np.int16)
    return pcm


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", type=Path, help="Optional WAV file to feed")
    parser.add_argument("--reps", type=int, default=3)
    args = parser.parse_args()

    config.REALTIME_FLAGS.update(
        {"azure_pron": True, "azure_plain": True, "w2v2_phonemes": True, "w2v2_asr": True}
    )

    sr = 16000
    if args.wav:
        audio = _read_wav(args.wav, target_sr=sr)
    else:
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        audio = (0.1 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)

    frame = int(sr * 0.5)  # 0.5s chunks

    session = RealtimeSession("test", sample_rate=sr)
    for _ in range(args.reps):
        session.reset("test", sample_rate=sr)
        for start in range(0, len(audio), frame):
            chunk = audio[start : start + frame]
            session.add_chunk(chunk.tobytes())
        res = session.stop()

        assert session.phon_thread.eor_event.is_set()
        assert session.asr_thread.eor_event.is_set()
        if session.azure_plain_q is not None:
            assert session.azure_plain.bytes_pushed > 0
            assert session.azure_pron.bytes_pushed > 0
            if res["azure_plain"]["final_transcript"] is None or res["azure_pronunciation"]["final_transcript"] is None:
                print("warning: Azure returned no transcript")
        assert res["wav2vec2_asr"]

    print("smoke test passed")


if __name__ == "__main__":
    main()

