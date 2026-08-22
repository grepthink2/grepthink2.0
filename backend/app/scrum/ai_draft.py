"""LLM drafting for stories/tasks via an OpenAI-compatible endpoint (spec D14).

Provider-agnostic: AI_BASE_URL/AI_API_KEY/AI_MODEL point at Cloudflare Workers AI by
default (free tier, hard-capped), but Groq/Gemini/OpenRouter drop in unchanged.
"""
from __future__ import annotations

import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

LLM_TIMEOUT_S = 15.0

SYSTEM_PROMPT = """You draft scrum items for a university software-engineering team.
Reply with ONLY a JSON object, no prose, in exactly this shape:
{"title": str, "description_md": str, "points": int, "time_estimate": str,
 "tasks": [{"title": str, "tags": [str], "points": int, "time_estimate": str}]}
Rules: tags only from {tags}. points only from {scale}. time_estimate like "4h" or "2d".
For kind=story fill every field with 2-5 tasks; for kind=tasks leave title/description_md
null and propose 3-6 tasks for the given story. Descriptions are concise markdown."""


def snap_points(value, allowed: list[int]):
    if value is None:
        return None
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return min(allowed, key=lambda a: (abs(a - v), a))


def request_draft(*, kind: str, prompt: str, scale_values: list[int],
                  tags: tuple, story_context: str | None) -> dict:
    """Call the LLM; return the parsed JSON dict. Raises httpx errors / ValueError."""
    system = SYSTEM_PROMPT.replace("{tags}", ", ".join(tags)).replace(
        "{scale}", ", ".join(str(v) for v in scale_values))
    user = f"kind={kind}\n"
    if story_context:
        user += f"story: {story_context}\n"
    user += f"request: {prompt}"
    with httpx.Client(timeout=LLM_TIMEOUT_S) as http:
        r = http.post(
            f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
            json={"model": settings.AI_MODEL, "temperature": 0.3, "max_tokens": 900,
                  "response_format": {"type": "json_object"},
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": user}]},
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)
