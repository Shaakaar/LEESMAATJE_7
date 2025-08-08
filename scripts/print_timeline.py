#!/usr/bin/env python3
"""Print phase deltas from a saved results JSON file."""

import json
import sys
from typing import Dict


def _delta(tl: Dict[str, float], a: str, b: str) -> float | None:
    if a in tl and b in tl:
        return tl[b] - tl[a]
    return None


def main(path: str) -> None:
    with open(path, "r") as f:
        data = json.load(f)
    tb = data.get("timeline_backend", {})
    tf = data.get("timeline_frontend", {})

    print("Backend timings (ms):")
    for a, b, label in [
        ("/start_in", "engine_reset_done", "engine reset"),
        ("azure_start_called", "azure_session_started", "azure handshake"),
        ("first_chunk_received", "azure_first_write", "azure first write"),
        ("w2v2_ready_ph", "w2v2_first_decode", "w2v2 first decode"),
        ("/stop_in", "json_ready", "/stop roundtrip"),
    ]:
        d = _delta(tb, a, b)
        if d is not None:
            print(f"  {label}: {d:.1f} ms")

    print("\nFrontend timings (ms):")
    for a, b, label in [
        ("ui_click", "start_req_sent", "click to /start"),
        ("start_req_sent", "start_resp_ok", "/start roundtrip"),
        ("mic_ready", "worklet_loaded", "mic to worklet"),
        ("processor_ready", "first_chunk_captured", "processor ready"),
        ("first_chunk_captured", "first_chunk_sent", "capture to send"),
    ]:
        d = _delta(tf, a, b)
        if d is not None:
            print(f"  {label}: {d:.1f} ms")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: print_timeline.py RESULTS.json")
        raise SystemExit(1)
    main(sys.argv[1])
