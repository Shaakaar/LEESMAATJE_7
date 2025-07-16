"""
gpt_client.py
-------------
Thin async wrapper around GPT chat endpoints that ensures the response
conforms to ``TutorResponse``.  By default the OpenAI API is used, but
Azure OpenAI can be selected via the ``GPT_TUTOR_PROVIDER`` environment
variable.

Env vars required when using the OpenAI API::
    OPENAI_API_KEY
    GPT_TUTOR_MODEL (optional, defaults to "gpt-4o-mini")
    GPT_TUTOR_TEMPERATURE (optional)

When ``GPT_TUTOR_PROVIDER`` is set to ``"azure"`` the following Azure
variables must be provided::
    AZURE_OPENAI_KEY
    AZURE_OPENAI_ENDPOINT   (e.g. "https://my-resource.openai.azure.com")
    AZURE_OPENAI_DEPLOYMENT (name of the chat deployment)
    AZURE_OPENAI_VERSION    (optional API version)
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
PROVIDER = os.getenv("GPT_TUTOR_PROVIDER", "openai").lower()
OPENAI_MODEL = os.getenv("GPT_TUTOR_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_TEMPERATURE = float(os.getenv("GPT_TUTOR_TEMPERATURE", "0.3"))

AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT")
AZURE_OPENAI_VERSION = os.getenv("AZURE_OPENAI_VERSION", "2024-05-13")

ENDPOINT = "https://api.openai.com/v1/chat/completions"
TIMEOUT_S = 15.0


class GPTClientError(Exception):
    pass


async def chat(messages: List[Dict[str, str]],
               max_retries: int = 2) -> TutorResponse:
    """Send ``messages`` to the configured GPT provider and return a
    ``TutorResponse``.

    Raises ``GPTClientError`` on failure.
    """

    if PROVIDER == "azure":
        if not all((AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT,
                    AZURE_OPENAI_DEPLOYMENT)):
            raise GPTClientError(
                "AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT and "
                "AZURE_OPENAI_DEPLOYMENT must be set"
            )

        endpoint = (
            f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
            f"{AZURE_OPENAI_DEPLOYMENT}/chat/completions"
            f"?api-version={AZURE_OPENAI_VERSION}"
        )

        payload: Dict[str, Any] = {
            "messages": messages,
            "temperature": OPENAI_TEMPERATURE,
            "response_format": {"type": "json_object"},
        }

        headers = {
            "api-key": AZURE_OPENAI_KEY,
            "Content-Type": "application/json",
        }
    else:
        if not OPENAI_API_KEY:
            raise GPTClientError("OPENAI_API_KEY env var not set")

        endpoint = ENDPOINT

        payload = {
            "model": OPENAI_MODEL,
            "messages": messages,
            "temperature": OPENAI_TEMPERATURE,
            "response_format": {"type": "json_object"},
        }

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

    async with httpx.AsyncClient(timeout=TIMEOUT_S, http2=True) as client:
        for attempt in range(max_retries + 1):
            try:
                r = await client.post(endpoint, headers=headers, json=payload)
                r.raise_for_status()
                raw_json = r.json()["choices"][0]["message"]["content"]
                parsed = json.loads(raw_json)
                return TutorResponse.parse_obj(parsed)
            except Exception as exc:
                if attempt == max_retries:
                    raise GPTClientError(f"GPT request failed: {exc}") from exc
                await asyncio.sleep(1.0 * (attempt + 1))

