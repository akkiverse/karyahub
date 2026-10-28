// Chooses the adapter implementation from one config value (AC-6.1, changed CR-0002):
// "server" (default) asks the KaryaHub API, which holds the real services and keys;
// "mock" answers in the browser with bundled demo data; "live" is the old browser stub kept to
// show what happens without keys.
import { DEFAULT_MODE } from '../config.js';
import { mockWhatsApp, liveWhatsApp } from './whatsapp.js';
import { mockSpeech, liveSpeech } from './speech.js';
import { mockLlm, liveLlm } from './llm.js';
import { serverAdapters } from './server.js';
import { api as defaultApi } from '../api/client.js';

export const MODES = ['server', 'mock', 'live'];

export function getAdapters(mode = DEFAULT_MODE, api = defaultApi) {
  if (mode === 'server') return { mode: 'server', ...serverAdapters(api) };
  const live = mode === 'live';
  return {
    mode: live ? 'live' : 'mock',
    whatsapp: live ? liveWhatsApp : mockWhatsApp,
    speech: live ? liveSpeech : mockSpeech,
    llm: live ? liveLlm : mockLlm,
  };
}
export { AdapterError } from './errors.js';
