"""Studio AI: one way for every Idea Studio app to use the founder's own AI server.

The founder runs Ollama on their own computer and publishes it through Tailscale Funnel
behind Caddy, which only lets in requests that carry the shared key. This module talks
to that server, switches to the next server in the list when one is off, and raises
`AIUnavailable` with a friendly message when none answer, so the app can say
"AI is offline right now" while everything else keeps working.

Copy this file unchanged into the app (tier H: `app/studio_ai.py`; tier R:
`backend/<package>/studio_ai.py`) and add `httpx` to the dependencies. All settings
come from environment variables, set once in Vercel as shared environment variables:

  AI_ENDPOINTS    Base addresses in order of preference, comma-separated, for example
                  "https://studio-ai.tail1234.ts.net,https://backup-pc.tail1234.ts.net".
  AI_GATEWAY_KEY  The shared key Caddy checks (sent as "Authorization: Bearer <key>").
  AI_MODEL        Everyday model (default "qwen3.5:9b": fast, reads images).
  AI_MODEL_LARGE  Model for harder jobs (default "gpt-oss:20b").
  AI_API          "ollama" (default) or "openai" for any OpenAI-compatible service later.
  AI_TIMEOUT      Seconds to wait for a whole answer, across all servers (default 120).
  AI_CONTEXT      Ollama context length in tokens (default 8192).
  AI_CONNECT_TIMEOUT  Seconds allowed to open a connection, including the secure handshake (default 20).
  AI_STATUS_TIMEOUT   Seconds the "is the AI server online?" check may take (default 12).

Use:
    from .studio_ai import ask, chat, AIUnavailable

    text = await ask("Summarise this job note in one line: ...")
    reply = await chat([{"role": "user", "content": "..."}], json_schema=MY_SCHEMA)
    reply.data   # the parsed JSON when json_schema was given

FastAPI apps call `studio_ai.install(app)` once: it turns `AIUnavailable` into
`503 {"error": {"code": "ai_unavailable", "message": ...}}` and adds `GET /api/ai/status`
(`{"configured": bool, "online": bool}`) for the app's "AI is offline" banner.
"""

from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx

__all__ = [
    "AIError",
    "AIUnavailable",
    "Reply",
    "ask",
    "chat",
    "configured",
    "image_b64",
    "install",
    "status",
]

DEFAULT_MODEL = "qwen3.5:9b"
DEFAULT_LARGE = "gpt-oss:20b"
# The secure handshake with a PC published through Tailscale Funnel can take 5 to 11 seconds, so waiting only 5
# cut real calls off and marked a working server "down". Both waits are settings (seconds).
DEFAULT_CONNECT_SECONDS = 20.0  # AI_CONNECT_TIMEOUT: opening a connection, including the secure handshake
DEFAULT_STATUS_SECONDS = 12.0  # AI_STATUS_TIMEOUT: how long the "is the AI server online?" check may take
DOWN_SECONDS = 30.0  # after a failure, try other servers first for this long
OFFLINE_MESSAGE = "The AI server is offline right now, so AI features are paused. Everything else still works; please try again later."
NOT_SET_UP_MESSAGE = "AI isn't set up for this app yet."

# Tests replace this with an httpx.MockTransport.
TRANSPORT: httpx.AsyncBaseTransport | None = None

_down_until: dict[str, float] = {}


class AIUnavailable(Exception):
    """No AI server answered (all off, asleep, or unreachable). Show a friendly 'AI is offline' message."""

    def __init__(self, message: str = OFFLINE_MESSAGE, code: str = "ai_unavailable", tried: list[str] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.tried = tried or []


class AIError(Exception):
    """The request itself is wrong (bad input, refused key, unreadable answer). Not fixed by trying again later."""

    def __init__(self, message: str, code: str = "ai_error"):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Reply:
    text: str
    model: str
    server: str
    seconds: float
    data: Any = None
    thinking: str = ""
    raw: dict = field(default_factory=dict, repr=False)


# ---------------- settings ----------------
def _endpoints() -> list[str]:
    raw = os.environ.get("AI_ENDPOINTS", "")
    out = []
    for part in raw.replace("\n", ",").split(","):
        u = part.strip().rstrip("/")
        if u.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            out.append(u)
    return out


def _key() -> str:
    return os.environ.get("AI_GATEWAY_KEY", "").strip()


def _api() -> str:
    return "openai" if os.environ.get("AI_API", "").strip().lower() == "openai" else "ollama"


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        return default


def configured() -> bool:
    return bool(_endpoints())


def _label(index: int) -> str:
    return "Main server" if index == 0 else f"Backup server {index}"


def _host(url: str) -> str:
    return urlparse(url).hostname or url


def _headers() -> dict[str, str]:
    h = {"Accept": "application/json"}
    if _key():
        h["Authorization"] = f"Bearer {_key()}"
    return h


def _order(endpoints: list[str]) -> list[tuple[int, str]]:
    """Servers in preference order, but ones that failed in the last 30 seconds go last."""
    now = time.monotonic()
    indexed = list(enumerate(endpoints))
    up = [(i, u) for i, u in indexed if _down_until.get(u, 0) <= now]
    down = [(i, u) for i, u in indexed if _down_until.get(u, 0) > now]
    return up + down


def _connect_seconds() -> float:
    return _float_env("AI_CONNECT_TIMEOUT", DEFAULT_CONNECT_SECONDS)


def _timeout(total: float) -> httpx.Timeout:
    return httpx.Timeout(total, connect=min(_connect_seconds(), total))


# One client per process (and event loop), so a connection that took seconds to open is kept open and reused by
# later calls and by the app's once-a-minute status check, which also keeps it warm.
_shared: tuple[object, object, httpx.AsyncClient] | None = None


def _client() -> httpx.AsyncClient:
    global _shared
    loop = asyncio.get_running_loop()
    if _shared and _shared[0] is loop and _shared[1] is TRANSPORT:
        return _shared[2]
    client = httpx.AsyncClient(
        transport=TRANSPORT,
        follow_redirects=False,
        limits=httpx.Limits(max_connections=8, max_keepalive_connections=4, keepalive_expiry=120.0),
    )
    _shared = (loop, TRANSPORT, client)  # an older client (another loop, or a test transport) is simply dropped
    return client


@asynccontextmanager
async def _session():
    yield _client()  # shared: not closed when the call ends


def image_b64(data: bytes) -> str:
    """Encode image bytes for `images=[...]` (JPEG, PNG or WebP)."""
    return base64.b64encode(data).decode()


# ---------------- requests ----------------
def _ollama_body(messages: list[dict], model: str, json_schema: dict | None, think, temperature, max_tokens) -> dict:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "keep_alive": "30m",
        "options": {"num_ctx": int(_float_env("AI_CONTEXT", 8192))},
    }
    if temperature is not None:
        body["options"]["temperature"] = temperature
    if max_tokens:
        body["options"]["num_predict"] = max_tokens
    if json_schema:
        body["format"] = json_schema
    if think is not None:
        # gpt-oss can't switch thinking off; "low" is its quickest setting.
        body["think"] = "low" if (think is False and model.startswith("gpt-oss")) else think
    return body


def _openai_messages(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        imgs = m.get("images") or []
        if not imgs:
            out.append({"role": m["role"], "content": m.get("content", "")})
            continue
        parts: list[dict] = [{"type": "text", "text": m.get("content", "")}]
        parts += [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b}"}} for b in imgs]
        out.append({"role": m["role"], "content": parts})
    return out


def _openai_body(messages: list[dict], model: str, json_schema: dict | None, temperature, max_tokens) -> dict:
    body: dict[str, Any] = {"model": model, "messages": _openai_messages(messages)}
    if temperature is not None:
        body["temperature"] = temperature
    if max_tokens:
        body["max_tokens"] = max_tokens
    if json_schema:
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "answer", "schema": json_schema}}
    return body


def _parse(api: str, payload: dict) -> tuple[str, str]:
    if api == "openai":
        msg = ((payload.get("choices") or [{}])[0]).get("message") or {}
        return str(msg.get("content") or ""), str(msg.get("reasoning_content") or "")
    msg = payload.get("message") or {}
    return str(msg.get("content") or ""), str(msg.get("thinking") or "")


async def chat(
    messages: list[dict],
    *,
    model: str | None = None,
    large: bool = False,
    json_schema: dict | None = None,
    images: list[str] | None = None,
    think: bool | str | None = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout: float | None = None,
    servers: list[str] | None = None,
) -> Reply:
    """Send a conversation to the first AI server that answers.

    messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
    images:   base64 images (see image_b64) attached to the last user message.
    json_schema: a JSON Schema; the answer is then JSON and parsed into Reply.data.
    think:    False (fast, default), True, or "low"/"medium"/"high"; None leaves the model's default.
    servers:  limit to these base addresses (used by the hub's test button).
    """
    endpoints = servers if servers is not None else _endpoints()
    if not endpoints:
        raise AIUnavailable(NOT_SET_UP_MESSAGE, code="ai_not_configured")
    api = _api()
    model = model or (os.environ.get("AI_MODEL_LARGE", DEFAULT_LARGE) if large else os.environ.get("AI_MODEL", DEFAULT_MODEL))
    msgs = [dict(m) for m in messages]
    if images:
        for m in reversed(msgs):
            if m.get("role") == "user":
                m["images"] = list(m.get("images") or []) + list(images)
                break
        else:
            msgs.append({"role": "user", "content": "", "images": list(images)})
    if api == "ollama":
        body, path = _ollama_body(msgs, model, json_schema, think, temperature, max_tokens), "/api/chat"
    else:
        body, path = _openai_body(msgs, model, json_schema, temperature, max_tokens), "/v1/chat/completions"

    budget = timeout or _float_env("AI_TIMEOUT", 120)
    deadline = time.monotonic() + budget
    tried: list[str] = []
    refused = 0
    async with _session() as client:
        for index, url in _order(endpoints):
            left = deadline - time.monotonic()
            if left <= 1:
                break
            started = time.monotonic()
            tried.append(_label(index))
            try:
                r = await client.post(url + path, json=body, headers=_headers(), timeout=_timeout(left))
            except httpx.TransportError:  # off, asleep, unreachable, or too slow
                _down_until[url] = time.monotonic() + DOWN_SECONDS
                continue
            if r.status_code in (401, 403):
                refused += 1
                _down_until[url] = time.monotonic() + DOWN_SECONDS
                continue
            if r.status_code == 400:
                raise AIError(f"The AI server couldn't use this request: {_error_text(r)}", code="ai_bad_request")
            if r.status_code >= 300:
                # 404: this server lacks the model; 5xx: Ollama or Caddy is down or out of memory.
                _down_until[url] = time.monotonic() + DOWN_SECONDS
                continue
            try:
                payload = r.json()
            except ValueError:
                _down_until[url] = time.monotonic() + DOWN_SECONDS
                continue
            _down_until.pop(url, None)
            text, thinking = _parse(api, payload)
            reply = Reply(text=text.strip(), model=str(payload.get("model") or model), server=_label(index),
                          seconds=round(time.monotonic() - started, 2), thinking=thinking, raw=payload)
            if json_schema:
                try:
                    reply.data = json.loads(reply.text)
                except ValueError as exc:
                    raise AIError("The AI answer wasn't valid JSON. Try again.", code="ai_bad_answer") from exc
            return reply
    if refused and refused == len(tried):
        raise AIError("The AI server refused this app's key. Check AI_GATEWAY_KEY matches the key in the server's Caddyfile.", code="ai_misconfigured")
    raise AIUnavailable(tried=tried)


async def ask(prompt: str, *, system: str | None = None, **kwargs) -> str:
    """One question, one text answer."""
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    return (await chat(messages, **kwargs)).text


def _error_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        e = j.get("error")
        return str(e.get("message") if isinstance(e, dict) else e)[:300]
    except ValueError:
        return r.text[:300]


# ---------------- status ----------------
async def status(*, quick: bool = False, timeout: float | None = None) -> dict:
    """Which servers answer, and the models each has. quick=True stops at the first one online.

    Returns {"configured", "online", "api", "model", "model_large", "servers": [{"name", "host", "online", "ms", "models", "error"}]}.
    """
    timeout = timeout or _float_env("AI_STATUS_TIMEOUT", DEFAULT_STATUS_SECONDS)
    endpoints = _endpoints()
    api = _api()
    out: dict[str, Any] = {
        "configured": bool(endpoints), "online": False, "api": api,
        "model": os.environ.get("AI_MODEL", DEFAULT_MODEL), "model_large": os.environ.get("AI_MODEL_LARGE", DEFAULT_LARGE),
        "servers": [],
    }
    path = "/v1/models" if api == "openai" else "/api/tags"
    async with _session() as client:
        for index, url in enumerate(endpoints):
            s: dict[str, Any] = {"name": _label(index), "host": _host(url), "online": False, "ms": None, "models": [], "error": ""}
            started = time.monotonic()
            try:
                r = await client.get(url + path, headers=_headers(), timeout=_timeout(timeout))
                s["ms"] = int((time.monotonic() - started) * 1000)
                if r.status_code in (401, 403):
                    s["error"] = "Refused the key (check AI_GATEWAY_KEY and the Caddyfile)"
                elif r.status_code >= 300:
                    s["error"] = f"Answered {r.status_code} (Ollama may be closed)"
                else:
                    j = r.json()
                    items = j.get("data") if api == "openai" else j.get("models")
                    s["models"] = sorted(str(m.get("id") or m.get("name") or "") for m in (items or []))
                    s["online"] = True
            except httpx.TransportError:
                s["error"] = "Not reachable (computer off or asleep, Tailscale or Caddy not running)"
            except ValueError:
                s["error"] = "Answered, but not like an AI server"
            if s["online"]:
                _down_until.pop(url, None)
            else:
                _down_until[url] = time.monotonic() + DOWN_SECONDS
            out["servers"].append(s)
            if s["online"]:
                out["online"] = True
                if quick:
                    break
    return out


# ---------------- FastAPI ----------------
def install(app, *, status_path: str = "/api/ai/status") -> None:
    """Friendly JSON errors for AI failures, plus a tiny status endpoint for the app's banner."""
    from fastapi.responses import JSONResponse

    @app.exception_handler(AIUnavailable)
    async def _ai_unavailable(_request, exc: AIUnavailable):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=503, headers={"Cache-Control": "no-store", "Retry-After": "60"})

    @app.exception_handler(AIError)
    async def _ai_error(_request, exc: AIError):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=502, headers={"Cache-Control": "no-store"})

    @app.get(status_path, include_in_schema=False)
    async def _ai_status():
        s = await status(quick=True)
        return JSONResponse({"configured": s["configured"], "online": s["online"]}, headers={"Cache-Control": "no-store"})
