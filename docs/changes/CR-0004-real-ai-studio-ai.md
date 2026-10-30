# CR-0004: Real AI for job notes and photos (Studio AI)

- **Status:** Released
- **Requested by:** Founder (board note, sent as an improvement on 2026-10-28)
- **Date:** 2026-10-28
- **Release:** v0.3.0 (2026-10-30)
- **Pull request:** [#3](https://github.com/akkiverse/karyahub/pull/3)

## Why
Until now KaryaHub only pretended to read technicians' messages: bundled answers for the samples and a small rule-based reader for anything typed. The founder now runs his own AI server (Ollama on his PC with `qwen3.5:9b`, published through Caddy and Tailscale Funnel) and the hub ships the **Studio AI kit** so every Idea Studio app can use it without its own AI keys. The founder asked to replace the pretend AI with that server, keep the demo working until the AI settings are linked, and stay calm and useful when the AI server is switched off.

Founder's note (summarised): copy `studio_ai.py` unchanged into `backend/karyahub/`, add `httpx`, call `studio_ai.install(app)`; a live LLM adapter where `extract_job(text)` uses `qwen3.5:9b` with a JSON schema matching the job draft (temperature 0, validated with Pydantic, keeping the "I couldn't find a customer name" behaviour) and `read_image(photo)` reads the job-sheet photo with `qwen3.5:9b` and then extracts the job the same way; use it when the AI settings are present (`studio_ai.configured()`), otherwise keep the mock; when the AI server is offline show a calm "AI is offline right now" banner and a note on the chat processing panel, fall back to the quick reader labelled "Read without AI", and never lose the technician's message; speech-to-text stays on the mock (Ollama doesn't do speech); tests mock the AI server (answer, offline, not set up) and all existing tests still pass; minor version (v0.3.0); remind the founder to link the shared AI variables to the karyahub project.

## What changes
For people using the app:
- **Messages are read by real AI** once the founder links `AI_ENDPOINTS` and `AI_GATEWAY_KEY` to the karyahub Vercel project. Typed messages and voice-note transcripts go to `qwen3.5:9b`, which fills in the customer, phone, area, equipment, work, parts, AMC end date and value, and the charges.
- **Job-sheet photos are read by AI.** The Chat's sample job sheet is now sent to the server as a real image (a JPEG drawn from the sheet), the AI copies its text, and the job is extracted the same way as a typed message.
- **Who read it is always shown.** Processing steps say "Read by Studio AI (KaryaHub server)" or "Read without AI (KaryaHub server)", and the job card carries a "Read by AI" or "Read without AI" tag.
- **When the AI server is off,** a calm banner at the top says "AI features are offline right now because the AI server is switched off. Everything else works as usual.", the processing panel adds "AI is offline right now, so this was read without AI. Check the details before approving.", and the quick reader fills in the draft so the owner can still check and approve it. If a photo can't be read at all while AI is off, the technician's photo stays in the chat with a Try again button.
- **Settings** shows the LLM as "Studio AI" with the `AI_ENDPOINTS` variable once AI is set up; until then it stays "Mock".
- Nothing changes for WhatsApp, speech-to-text (still the demo adapter; Ollama doesn't turn speech into text), paperwork, renewals, proof of work, sign-in or Admin.

Underneath:
- `backend/karyahub/studio_ai.py`: the hub's Studio AI kit, copied unchanged (excluded from Ruff so it stays byte-identical to the hub's copy).
- `backend/karyahub/prompts.py`: the extraction and photo-reading prompts and the job JSON schema, in one place.
- `backend/karyahub/adapters/llm.py`: new `StudioAiLlm` (live adapter) and `job_from_ai`, which validates the AI's answer: names lose Mr/Ji, phones must be 10-digit Indian mobiles, dates must be real `YYYY-MM-DD` dates, money can't be negative, at most 20 charge lines. An unusable answer falls back to the quick reader with its own note.
- `get_adapters` picks `StudioAiLlm` whenever `studio_ai.configured()` is true (in mock or live mode); otherwise the existing mock (or the live-mode stub).
- API: `GET /api/ai/status` (`{configured, online}`, from the kit); `POST /api/v1/pipeline/read-image` accepts an optional `image_base64` (JPEG, PNG or WebP, up to 3 MB); pipeline answers gain `reader` (`ai`, `quick` or `demo`) and `notice`. All earlier fields are unchanged. AI failures answer `503 {"error": {"code": "ai_unavailable"}}` through the kit.
- `httpx` moves into the server's dependencies. The Vercel function may now run for up to 60 seconds (was 30), and each AI call is limited to 40 seconds so the fallback always has time to answer.
- Web app: `src/ui/ai-status.js` (the kit's banner, unchanged) started from `src/main.js`; the API client waits up to 60 seconds for AI calls and shows the banner on a `503 ai_unavailable`; `jobsheetImage()` draws the sample sheet to a JPEG; the processing panel and job card show the reader.
- Saved chats from v0.2.0 (cards without a reader) load and approve as before; no data version change.

## References
None attached to this change. The founder's note points at the hub's Studio AI kit (`templates/product/studio-ai/README.md`) and `STACK.md` "AI (Studio AI)", both read from the hub repository at commit `434c73c`.

## Spec impact
| Criterion | Change |
|---|---|
| AC-7.6 | Changed: in server mode the LLM row shows the key the server reports (`AI_ENDPOINTS` for Studio AI) instead of `KARYAHUB_LLM_API_KEY` |
| AC-17.1 to AC-17.12 | Added (US-17 Real AI for job notes and photos) |

Also updated in SPEC: out of scope (real LLM calls are now in scope through Studio AI; real speech-to-text and OCR services stay out), non-functional requirements (AI settings and timeouts), and the integrations wording.

## Architecture impact
New [ADR-0011](../adr/0011-studio-ai-for-the-llm.md): the LLM adapter uses Studio AI (the founder's own Ollama server through the hub's kit), with the quick reader as the offline fallback. [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) updates the integrations table and adds the AI flow; [RISKS.md](../architecture/RISKS.md) updates R-03 and R-17 and adds R-18 (the AI server runs on one PC). [DESIGN.md](../design/DESIGN.md) gains the CR-0004 section (reader tags, offline note and banner).

## Verification
- Server: 26 pytest tests, including 6 new ones for US-17 with the AI server mocked through `httpx.MockTransport` (not set up, answer with the schema, no customer name, bad answers, photo reading, offline). All 20 earlier tests still pass (one AC-7.2 assertion now checks the earlier fields and the new `reader`, since answers gained two fields).
- Web app: 61 Vitest tests, including 6 new ones for US-17 (AI and "Read without AI" labels, the photo sent as an image, offline photo with Try again and the banner, the banner following `/api/ai/status`, v0.2.0 chats). All 55 earlier tests still pass (AC-7.6 now expects `AI_ENDPOINTS`).
- Ruff lint and format clean; `npm run build` passes.
- End-to-end check: the production build with the real server and a local stand-in for the Ollama server; the job-sheet photo reached the AI as an 80 kB JPEG and came back as a draft for Sunil Patil, and with the AI server off the same flow finished "Read without AI" with the banner and note. Screens checked at 375px and 1280px in light and dark.
- Result: 87 of 87 passing. See [TEST-REPORT.md](../quality/TEST-REPORT.md).

## Notes
- **Founder action after release:** in Vercel, link the shared environment variables `AI_ENDPOINTS` and `AI_GATEWAY_KEY` to the **karyahub** project (Project > Settings > Environment Variables > Link shared variables), then redeploy. Until then KaryaHub keeps using the demo reader, and Settings shows the LLM as "Mock".
- Speech-to-text stays on the demo adapter: Ollama doesn't turn speech into text. Voice notes still use their sample transcripts, which are then read by the AI.
- The WhatsApp webhook uses the same adapter, so real incoming text messages are read by Studio AI too; incoming photos still need the WhatsApp media download, which comes with the live WhatsApp adapter.
