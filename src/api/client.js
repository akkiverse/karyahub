// Thin client for the KaryaHub API (FastAPI, Python) under /api/v1 (CR-0002).
// Business rules live on the server; the browser keeps the demo data and draws the screens.
import { isAiOffline } from '../ui/ai-status.js';

// Reading with Studio AI (CR-0004) can take a while on the founder's own AI server.
export const AI_TIMEOUT_MS = 60000;

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

export function createApiClient({ base = '/api/v1', fetchImpl = (...a) => globalThis.fetch(...a), timeoutMs = 8000 } = {}) {
  async function call(method, path, body, { timeout = timeoutMs } = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl?.signal,
      });
    } catch {
      throw new ApiUnreachable();
    } finally {
      if (timer) clearTimeout(timer);
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
      throw new ApiError(err.message || 'Something went wrong on the server. Try again.', { code: err.code, status: res.status });
    }
    return data;
  }
  return {
    meta: () => call('GET', '/meta'),
    transcribe: (mediaId, simulateFailure = false) => call('POST', '/pipeline/transcribe', { media_id: mediaId, simulate_failure: simulateFailure }),
    readImage: (mediaId, simulateFailure = false, imageBase64 = null) =>
      call('POST', '/pipeline/read-image', { media_id: mediaId, simulate_failure: simulateFailure, ...(imageBase64 ? { image_base64: imageBase64 } : {}) }, { timeout: AI_TIMEOUT_MS }),
    extract: (text, simulateFailure = false) => call('POST', '/pipeline/extract', { text, simulate_failure: simulateFailure }, { timeout: AI_TIMEOUT_MS }),
    send: (to, kind, body) => call('POST', '/messages/send', { to, kind: kind === 'document' ? 'document' : 'text', body }),
    transition: (jobId, request) => call('POST', `/jobs/${encodeURIComponent(jobId)}/transitions`, request),
    amcPlan: (contract, today, existingKeys = []) => call('POST', '/amc/plan', { contract, today, existing_keys: existingKeys }),
  };
}

export const api = createApiClient();
