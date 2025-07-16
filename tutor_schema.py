#%%
"""
tutor_schema.py
---------------
Typed data models shared by every GPT-tutor component.

• TutorRequest  – payload we send to GPT
• TutorResponse – payload GPT must return
"""

from __future__ import annotations

from typing import List, Literal, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────────
#  Inbound: what we post to GPT
# ──────────────────────────────────────────────────────────────────────────
class TutorRequest(BaseModel):
    # Metadata
    session_id: str
    sentence_id: str
    reference_text: str
    reference_phonemes: Dict[str, str]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Raw engine outputs (same shapes as in FASE2_main JSON)
    azure: Dict[str, Any]
    wav2vec2: Dict[str, Any]

    # Short conversation memory
    history: Optional[List[Dict[str, str]]] = None


# ──────────────────────────────────────────────────────────────────────────
#  Outbound: what GPT must return
# ──────────────────────────────────────────────────────────────────────────
class ErrorItem(BaseModel):
    # Accept both "word" (old) and "expected_word" (new)
    expected_word: str | None = Field(default=None, alias="word")
    heard_word: str | None = None

    expected_phonemes: str
    heard_phonemes: str
    issue: str | None = None

    model_config = {
        "populate_by_name": True  # allows either key in input
    }



class TutorResponse(BaseModel):
    mode: Literal["reading", "conversation", "silence"]
    feedback_text: str = Field(...)
    repeat: bool
    is_correct: bool | None = None
    errors: List[ErrorItem] = Field(default_factory=list)
