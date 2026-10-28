import { demoState } from './data/demo.js';

const KEY = 'karyahub.demo.v1';

function safeRead() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}
function safeWrite(state) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be full or blocked; the demo keeps working in memory */
  }
}

export function createStore() {
  let state = safeRead() || demoState();
  const listeners = new Set();
  return {
    get: () => state,
    update(fn) {
      const next = JSON.parse(JSON.stringify(state));
      fn(next);
      state = next;
      safeWrite(state);
      listeners.forEach((l) => l(state));
    },
    reset() {
      const keep = state.settings.theme;
      state = demoState();
      state.settings.theme = keep;
      safeWrite(state);
      listeners.forEach((l) => l(state));
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export const STORAGE_KEY = KEY;
