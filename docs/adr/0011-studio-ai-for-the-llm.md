# ADR-0011: The LLM adapter uses Studio AI, with the quick reader as the offline fallback

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0004

## Context
ADR-0004 put every outside service behind an adapter; the LLM adapter has only had a mock and a stub that needed `KARYAHUB_LLM_API_KEY`. The founder now runs his own AI server (Ollama with `qwen3.5:9b`, behind Caddy and Tailscale Funnel) and the hub provides the Studio AI kit (`studio_ai.py`, `ai-status.js`) so apps use it without holding AI keys. The server is a single PC, so it will sometimes be off or asleep. A technician's report must never be lost because of that.

## Decision
- Copy the kit unchanged: `backend/karyahub/studio_ai.py` (excluded from Ruff to stay identical to the hub's copy) and `src/ui/ai-status.js`. Call `studio_ai.install(app)` for `/api/ai/status` and the `ai_unavailable` error shape.
- Add `StudioAiLlm` beside `MockLlm` and `LiveLlm`, with the same interface. `get_adapters` chooses it whenever `studio_ai.configured()` (the `AI_ENDPOINTS` setting is present), in mock or live mode; otherwise nothing changes.
- `extract_job` asks `qwen3.5:9b` with a JSON schema at temperature 0 and validates the answer with Pydantic plus explicit clean-up (phones, ISO dates, non-negative money, at most 20 lines). An empty customer name keeps the "I couldn't find a customer name" reply.
- `read_image` sends the photo (JPEG, PNG or WebP, up to 3 MB) and asks for its text; the text is then extracted like any message.
- If the AI server is offline (`AIUnavailable`) or its answer can't be used (`AIError`, failed validation), extraction falls back to the quick reader (bundled answers, then the heuristic parser) and labels the result `reader: "quick"` with a notice. A photo with no stored text answers `503 ai_unavailable`; the web app keeps the photo in the chat with Try again.
- Each AI call gets 40 seconds and the Vercel function 60 seconds, so a fallback always answers before the platform cuts the request.
- Prompts and the schema live in `prompts.py`; tests replace `studio_ai.TRANSPORT` with `httpx.MockTransport` and never call a real AI server.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Studio AI with the quick-reader fallback (chosen) | No AI keys in the app; no per-message cost; works offline in a reduced way; same adapter for the webhook | Quality depends on a 9B model; the server is one PC |
| A paid LLM API with its own key | Always on, stronger models | Costs money and needs an account and key, which the studio doesn't create; the kit can switch to an OpenAI-compatible service later with `AI_API=openai` |
| Fail with an error when AI is offline | Simplest | Technicians' reports stall whenever the PC is off |

## Consequences
- Going from demo to real AI is a settings change (link `AI_ENDPOINTS` and `AI_GATEWAY_KEY`), not a code change.
- Every draft still needs the owner's approval, and the reader tag tells them how much to trust it.
- Speech-to-text remains a demo adapter until a speech service is chosen (Ollama doesn't do speech).
