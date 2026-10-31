# ADR-0014: Smooth AI: streaming for photos, a thinking line for the rest, warm-up, and the time budget

- **Status:** Accepted
- **Date:** 2026-11-01
- **Change request:** CR-0010

## Context
AI answers come from the founder's own computer (now a Mac with `gemma4:e4b`, about 1 second per read). They can still be slow: the model may need loading after a quiet spell, the address goes through Tailscale Funnel, and another or older computer may serve them. While a person waits, Chat showed only a spinner. Each step had 40 s inside a 60 s server function, so a slow first read fell back to "Read without AI". The models on the AI computer can also change, and the old kit treated a missing model as an offline server.

## Decision
- **Stream only free text.** A photo's text is streamed to Chat as lines of JSON (`{"text"}` pieces, then one `{"done": true, ...}` line with the full text, reader and notice, or an error). The job details are JSON checked by a schema, and half of it is useless to show, so extraction stays a single answer with a **thinking line**: what is happening, a seconds counter, and **Stop**.
- **The half-read text is kept on screen only** (`ui.streaming`). The chat record (synced to the server since CR-0009) gets only the finished transcript, so partial text never syncs.
- **Warm up when Chat opens:** `POST /api/v1/ai/warm` asks the AI computer to load both models (an empty Ollama chat with `keep_alive: 30m`). It is behind the Chat permission, at most once a minute per server instance and every 5 minutes per app, and it never fails loudly.
- **Time budget:** the function `maxDuration` is 120 s. Each AI step gets 90 s (`KARYAHUB_AI_STEP_SECONDS`, capped at 110), so the quick-reader fallback always has time to answer. The app waits 115 s.
- **Model fallback lives in the shared kit (v2):** on "model not found" the kit tries `AI_MODEL_FALLBACK` on the same server and remembers what worked.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Stream everything, including the JSON extraction | Words appear for every step | Partial JSON means nothing to a person; parsing and checking need the whole answer anyway |
| Server-sent events instead of JSON lines | Standard browser API (EventSource) | EventSource can't POST a photo; JSON lines over `fetch` work the same and are easy to test |
| Keep 40 s steps and rely on warm-up | Shorter worst-case wait | One slow load still loses the AI read; the person can now stop a long wait themselves |
| Background job with polling | Survives any function limit | A queue and a store for little gain at about 1 s per read |

## Consequences
- With a working AI computer, a person sees words or a moving counter within a second or two, and can stop a long wait.
- If Vercel buffers the stream, the photo text arrives in one go: still correct, only less lively.
- A request can now hold a function for up to 120 s, which is more function time on a slow day. Watch Vercel usage if AI becomes slow often.
