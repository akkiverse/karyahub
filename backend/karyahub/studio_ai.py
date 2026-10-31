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
  AI_MODEL        Everyday model (default "gemma4:e4b": the fastest good model on the AI computer).
  AI_MODEL_VISION Model for photos (default: the same as AI_MODEL). Used whenever images are sent.
  AI_MODEL_LARGE  Model for harder jobs (default "gpt-oss:20b"). Never while a person waits.
  AI_MODEL_FALLBACK  Models to try, in order, when a server doesn't have the one asked for
                  (default "gemma4:e4b,qwen3.5:9b,qwen3-vl:8b"). A missing model no longer looks like "offline".
  AI_API          "ollama" (default) or "openai" for any OpenAI-compatible service later.
  AI_TIMEOUT      Seconds to wait for a whole answer, across all servers (default 90).
  AI_CONTEXT      Ollama context length in tokens (default 8192).
  AI_CONNECT_TIMEOUT  Seconds allowed to open a connection, including the secure handshake (default 20).
  AI_STATUS_TIMEOUT   Seconds the "is the AI server online?" check may take (default 12).

Use:
    from .studio_ai import ask, chat, AIUnavailable

    text = await ask("Summarise this job note in one line: ...")
    reply = await chat([{"role": "user", "content": "..."}], json_schema=MY_SCHEMA)
    reply.data   # the parsed JSON when json_schema was given

    async for piece in stream_chat([{"role": "user", "content": "..."}]):
        ...          # words as the model writes them (show them as they arrive)

    await warm_up()  # load the model now (for example when a chat page opens), so the first answer is quick

FastAPI apps call `studio_ai.install(app)` once: it turns `AIUnavailable` into
`503 {"error": {"code": "ai_unavailable", "message": ...}}` and adds `GET /api/ai/status`
(`{"configured": bool, "online": bool}`) for the app's "AI is offline" banner.
"""

from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator
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
    "stream_chat",
    "warm_up",
]

DEFAULT_MODEL = "gemma4:e4b"
DEFAULT_LARGE = "gpt-oss:20b"
DEFAULT_FALLBACK = "gemma4:e4b,qwen3.5:9b,qwen3-vl:8b"  # AI_MODEL_FALLBACK: tried in order when a server lacks the model
DEFAULT_TIMEOUT_SECONDS = 90.0  # AI_TIMEOUT: a whole answer, across all servers
WARM_EVERY_SECONDS = 60.0  # warm_up() asks a server to load a model at most once a minute
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
_model_on: dict[tuple[str, str], str] = {}  # (server, model asked for) -> the model that server really has
_warmed: dict[str, float] = {}
log = logging.getLogger("studio_ai")  # one line per call: model, server, outcome, seconds. Never the key or the prompt.


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


def _model_names() -> dict[str, str]:
    everyday = os.environ.get("AI_MODEL", "").strip() or DEFAULT_MODEL
    return {
        "model": everyday,
        "model_vision": os.environ.get("AI_MODEL_VISION", "").strip() or everyday,
        "model_large": os.environ.get("AI_MODEL_LARGE", "").strip() or DEFAULT_LARGE,
    }


def _pick_model(model: str | None, large: bool, vision: bool) -> str:
    if model:
        return model
    names = _model_names()
    return names["model_large"] if large else names["model_vision"] if vision else names["model"]


def _candidates(model: str, explicit: bool) -> list[str]:
    """The model asked for, then the fallbacks (only when the caller didn't name an exact model)."""
    out = [model]
    if not explicit:
        raw = os.environ.get("AI_MODEL_FALLBACK", DEFAULT_FALLBACK)
        out += [m.strip() for m in raw.split(",") if m.strip()]
    return list(dict.fromkeys(out))


def _models_for(url: str, wanted: list[str]) -> list[str]:
    """Put the model this server answered with last time first, so a missing model costs one 404 per process."""
    known = _model_on.get((url, wanted[0]))
    return [known] + [m for m in wanted if m != known] if known in wanted else wanted


def _missing_model(r: httpx.Response) -> bool:
    return r.status_code == 404 and "not found" in r.text.lower()


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
def _ollama_body(messages: list[dict], model: str, json_schema: dict | None, think, temperature, max_tokens, stream: bool = False) -> dict:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": stream,
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


def _openai_body(messages: list[dict], model: str, json_schema: dict | None, temperature, max_tokens, stream: bool = False) -> dict:
    body: dict[str, Any] = {"model": model, "messages": _openai_messages(messages)}
    if stream:
        body["stream"] = True
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


def _prepare(messages: list[dict], images: list[str] | None) -> list[dict]:
    msgs = [dict(m) for m in messages]
    if images:
        for m in reversed(msgs):
            if m.get("role") == "user":
                m["images"] = list(m.get("images") or []) + list(images)
                break
        else:
            msgs.append({"role": "user", "content": "", "images": list(images)})
    return msgs


def _request(api: str, msgs, model, json_schema, think, temperature, max_tokens, stream=False) -> tuple[dict, str]:
    if api == "ollama":
        return _ollama_body(msgs, model, json_schema, think, temperature, max_tokens, stream), "/api/chat"
    return _openai_body(msgs, model, json_schema, temperature, max_tokens, stream), "/v1/chat/completions"


async def chat(
    messages: list[dict],
    *,
    model: str | None = None,
    large: bool = False,
    vision: bool = False,
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
    images:   base64 images (see image_b64) attached to the last user message; they select AI_MODEL_VISION.
    json_schema: a JSON Schema; the answer is then JSON and parsed into Reply.data.
    think:    False (fast, default), True, or "low"/"medium"/"high"; None leaves the model's default.
    model:    an exact model (no fallback); otherwise AI_MODEL / AI_MODEL_VISION / AI_MODEL_LARGE, then AI_MODEL_FALLBACK.
    servers:  limit to these base addresses (used by the hub's test button).
    """
    endpoints = servers if servers is not None else _endpoints()
    if not endpoints:
        raise AIUnavailable(NOT_SET_UP_MESSAGE, code="ai_not_configured")
    api = _api()
    wanted = _candidates(_pick_model(model, large, vision or bool(images)), explicit=bool(model))
    msgs = _prepare(messages, images)

    budget = timeout or _float_env("AI_TIMEOUT", DEFAULT_TIMEOUT_SECONDS)
    deadline = time.monotonic() + budget
    tried: list[str] = []
    refused = 0
    async with _session() as client:
        for index, url in _order(endpoints):
            tried.append(_label(index))
            server_failed = True
            for name in _models_for(url, wanted):
                left = deadline - time.monotonic()
                if left <= 1:
                    break
                body, path = _request(api, msgs, name, json_schema, think, temperature, max_tokens)
                started = time.monotonic()
                try:
                    r = await client.post(url + path, json=body, headers=_headers(), timeout=_timeout(left))
                except httpx.TimeoutException:
                    log.warning("AI %s on %s: no answer within %.0f s", name, _label(index), time.monotonic() - started)
                    break
                except httpx.TransportError as exc:  # off, asleep, unreachable
                    log.warning("AI %s on %s: not reachable (%s)", name, _label(index), type(exc).__name__)
                    break
                if r.status_code in (401, 403):
                    refused += 1
                    log.warning("AI on %s: key refused", _label(index))
                    break
                if _missing_model(r):
                    log.warning("AI on %s: model %s isn't there, trying the next one", _label(index), name)
                    continue
                if r.status_code == 400:
                    log.warning("AI %s on %s: request refused: %s", name, _label(index), _error_text(r)[:200])
                    raise AIError(f"The AI server couldn't use this request: {_error_text(r)}", code="ai_bad_request")
                if r.status_code >= 300:
                    # 5xx: Ollama or Caddy is down or out of memory; 404 without "not found": wrong path.
                    log.warning("AI %s on %s: answered %s", name, _label(index), r.status_code)
                    break
                try:
                    payload = r.json()
                except ValueError:
                    log.warning("AI %s on %s: answer wasn't JSON", name, _label(index))
                    break
                server_failed = False
                _down_until.pop(url, None)
                _model_on[(url, wanted[0])] = name
                text, thinking = _parse(api, payload)
                reply = Reply(text=text.strip(), model=str(payload.get("model") or name), server=_label(index),
                              seconds=round(time.monotonic() - started, 2), thinking=thinking, raw=payload)
                log.info("AI %s on %s: answered in %.1f s", reply.model, reply.server, reply.seconds)
                if json_schema:
                    try:
                        reply.data = json.loads(reply.text)
                    except ValueError as exc:
                        raise AIError("The AI answer wasn't valid JSON. Try again.", code="ai_bad_answer") from exc
                return reply
            if server_failed:
                _down_until[url] = time.monotonic() + DOWN_SECONDS
    if refused and refused == len(tried):
        raise AIError("The AI server refused this app's key. Check AI_GATEWAY_KEY matches the key in the server's Caddyfile.", code="ai_misconfigured")
    raise AIUnavailable(tried=tried)


def _stream_piece(api: str, line: str) -> tuple[str, bool]:
    """(text, done) from one line of a streamed answer. Thinking is skipped: only the answer is shown."""
    line = line.strip()
    if not line:
        return "", False
    if api == "openai":
        if not line.startswith("data:"):
            return "", False
        data = line[5:].strip()
        if data == "[DONE]":
            return "", True
        try:
            j = json.loads(data)
        except ValueError:
            return "", False
        delta = ((j.get("choices") or [{}])[0]).get("delta") or {}
        return str(delta.get("content") or ""), False
    try:
        j = json.loads(line)
    except ValueError:
        return "", False
    if j.get("error"):
        raise AIError(f"The AI server stopped: {str(j['error'])[:200]}", code="ai_stream_error")
    return str((j.get("message") or {}).get("content") or ""), bool(j.get("done"))


async def stream_chat(
    messages: list[dict],
    *,
    model: str | None = None,
    large: bool = False,
    vision: bool = False,
    images: list[str] | None = None,
    think: bool | str | None = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout: float | None = None,
    servers: list[str] | None = None,
) -> AsyncIterator[str]:
    """Like chat(), but yields the answer's text as the model writes it, so a page can show words appearing.

    Fail-over (other servers, fallback models) happens only before the first word. If the server stops
    half-way, AIUnavailable is raised; the words already sent stay with the caller.
    """
    endpoints = servers if servers is not None else _endpoints()
    if not endpoints:
        raise AIUnavailable(NOT_SET_UP_MESSAGE, code="ai_not_configured")
    api = _api()
    wanted = _candidates(_pick_model(model, large, vision or bool(images)), explicit=bool(model))
    msgs = _prepare(messages, images)
    budget = timeout or _float_env("AI_TIMEOUT", DEFAULT_TIMEOUT_SECONDS)
    deadline = time.monotonic() + budget
    tried: list[str] = []
    refused = 0
    client = _client()
    for index, url in _order(endpoints):
        tried.append(_label(index))
        server_failed = True
        for name in _models_for(url, wanted):
            left = deadline - time.monotonic()
            if left <= 1:
                break
            body, path = _request(api, msgs, name, None, think, temperature, max_tokens, stream=True)
            started = time.monotonic()
            req = client.build_request("POST", url + path, json=body, headers=_headers(), timeout=_timeout(left))
            try:
                r = await client.send(req, stream=True)
            except httpx.TransportError as exc:
                log.warning("AI stream %s on %s: not reachable (%s)", name, _label(index), type(exc).__name__)
                break
            try:
                if r.status_code in (401, 403):
                    refused += 1
                    break
                if r.status_code == 404:
                    await r.aread()
                    if _missing_model(r):
                        log.warning("AI on %s: model %s isn't there, trying the next one", _label(index), name)
                        continue
                    break
                if r.status_code == 400:
                    await r.aread()
                    raise AIError(f"The AI server couldn't use this request: {_error_text(r)}", code="ai_bad_request")
                if r.status_code >= 300:
                    break
                server_failed = False
                _down_until.pop(url, None)
                _model_on[(url, wanted[0])] = name
                first = None
                try:
                    async for line in r.aiter_lines():
                        piece, done = _stream_piece(api, line)
                        if piece:
                            if first is None:
                                first = time.monotonic() - started
                            yield piece
                        if done:
                            break
                except httpx.TransportError as exc:
                    log.warning("AI stream %s on %s: stopped half-way (%s)", name, _label(index), type(exc).__name__)
                    raise AIUnavailable(tried=tried) from exc
                log.info("AI stream %s on %s: first word %.1f s, done in %.1f s", name, _label(index),
                         first if first is not None else -1, time.monotonic() - started)
                return
            finally:
                await r.aclose()
        if server_failed:
            _down_until[url] = time.monotonic() + DOWN_SECONDS
    if refused and refused == len(tried):
        raise AIError("The AI server refused this app's key. Check AI_GATEWAY_KEY matches the key in the server's Caddyfile.", code="ai_misconfigured")
    raise AIUnavailable(tried=tried)


async def warm_up(*, vision: bool = False, large: bool = False, model: str | None = None, timeout: float | None = None) -> dict:
    """Ask the first server that answers to load a model now, without answering anything.

    Call it when a page that uses AI opens (for example Chat), so the first real question doesn't wait for the
    model to load. Never raises: returns {"ok", "model", "server", "seconds", "skipped"}. At most once a minute
    per model; Ollama keeps it loaded for 30 minutes after that (keep_alive).
    """
    out: dict[str, Any] = {"ok": False, "model": "", "server": "", "seconds": 0.0, "skipped": False}
    endpoints = _endpoints()
    if not endpoints or _api() != "ollama":
        return out  # nothing to warm (not set up, or a hosted service that is always warm)
    wanted = _candidates(_pick_model(model, large, vision), explicit=bool(model))
    now = time.monotonic()
    if now - _warmed.get(wanted[0], -1e9) < WARM_EVERY_SECONDS:
        out.update(ok=True, skipped=True, model=wanted[0])
        return out
    _warmed[wanted[0]] = now
    deadline = now + (timeout or _float_env("AI_TIMEOUT", DEFAULT_TIMEOUT_SECONDS))
    client = _client()
    for index, url in _order(endpoints):
        for name in _models_for(url, wanted):
            left = deadline - time.monotonic()
            if left <= 1:
                return out
            started = time.monotonic()
            try:
                # Ollama loads the model and answers at once when the conversation is empty.
                r = await client.post(url + "/api/chat", json={"model": name, "messages": [], "keep_alive": "30m"},
                                      headers=_headers(), timeout=_timeout(left))
            except httpx.TransportError:
                _down_until[url] = time.monotonic() + DOWN_SECONDS
                break
            if _missing_model(r):
                continue
            if r.status_code >= 300:
                break
            _down_until.pop(url, None)
            _model_on[(url, wanted[0])] = name
            out.update(ok=True, model=name, server=_label(index), seconds=round(time.monotonic() - started, 2))
            log.info("AI warm-up %s on %s: %.1f s", name, out["server"], out["seconds"])
            return out
    _warmed.pop(wanted[0], None)  # failed: let the next page open try again
    return out


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

    Returns {"configured", "online", "api", "model", "model_vision", "model_large", "servers": [{"name", "host", "online", "ms", "models", "error"}]}.
    """
    timeout = timeout or _float_env("AI_STATUS_TIMEOUT", DEFAULT_STATUS_SECONDS)
    endpoints = _endpoints()
    api = _api()
    out: dict[str, Any] = {
        "configured": bool(endpoints), "online": False, "api": api,
        **_model_names(),
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
