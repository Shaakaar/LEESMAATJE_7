"""
gpt_client.py
-------------
Thin async wrapper around OpenAI's chat endpoint that ensures the
response conforms to TutorResponse.

Env vars required:
    OPENAI_API_KEY
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import List, Dict, Any

import httpx
# `tutor_schema.py` lives in the repository root. Import it directly so the
# application does not depend on a `tutor` package being installed.
from tutor_schema import TutorResponse
from dotenv import load_dotenv
load_dotenv()

# ------------------------------------------------------------------ config
OPENAI_MODEL = os.getenv("GPT_TUTOR_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_TEMPERATURE = float(os.getenv("GPT_TUTOR_TEMPERATURE", "0.3"))
ENDPOINT = "https://api.openai.com/v1/chat/completions"
TIMEOUT_S = 15.0


class GPTClientError(Exception):
    pass


async def chat(messages: List[Dict[str, str]],
               max_retries: int = 2) -> TutorResponse:
    if not OPENAI_API_KEY:
        raise GPTClientError("OPENAI_API_KEY env var not set")

    payload: Dict[str, Any] = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "temperature": OPENAI_TEMPERATURE,
        "response_format": {"type": "json_object"}
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_S, http2=True) as client:
        for attempt in range(max_retries + 1):
            try:
                r = await client.post(ENDPOINT, headers=headers, json=payload)
                r.raise_for_status()
                raw_json = r.json()["choices"][0]["message"]["content"]
                parsed = json.loads(raw_json)
                return TutorResponse.parse_obj(parsed)
            except Exception as exc:
                if attempt == max_retries:
                    raise GPTClientError(f"GPT request failed: {exc}") from exc
                await asyncio.sleep(1.0 * (attempt + 1))  # back-off and retry
