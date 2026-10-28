// WhatsApp adapter. Interface: sendMessage({ to, kind, body, attachment }) -> Promise<{ id, status }>
import { AdapterError, notConfigured } from './errors.js';
import { configuredKeys } from '../config.js';

let counter = 0;
export const mockWhatsApp = {
  name: 'mock',
  async sendMessage({ to, kind = 'text', body }) {
    if (!to || !body) throw new AdapterError('A message needs a recipient and some text.', { service: 'WhatsApp', code: 'invalid' });
    counter += 1;
    // Nothing leaves the browser: the demo only records that a message would have been sent.
    return { id: `wamid.demo.${counter}`, status: 'simulated', to, kind };
  },
};

export const liveWhatsApp = {
  name: 'live',
  async sendMessage() {
    // The real version calls the WhatsApp Business Cloud API from a server function.
    if (!configuredKeys.WHATSAPP_ACCESS_TOKEN) throw notConfigured('WhatsApp');
    throw new AdapterError('The live WhatsApp adapter is not part of the demo build.', { service: 'WhatsApp', code: 'not_built' });
  },
};
