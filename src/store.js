import { demoState, emptyState } from './data/demo.js';
import { migrate } from './migrations.js';

// Since CR-0005 the data on this device is kept per business, so two businesses signing in on the
// same phone never see each other's jobs. Version 0.3.0 saved everything under one key; the demo
// business adopts it the first time it opens.
const LEGACY_KEY = 'karyahub.demo.v1';
const PREFS_KEY = 'karyahub.prefs.v1';
const bizKey = (id) => `karyahub.biz.v1.${id}`;

function read(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be full or blocked; KaryaHub keeps working in memory */
  }
}
const savedTheme = () => {
  try { return JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) || '{}').theme || 'system'; } catch { return 'system'; }
};

export function createStore() {
  let key = null; // set when a business signs in; nothing is saved before that
  let state = demoState();
  state.settings.theme = savedTheme();
  const listeners = new Set();
  const notify = () => listeners.forEach((l) => l(state));
  const persist = () => {
    write(PREFS_KEY, { theme: state.settings.theme });
    if (key) write(key, state);
  };
  return {
    get: () => state,
    update(fn) {
      const next = JSON.parse(JSON.stringify(state));
      fn(next);
      state = next;
      persist();
      notify();
    },
    /** Open the on-device data of the business that just signed in. */
    switchTo(business) {
      key = bizKey(business.id);
      let saved = read(key);
      if (!saved && business.is_demo) saved = read(LEGACY_KEY);
      state = saved || (business.is_demo ? demoState() : emptyState(business));
      state.settings = {
        ...state.settings, business_name: business.name, address: business.address || '', gstin: business.gstin || '',
        is_demo: Boolean(business.is_demo), theme: saved ? state.settings.theme : savedTheme(),
      };
      persist();
      notify();
    },
    /** After sign-out: forget the business so nothing is saved against it. */
    close() {
      key = null;
      const theme = state.settings.theme;
      state = demoState();
      state.settings.theme = theme;
      notify();
    },
    reset() {
      // Demo only: clear jobs, documents, chat and reminder marks; keep the theme.
      const theme = state.settings.theme;
      state = demoState();
      state.settings.theme = theme;
      persist();
      notify();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export const STORAGE_KEY = LEGACY_KEY;
export const businessStorageKey = bizKey;
