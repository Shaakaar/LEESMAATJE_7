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
import re
import string

PUNCT_TRANS = str.maketrans('', '', string.punctuation)


def _strip_punctuation(text: str) -> str:
    if not isinstance(text, str):
        return ''
    return text.translate(PUNCT_TRANS).lower()

# `tutor_schema.py` lives in the repository root. Import it directly so the
# application does not depend on a `tutor` package being installed.
from tutor_schema import TutorRequest


def _combine_asr_chunks(chunks: Any) -> str:
    """Return a clean sentence from wav2vec2_asr chunks."""
    if not chunks:
        return ""
    if isinstance(chunks, str):
        return _strip_punctuation(chunks)
    if isinstance(chunks, list):
        text = " ".join(str(c.get("transcript", "")) for c in chunks)
    else:
        try:
            text = str(chunks)
        except Exception:
            text = ""
    # remove space before punctuation
    text = re.sub(r"\s+([.,!?])", r"\1", text)
    return _strip_punctuation(text.strip())


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

    azure_plain = results.get("azure_plain")
    if isinstance(azure_plain, dict):
        ft = azure_plain.get("final_transcript")
        if isinstance(ft, str):
            azure_plain = azure_plain.copy()
            azure_plain["final_transcript"] = _strip_punctuation(ft)

    azure_pron = results.get("azure_pronunciation")
    if isinstance(azure_pron, dict):
        ft = azure_pron.get("final_transcript")
        if isinstance(ft, str):
            azure_pron = azure_pron.copy()
            azure_pron["final_transcript"] = _strip_punctuation(ft)

    req = TutorRequest(
        session_id=results["session_id"],
        sentence_id=sentence_id,
        reference_text=results.get("reference_text", ""),
        reference_phonemes=results.get("reference_phonemes", {}),
        azure={
            "plain": azure_plain,
            "pronunciation": azure_pron
        },
        wav2vec2={
            "asr": _combine_asr_chunks(results.get("wav2vec2_asr")),
            "phonemes": results.get("wav2vec2_phonemes")
        },
        timestamp=datetime.utcnow(),
        history=state.get("history") if state else None,
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
