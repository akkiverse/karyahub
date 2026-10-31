// Thin client for the KaryaHub API (FastAPI, Python) under /api/v1 (CR-0002).
// Business rules and, since CR-0005, people and sign-in live on the server; the browser draws the screens.
import { isAiOffline } from '../ui/ai-status.js';

// Reading with Studio AI (CR-0004) can take a while on the founder's own AI server. The server gives each AI
// step 90 s inside a 120 s function (CR-0010), so the app waits a little longer than that, with a timer and Stop.
export const AI_TIMEOUT_MS = 115000;
export const STOPPED_MESSAGE = 'Stopped. Your message is kept: press Try again to read it again.';
export const SYNC_TIMEOUT_MS = 30000; // a batch of queued changes over a weak signal
export const BOOT_TIMEOUT_MS = 30000; // opening the app and signing in: a sleeping server and database may need a while

export class ApiError extends Error {
  constructor(message, { code = 'api_error', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
/** The server could not be reached (offline, local dev without the API, or a timeout). */
export class ApiUnreachable extends Error {
  constructor(message = "Couldn't reach the KaryaHub server.") {
    super(message);
    this.name = 'ApiUnreachable';
  }
}

export function createApiClient({ base = '/api/v1', fetchImpl = (...a) => globalThis.fetch(...a), timeoutMs = 20000, onSessionEnded = () => {} } = {}) {
  // Opens the request, with a time limit and an optional Stop (an AbortSignal the person controls, CR-0010).
  async function open(method, path, body, { timeout = timeoutMs, signal = null } = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    const onStop = () => ctrl && ctrl.abort();
    if (signal) {
      if (signal.aborted) onStop();
      else signal.addEventListener('abort', onStop, { once: true });
    }
    const stopped = () => Boolean(signal && signal.aborted);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { 'X-Requested-With': 'karyahub', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        signal: ctrl?.signal,
      });
      return { res, stopped, cleanup: () => { if (timer) clearTimeout(timer); if (signal) signal.removeEventListener('abort', onStop); } };
    } catch {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onStop);
      if (stopped()) throw new ApiError(STOPPED_MESSAGE, { code: 'stopped' });
      throw new ApiUnreachable();
    }
  }

  async function call(method, path, body, { timeout = timeoutMs, quiet = false, signal = null } = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    const onStop = () => ctrl && ctrl.abort();
    if (signal) {
      if (signal.aborted) onStop();
      else signal.addEventListener('abort', onStop, { once: true });
    }
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        // The session cookie is HttpOnly and same-site; this header is the app's own mark so other sites can't act for a signed-in person.
        headers: { 'X-Requested-With': 'karyahub', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        signal: ctrl?.signal,
      });
    } catch {
      if (signal && signal.aborted) throw new ApiError(STOPPED_MESSAGE, { code: 'stopped' });
      throw new ApiUnreachable();
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onStop);
    }
    if (res.status === 503) await isAiOffline(res); // shows the "AI is offline" banner (CR-0004)
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Not JSON: the API isn't behind this address (for example a static-only preview).
      throw new ApiUnreachable();
    }
    if (!res.ok) {
      const err = (data && data.error) || {};
      if (res.status === 401 && err.code === 'signin_required' && !quiet) onSessionEnded();
      throw new ApiError(err.message || 'Something went wrong on the server. Try again.', { code: err.code, status: res.status });
    }
    return data;
  }
  const put = (path, body) => call('PUT', path, body);

  // The photo's text as the AI writes it (CR-0010): lines of JSON, {"text"} pieces then one {"done": true, ...}.
  // onText(piece) is called for each piece; the promise ends with the final answer, like readImage.
  async function readImageStream(mediaId, imageBase64, { onText = () => {}, signal = null, simulateFailure = false } = {}) {
    const body = { media_id: mediaId, simulate_failure: simulateFailure, ...(imageBase64 ? { image_base64: imageBase64 } : {}) };
    const { res, stopped, cleanup } = await open('POST', '/pipeline/read-image/stream', body, { timeout: AI_TIMEOUT_MS, signal });
    try {
      if (!res.ok) {
        if (res.status === 503) await isAiOffline(res);
        let data = null;
        try { data = await res.json(); } catch { throw new ApiUnreachable(); }
        const err = (data && data.error) || {};
        throw new ApiError(err.message || 'Something went wrong on the server. Try again.', { code: err.code, status: res.status });
      }
      let final = null;
      const handle = (line) => {
        if (!line.trim()) return;
        let j;
        try { j = JSON.parse(line); } catch { return; }
        if (j.done) final = j;
        else if (j.text) onText(j.text);
      };
      try {
        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
          }
          handle(buf);
        } else {
          (await res.text()).split('\n').forEach(handle);
        }
      } catch {
        if (stopped()) throw new ApiError(STOPPED_MESSAGE, { code: 'stopped' });
        throw new ApiUnreachable();
      }
      if (!final) throw new ApiUnreachable();
      if (final.error) {
        if (final.error.code === 'ai_unavailable') await isAiOffline({ status: 503, clone: () => ({ json: async () => ({ error: final.error }) }) }); // the banner
        throw new ApiError(final.error.message || 'Something went wrong on the server. Try again.', { code: final.error.code, status: 422 });
      }
      return { text: final.text, reader: final.reader || '', notice: final.notice || '', adapter: 'server' };
    } finally {
      cleanup();
    }
  }

  return {
    meta: () => call('GET', '/meta'),
    transcribe: (mediaId, simulateFailure = false) => call('POST', '/pipeline/transcribe', { media_id: mediaId, simulate_failure: simulateFailure }),
    readImage: (mediaId, simulateFailure = false, imageBase64 = null, { signal = null } = {}) =>
      call('POST', '/pipeline/read-image', { media_id: mediaId, simulate_failure: simulateFailure, ...(imageBase64 ? { image_base64: imageBase64 } : {}) }, { timeout: AI_TIMEOUT_MS, signal }),
    readImageStream,
    extract: (text, simulateFailure = false, { signal = null } = {}) => call('POST', '/pipeline/extract', { text, simulate_failure: simulateFailure }, { timeout: AI_TIMEOUT_MS, signal }),
    // Load the AI models while the person is still typing (CR-0010). Never shows an error.
    warmAi: () => call('POST', '/ai/warm', undefined, { quiet: true, timeout: AI_TIMEOUT_MS }),
    send: (to, kind, body) => call('POST', '/messages/send', { to, kind: kind === 'document' ? 'document' : 'text', body }),
    transition: (jobId, request) => call('POST', `/jobs/${encodeURIComponent(jobId)}/transitions`, request),
    amcPlan: (contract, today, existingKeys = []) => call('POST', '/amc/plan', { contract, today, existing_keys: existingKeys }),

    // Sign-in and accounts (CR-0005)
    // The first requests may wake a sleeping function and database, so they get longer than the usual 8 seconds.
    authState: () => call('GET', '/auth/state', undefined, { timeout: BOOT_TIMEOUT_MS }),
    me: () => call('GET', '/auth/me', undefined, { quiet: true, timeout: BOOT_TIMEOUT_MS }),
    signIn: (phone, pin) => call('POST', '/auth/sign-in', { phone, pin }, { quiet: true, timeout: BOOT_TIMEOUT_MS }),
    signOut: () => call('POST', '/auth/sign-out', undefined, { quiet: true }),
    bootstrap: (form) => call('POST', '/auth/bootstrap', form),
    changePin: (currentPin, newPin) => call('POST', '/auth/change-pin', { current_pin: currentPin, new_pin: newPin }),
    forgotPin: (phone) => call('POST', '/auth/forgot', { phone }),
    resetPin: (phone, code, newPin) => call('POST', '/auth/reset-pin', { phone, code, new_pin: newPin }),

    // Team and access for a business
    team: () => call('GET', '/team'),
    addMember: (form) => call('POST', '/team', form),
    importMembers: (csv) => call('POST', '/team/import', { csv }),
    updateMember: (id, change) => call('PATCH', `/team/${encodeURIComponent(id)}`, change),
    resetMemberPin: (id, pin) => call('POST', `/team/${encodeURIComponent(id)}/reset-pin`, pin ? { pin } : {}),
    memberPermissions: (id, overrides) => put(`/team/${encodeURIComponent(id)}/permissions`, { overrides }),
    rolePermissions: (role, permissions) => put(`/team/roles/${encodeURIComponent(role)}/permissions`, { permissions }),
    audit: () => call('GET', '/team/audit'),
    saveBusinessProfile: (fields) => put('/business/profile', fields),
    saveLogo: (dataUrl) => put('/business/logo', { data_url: dataUrl }),
    removeLogo: () => call('DELETE', '/business/logo'),

    // Business data (CR-0009): one call sends the queued changes and brings back what changed on the server.
    sync: (since, ops) => call('POST', '/sync', { since, ops }, { timeout: SYNC_TIMEOUT_MS }),
    importDevice: (payload) => call('POST', '/import', payload, { timeout: SYNC_TIMEOUT_MS }),

    // Businesses (platform admin)
    businesses: () => call('GET', '/platform/businesses'),
    createBusiness: (form) => call('POST', '/platform/businesses', form),
    setBusinessActive: (id, active) => call('PATCH', `/platform/businesses/${encodeURIComponent(id)}`, { active }),
    resetOwnerPin: (id, pin) => call('POST', `/platform/owners/${encodeURIComponent(id)}/reset-pin`, pin ? { pin } : {}),
  };
}

export const api = createApiClient();
