// Studio AI status banner: shows a calm "AI is offline" notice when the founder's AI
// server is switched off, and hides it again when it's back. Works in any UI (plain,
// HTMX, React, Vue): call watchAiStatus() once after the page loads.
//
//   import { watchAiStatus, isAiOffline } from "./ai-status.js";
//   watchAiStatus();                       // banner at the top of <body>
//   watchAiStatus({ mount: document.querySelector("#ai-note"), onChange: (online) => ... });
//
//   const r = await fetch("/api/summary", { method: "POST", body });
//   if (await isAiOffline(r)) { /* show your own inline note; the banner also appears */ }
//
// The banner uses the app's CSS custom properties when present (--surface, --text, --line).

const DEFAULT_TEXT = "AI features are offline right now because the AI server is switched off. Everything else works as usual.";
let banner = null;
let lastOnline = null;
let listeners = [];

function show(mount, text) {
  if (!banner) {
    banner = document.createElement("div");
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.className = "studio-ai-offline";
    banner.style.cssText =
      "display:flex;gap:10px;align-items:flex-start;padding:10px 16px;font-size:.93rem;line-height:1.45;font-weight:500;" +
      "background:var(--surface,#fff7e0);color:var(--text,#3a2a00);border-bottom:1px solid var(--line,#f0d48a)";
    banner.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg><span></span>';
    (mount || document.body).prepend(banner);
  }
  banner.querySelector("span").textContent = text;
  banner.hidden = false;
}

function hide() {
  if (banner) banner.hidden = true;
}

function report(online, opts) {
  if (online === lastOnline) return;
  lastOnline = online;
  if (online) hide();
  else show(opts.mount, opts.text || DEFAULT_TEXT);
  for (const fn of listeners) fn(online);
}

/** Checks /api/ai/status now and every `everyMs` (default 60 s). Returns a stop function. */
export function watchAiStatus(opts = {}) {
  const url = opts.url || "/api/ai/status";
  const everyMs = opts.everyMs || 60_000;
  if (opts.onChange) listeners.push(opts.onChange);
  let timer = null;
  async function check() {
    try {
      const r = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return; // signed out or status route missing: say nothing
      const j = await r.json();
      if (j.configured === false) return; // AI not set up for this app: nothing to announce
      report(!!j.online, opts);
    } catch {
      /* network blip: try again next time */
    }
  }
  check();
  timer = setInterval(check, everyMs);
  return () => {
    clearInterval(timer);
    if (opts.onChange) listeners = listeners.filter((f) => f !== opts.onChange);
  };
}

/** True when a response from your own API says the AI server is offline (503 ai_unavailable). Also shows the banner. */
export async function isAiOffline(response, opts = {}) {
  if (response.status !== 503) return false;
  try {
    const j = await response.clone().json();
    if (j && j.error && j.error.code === "ai_unavailable") {
      report(false, opts);
      return true;
    }
  } catch {
    /* not JSON */
  }
  return false;
}

/**
 * A "Thinking… 12 s" note with a Stop button, for while a person waits for an AI answer (kit v2).
 *
 *   const ctrl = new AbortController();
 *   const t = showThinking(document.querySelector("#answer"), { label: "Reading the job sheet…", onStop: () => ctrl.abort() });
 *   try { await fetch(url, { signal: ctrl.signal, ... }) } finally { t.done(); }
 *
 * Words streamed in can go to t.text(piece). Returns { text(piece), setLabel(label), seconds(), done() }.
 */
export function showThinking(mount, opts = {}) {
  const box = document.createElement("div");
  box.className = "studio-ai-thinking";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.innerHTML =
    '<span class="studio-ai-thinking-label"></span> <span class="studio-ai-thinking-time" aria-hidden="true"></span> ' +
    '<button type="button" class="studio-ai-thinking-stop">Stop</button><div class="studio-ai-thinking-text"></div>';
  const label = box.querySelector(".studio-ai-thinking-label");
  const time = box.querySelector(".studio-ai-thinking-time");
  const out = box.querySelector(".studio-ai-thinking-text");
  const stop = box.querySelector("button");
  const started = Date.now();
  const seconds = () => Math.floor((Date.now() - started) / 1000);
  label.textContent = opts.label || "Thinking…";
  const tick = () => { time.textContent = `${seconds()} s`; };
  tick();
  const timer = setInterval(tick, 1000);
  if (opts.onStop) stop.addEventListener("click", () => opts.onStop());
  else stop.hidden = true;
  mount.append(box);
  return {
    text(piece) { out.textContent += piece; },
    setLabel(text) { label.textContent = text; },
    seconds,
    done() { clearInterval(timer); box.remove(); },
  };
}
