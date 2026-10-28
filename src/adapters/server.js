// Server adapters (CR-0002): the same interfaces as the mock and live adapters, answered by the
// KaryaHub API. Keys and the real services live on the server only. If the server can't be
// reached, the call falls back to the in-browser mock so a demo never stalls, and says so.
import { AdapterError } from './errors.js';
import { ApiUnreachable } from '../api/client.js';
import { mockSpeech } from './speech.js';
import { mockLlm } from './llm.js';
import { mockWhatsApp } from './whatsapp.js';

export const FALLBACK_NOTE = 'server unreachable, used the in-browser demo';

async function viaServer(service, call, fallback) {
  try {
    const r = await call();
    return { ...r, _via: 'server' };
  } catch (e) {
    if (e instanceof ApiUnreachable) return { ...(await fallback()), _via: 'fallback' };
    throw new AdapterError(e.message, { service, code: e.code });
  }
}

export function serverAdapters(api) {
  return {
    speech: {
      name: 'server',
      transcribe: (media, { fail = false } = {}) =>
        viaServer('Speech-to-text', () => api.transcribe(media?.id || '', fail), () => mockSpeech.transcribe(media, { fail })),
    },
    llm: {
      name: 'server',
      readImage: (media, { fail = false } = {}) =>
        viaServer('LLM', () => api.readImage(media?.id || '', fail), () => mockLlm.readImage(media, { fail })),
      extractJob: (text, { fail = false } = {}) =>
        viaServer('LLM', () => api.extract(text, fail), () => mockLlm.extractJob(text, { fail })),
    },
    whatsapp: {
      name: 'server',
      sendMessage: ({ to, kind = 'text', body }) =>
        viaServer('WhatsApp', () => api.send(to, kind, body), () => mockWhatsApp.sendMessage({ to, kind, body })),
    },
  };
}
