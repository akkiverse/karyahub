// Chooses mock or live implementations from one config value (AC-6.1).
import { DEFAULT_MODE } from '../config.js';
import { mockWhatsApp, liveWhatsApp } from './whatsapp.js';
import { mockSpeech, liveSpeech } from './speech.js';
import { mockLlm, liveLlm } from './llm.js';

export function getAdapters(mode = DEFAULT_MODE) {
  const live = mode === 'live';
  return {
    mode: live ? 'live' : 'mock',
    whatsapp: live ? liveWhatsApp : mockWhatsApp,
    speech: live ? liveSpeech : mockSpeech,
    llm: live ? liveLlm : mockLlm,
  };
}
export { AdapterError } from './errors.js';
