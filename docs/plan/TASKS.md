# KaryaHub: Tasks

For CR-0004 (Real AI for job notes and photos, through Studio AI). Each task names the stories and criteria it serves. (Earlier tasks are in the git history of this file.)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Copy the Studio AI kit unchanged (`studio_ai.py`, `ai-status.js`); add `httpx`; keep the kit out of Ruff | US-17 | Yes |
| 2 | Prompts and job JSON schema (`prompts.py`); `StudioAiLlm` and `job_from_ai` validation | AC-17.2 to AC-17.5 | Yes |
| 3 | Choose Studio AI when configured; `studio_ai.install(app)`; `image_base64`; `reader` and `notice` on answers; meta LLM row | AC-17.1, AC-17.2, AC-17.5, AC-7.6 | Yes |
| 4 | Offline and bad-answer fallbacks to the quick reader; `503 ai_unavailable` for unreadable photos | AC-17.4, AC-17.6 | Yes |
| 5 | Web app: photo as JPEG, reader labels and tags, processing note, banner, 60-second AI calls, Settings key | AC-17.7 to AC-17.11, AC-7.6 | Yes |
| 6 | Tests: pytest with a mocked AI server; Vitest for labels, photo, offline and banner; v0.2.0 chat compatibility | US-17, AC-17.12 | Yes |
| 7 | Visual and end-to-end check, online and offline, 375px and 1280px, light and dark | Design | Yes |
| 8 | CR-0004, ADR-0011, SPEC, ARCHITECTURE, RISKS, DESIGN, PLAN, TEST-REPORT, CHANGELOG, README, studio.json | Records | Yes |
