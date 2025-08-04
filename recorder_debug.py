#!/usr/bin/env python3
"""Simple manual test harness for audio recording and analysis.

This script records one sentence and prints the combined JSON results
from Azure transcription/pronunciation and wav2vec2 processing. It is
meant for quick diagnostics when investigating recording issues.

Usage:
    python recorder_debug.py "De kat zit op het dak" --push-azure

Flags allow enabling/disabling engines so each subsystem can be tested
independently.
"""

import argparse
import json

from FASE2_recorder_pipeline import RecorderPipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "text", nargs="?", default="De kat zit op het dak.",
        help="Sentence to read aloud"
    )
    parser.add_argument(
        "--push-azure", action="store_true",
        help="Stream audio directly to Azure during recording"
    )
    parser.add_argument(
        "--no-azure", action="store_true",
        help="Disable Azure engines"
    )
    parser.add_argument(
        "--no-w2v2", action="store_true",
        help="Disable wav2vec2 engines"
    )
    parser.add_argument(
        "--parallel", action="store_true",
        help="Run offline engines in parallel"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rt_flags = {
        "azure_pron": not args.no_azure,
        "azure_plain": not args.no_azure,
        "w2v2_phonemes": not args.no_w2v2,
        "w2v2_asr": not args.no_w2v2,
    }

    rec = RecorderPipeline(rt_flags=rt_flags, use_push_to_azure=args.push_azure)
    results, filler = rec.record_sentence(args.text, parallel_offline=args.parallel)
    if filler:
        filler.join()
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":  # pragma: no cover - manual test utility
    main()
