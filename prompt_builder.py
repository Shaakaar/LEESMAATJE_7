"""
prompt_builder.py
-----------------
Builds the TutorRequest object and the `messages` list for a GPT chat call.

Usage:
    req, messages = build(results_json, state, system_prompt_file="prompt_template.md")
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple

# `tutor_schema.py` lives in the repository root. Import it directly so the
# application does not depend on a `tutor` package being installed.
from tutor_schema import TutorRequest


def _load_system_prompt(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def build(results: Dict[str, Any],
          state: Dict[str, Any] | None,
          system_prompt_file: str = Path(__file__).with_name("prompt_template.md")
          ) -> Tuple[TutorRequest, List[Dict[str, str]]]:
    """
    Convert raw engine `results` + `state` into:
        • TutorRequest pydantic object
        • messages list for openai.ChatCompletion
    """
    sentence_id = results["session_id"]  # reuse until you add per-sentence IDs

    req = TutorRequest(
        session_id=results["session_id"],
        sentence_id=sentence_id,
        reference_text=results.get("reference_text", ""), #supply this when recording 
        reference_phonemes=results.get("reference_phonemes", {}),  
        azure={
            "plain": results.get("azure_plain"),
            "pronunciation": results.get("azure_pronunciation")
        },
        wav2vec2={
            "asr": results.get("wav2vec2_asr"),
            "phonemes": results.get("wav2vec2_phonemes")
        },
        timestamp=datetime.utcnow(),
        history=state.get("history") if state else None
    )

    # ── Build messages
    system_txt = _load_system_prompt(system_prompt_file)
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_txt},
        {"role": "user",   "content": req.model_dump_json()}
    ]

    # If the previous assistant turn exists, prepend it (few LMs like short context)
    if state and state.get("last_assistant"):
        messages.insert(1, state["last_assistant"])

    return req, messages
