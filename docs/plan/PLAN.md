# KaryaHub: Build plan

For CR-0004 (Real AI for job notes and photos, through Studio AI). Earlier plans (CR-0001 to CR-0003) are in the git history of this file.

## Stack
Unchanged (ADR-0002, ADR-0005): plain JavaScript UI with Vite and Vitest; Python 3.12 FastAPI server with uv, Pydantic v2, Ruff and pytest; one Vercel Python function at `api/index.py`. New: `httpx` as a server dependency (the Studio AI kit uses it), and the function's time limit goes from 30 to 60 seconds.

## Approach
1. Copy the hub's Studio AI kit unchanged: `studio_ai.py` into `backend/karyahub/` (excluded from Ruff so it stays identical) and `ai-status.js` into `src/ui/`.
2. Server: prompts and the job JSON schema in `prompts.py`; `StudioAiLlm` in `adapters/llm.py` with `job_from_ai` validation; choose it in `get_adapters` when `studio_ai.configured()`; `studio_ai.install(app)`; `image_base64` on read-image; `reader` and `notice` on pipeline answers; LLM row in meta reports Studio AI and `AI_ENDPOINTS`.
3. Fallbacks: AI offline or unusable → the quick reader (bundled answers, then the heuristic parser) with a notice; a photo with no stored text → `503 ai_unavailable`.
4. Web app: draw the sample job sheet to a JPEG and send it; label steps and cards with the reader; show the server's note; start the banner in `main.js`; show the banner on a `503 ai_unavailable`; allow 60 seconds for AI calls; Settings uses the key the server reports.
5. Tests with the AI server mocked (`httpx.MockTransport` in pytest; a fake API and a stubbed `fetch` in Vitest), plus a v0.2.0 chat compatibility test.
6. Visual and end-to-end check with the real server and a local stand-in for Ollama, online and offline.
7. Records: CR-0004, ADR-0011, SPEC (US-17, AC-7.6), ARCHITECTURE, RISKS (R-03, R-17, R-18), DESIGN, TEST-REPORT, CHANGELOG, README, studio.json.

## How the story is met
| Story | Approach | Files |
|---|---|---|
| US-17 Real AI for job notes and photos | Live adapter through the Studio AI kit, validated answers, labelled quick-reader fallback, offline banner and note, photo sent as an image | `backend/karyahub/studio_ai.py`, `prompts.py`, `adapters/llm.py`, `adapters/__init__.py`, `app.py`; `src/ui/ai-status.js`, `src/api/client.js`, `src/adapters/server.js`, `src/domain/actions.js`, `src/data/jobsheet.js`, `src/views/chat.js`, `src/views/settings.js`, `src/main.js`, `src/styles.css` |

## How existing users' data keeps working
- No change to the browser data version (still 3). Chat messages gain optional `notice` and `reader` fields; cards saved by v0.2.0 have neither and render and approve exactly as before (AC-17.12).
- API changes are additive: pipeline answers gain `reader` and `notice`; read-image accepts an optional `image_base64`. Every earlier field and route is unchanged.
- Without the AI settings the server behaves as v0.2.0 (mock reader), so nothing changes until the founder links `AI_ENDPOINTS` and `AI_GATEWAY_KEY`.

## Risks
- The AI server is one PC (RISKS R-18): covered by the labelled fallback and banner.
- Slow answers: each AI call is limited to 40 seconds inside a 60-second function, so the fallback always has time to reply.
