# CR-0010: Chat works and AI is smooth

- **Status:** In review
- **Requested by:** Founder (TASKS.md B2, 30 Oct 2026; and 31 Oct: "AI works in the hub, but KaryaHub Chat doesn't")
- **Date:** 2026-11-01
- **Release:** v0.6.0 (planned)
- **Pull request:** [#11](https://github.com/akkiverse/karyahub/pull/11)

## Why
On 31 Oct the founder found that Chat didn't work in the live app, although AI answered in the hub. We checked three things first.
- **The AI computer is fine.** The AI server now runs on the founder's Mac (`studio-ai-mac`). A check script (`Other_Checks/ai_chat_check.py`, run on the Mac on 1 Nov) sent Ollama exactly what Chat sends. `gemma4:e4b` read the typed note as JSON in 0.6 to 1.2 s and the job-sheet photo in 0.3 to 1.4 s, both correctly. `qwen3-vl:8b` took 35 to 58 s.
- **The public address is fine.** Through Tailscale Funnel and Caddy with the key, the model list answered in 0.05 s and a short chat in 0.17 s (curl, from the Mac).
- **The cause was Chat itself.** While a message is being read, the message box, Send and the samples are switched off. When the reply arrived, the screen was last drawn while that was still true, and nothing drew it again. So the first message worked and every later one could not be sent until the person left Chat and came back. A test on v0.5.0 confirms it: right after a reply both the box and Send are disabled.

Two more risks on the AI side were found on the way.
- **The models on the Mac changed.** It has no `qwen3.5:9b` (the old kit default) and no `gpt-oss:20b`. A model the server lacks answers 404, and the old kit treated that as "server offline". KaryaHub would then read every message without AI, unless `AI_MODEL` happened to name a model the Mac has.
- **Time limits.** Each AI step had 40 s inside a 60 s function. A slow first read (model loading, the old CPU PC) fell back to "Read without AI", and the person saw only a spinner with no way to stop.

## What changes
- **Send works after every reply:** Chat redraws when reading ends, so the box, Send and the samples are on again.
- **While AI reads,** the step says what it is doing ("Reading the message…", "Reading the job sheet…"), counts the seconds, and offers **Stop**. Stop keeps the technician's message, with **Try again**.
- **A photo's text appears as the AI reads it** (`POST /api/v1/pipeline/read-image/stream`, lines of JSON). The finished text is saved; the half-read text is only on screen. An older server, or the in-browser mode, still uses the one-answer route.
- **Opening Chat warms the AI** (`POST /api/v1/ai/warm`, needs the Chat permission). It loads the everyday and photo models without answering, at most once a minute on the server and every 5 minutes from the app, and it never shows an error.
- **Studio AI kit v2** (hub PR akkiverse/idea-studio#4), copied unchanged:
  - default `AI_MODEL` is `gemma4:e4b`;
  - photos use `AI_MODEL_VISION` (default: the same model);
  - a missing model falls back through `AI_MODEL_FALLBACK` on the same server instead of looking offline;
  - adds `stream_chat()` and `warm_up()`;
  - `AI_TIMEOUT` is 90 s;
  - one log line per AI call (model, server, outcome, seconds; never the key, address or text), which KaryaHub sends to the Vercel runtime logs.
- **Time limits:** each AI step 90 s (`KARYAHUB_AI_STEP_SECONDS`, never closer than 10 s to the function limit), the function `maxDuration` 120 s, and the app waits 115 s.
- **The version on `/api/health`** comes from `studio.json`, with a test that keeps the server's own copy equal. It said 0.4.3 while 0.5.0 was live.

## Spec impact
| Criterion | Change |
|---|---|
| AC-17.2 | Changed: the everyday model is `AI_MODEL` (default `gemma4:e4b`) |
| AC-24.1 to AC-24.14 | Added (US-24) |
| Non-functional | Updated: AI time limits (90 s steps in a 120 s function), model fallback, logs |

## Architecture impact
[ADR-0014](../adr/0014-smooth-ai-streaming-warm-up-and-time-budget.md): streaming only for free text (photos), a thinking line with Stop for JSON answers, warm-up when Chat opens, and the time budget.

## Verification
- Server: 122 tests pass, plus 1 Postgres-only test skipped without its database. There are 13 new US-24 tests. The AI server is mocked as "the Mac" (only `gemma4:e4b`, `qwen3-vl:8b`, `qwen3-coder:30b`), and covers a model it lacks, the vision model, slow, too slow, warm-up, streaming, fallbacks and logs.
- Web: 109 tests pass, with 10 new US-24 tests. They cover:
  - two messages in a row;
  - the thinking line, the timer and Stop;
  - Try again;
  - photo text streaming;
  - the client reading the stream;
  - telling an error, an unreachable server and Stop apart;
  - warm-up once.
- Visual check: see the test report.
- Not checked here: the live Vercel function streaming the photo text word by word. If Vercel buffers it, the text still arrives in one go, as before.

## Notes
- `/api/health` says `"mode": "mock"`. This is expected until WhatsApp and speech are connected (K6, K7). While it is so, the customer's proof-of-work code is shown on screen (`demo_code`) for real businesses too. K6 must turn that off when real sending starts. Tracked in TASKS.md.
- Leave `AI_MODEL_VISION` unset (it then uses `gemma4:e4b`). The check shows `qwen3-vl:8b` is 25 to 50 times slower on the Mac.
