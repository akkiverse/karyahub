# CR-0008: AI over a slow link

- **Status:** Released
- **Requested by:** Founder (chat, 2026-10-30: the AI feature showed "server is down" although the AI PC was up and running)
- **Date:** 2026-10-30
- **Release:** v0.4.3 (2026-10-30)
- **Pull request:** [#8](https://github.com/akkiverse/karyahub/pull/8)

## Why
The founder's AI PC is healthy (the local gateway answers in 2 ms, the processor is at 3 to 8%, Tailscale reports a good connection), but reaching it from outside through Tailscale Funnel is slow: opening a secure connection takes 4.5 to 11 seconds and a first answer 6 to 15 seconds. The shared Studio AI kit gave a connection only 5 seconds and the "is it online?" check 3 seconds, so on most tries a working server was marked down for 30 seconds. KaryaHub then showed "AI is offline" and fell back to "Read without AI", and the banner came and went. Measured from the Singapore server: 9 of 10 status checks timed out at 3 seconds.

## What changes
- **The kit is updated to the hub's new version** (hub pull request akkiverse/idea-studio#1), copied unchanged: a connection may take up to 20 seconds to open (`AI_CONNECT_TIMEOUT`), the online check up to 12 seconds (`AI_STATUS_TIMEOUT`), and one connection is kept open and reused by later calls and by the banner's once-a-minute check, so the slow handshake is paid once per server instance instead of on every call.
- Nothing else changes: the 40-second limit on one AI step, the "Read without AI" fallback, the banner and every screen are as before.

## Spec impact
| Criterion | Change |
|---|---|
| Non-functional | Updated: the AI online check may take up to 12 seconds and opening a connection up to 20; one connection is reused |

## Architecture impact
None. The kit file stays byte-identical to the hub's copy.

## Verification
- Server: all 82 earlier tests pass with the new kit (the AI tests mock the AI server; none calls a real one). The kit's own new tests (the timeouts it sends, one client reused, a fresh client per event loop) are in the hub repository.
- Not measured here: the live effect. After release, `/api/ai/status` should say online on most checks, and the first AI read after a quiet period may still take a few seconds longer.

## Notes
- One AI step is still limited to 40 seconds, which includes opening the connection. With a handshake of up to 11 seconds and a read of about 26 seconds this is tight, so a first read after a quiet period may still fall back to "Read without AI". Planned: B2 (smooth AI on CPU) raises the function time and the step limit.
- If the connection stays slow after this, the cause is the Tailscale Funnel path into the PC; another way of publishing the AI server (for example a Cloudflare Tunnel) would need a new account and is the founder's decision.
