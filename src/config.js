// One config value chooses the adapter implementation (AC-6.1, changed CR-0002).
// "server" (default) asks the KaryaHub API (Python), which holds the services and their keys.
// "mock" answers every outside service in the browser with bundled demo responses.
// "live" is the old browser stub: it shows the error you get without keys.
export const DEFAULT_MODE = 'server';

// Milliseconds each processing step takes in the demo. Three steps finish well inside 3 seconds (AC-2.2).
export const STEP_DELAY_MS = 650;

// Keys the live adapters would need. Never put real keys in the browser: the live
// version reads them in a server function. In this demo none are configured.
export const SERVICES = [
  { id: 'whatsapp', name: 'WhatsApp', label: 'WhatsApp Business Cloud API', key: 'WHATSAPP_ACCESS_TOKEN', purpose: 'Receives technician messages and sends quotes and reminders' },
  { id: 'speech', name: 'Speech-to-text', label: 'Speech-to-text (Sarvam AI or OpenAI)', key: 'SPEECH_API_KEY', purpose: 'Turns voice notes into text' },
  { id: 'llm', name: 'LLM', label: 'LLM (Claude or Sarvam)', key: 'LLM_API_KEY', purpose: 'Reads job sheets and extracts job details' },
];

export const configuredKeys = {}; // empty on purpose: the demo has no keys

// Keys the KaryaHub server reads from its environment variables (CR-0002). Shown in Settings.
export const SERVER_KEYS = { whatsapp: 'KARYAHUB_WHATSAPP_ACCESS_TOKEN', speech: 'KARYAHUB_SPEECH_API_KEY', llm: 'KARYAHUB_LLM_API_KEY' };
