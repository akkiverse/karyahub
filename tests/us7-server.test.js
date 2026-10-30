import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { createApiClient, ApiUnreachable, ApiError } from '../src/api/client.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-7 KaryaHub server (web app side)', () => {
  it('AC-7.2: in server mode the Transcribe and Extract steps are answered by the KaryaHub API and say so', async () => {
    t = setup();
    expect(t.app.store.get().settings.mode).toBe('server');
    await sendSample(t, 's-ramesh');
    const names = t.api.calls.map((c) => c.name);
    expect(names).toContain('transcribe');
    expect(names).toContain('extract');
    expect(t.api.calls.find((c) => c.name === 'transcribe').args[0]).toBe('s-ramesh');
    const steps = t.$$('[data-testid="processing-panel"] .step');
    expect(steps[0].textContent).toContain('Speech adapter (KaryaHub server)');
    expect(steps[1].textContent).toContain('LLM adapter (KaryaHub server)');
    const card = t.$('[data-testid="summary-card"]');
    expect(card.textContent).toContain('Ramesh Sharma');
    await sendSample(t, 's-sunil');
    expect(t.api.calls.map((c) => c.name)).toContain('readImage');
  });

  it('AC-7.3: when the server cannot be reached, chat falls back to the in-browser demo and says so', async () => {
    t = setup({ api: fakeApi({ unreachable: true }) });
    await sendSample(t, 's-ramesh');
    const steps = t.$$('[data-testid="processing-panel"] .step');
    expect(steps.map((s) => s.dataset.status)).toEqual(['done', 'done', 'done']);
    expect(steps[0].textContent).toContain('server unreachable, used the in-browser demo');
    expect(t.$('[data-testid="summary-card"]').textContent).toContain('Ramesh Sharma');
  });

  it('AC-7.4: the web app turns API errors into plain messages and unreachable servers into a clear error type', async () => {
    const ok = createApiClient({ fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'read_failed', message: "Couldn't read this message. Try again." } }) }) });
    await expect(ok.extract('x')).rejects.toBeInstanceOf(ApiError);
    await expect(ok.extract('x')).rejects.toThrow("Couldn't read this message. Try again.");
    const down = createApiClient({ fetchImpl: async () => { throw new TypeError('network'); } });
    await expect(down.meta()).rejects.toBeInstanceOf(ApiUnreachable);
    const html = createApiClient({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html'); } }) });
    await expect(html.meta()).rejects.toBeInstanceOf(ApiUnreachable);
    t = setup();
    t.app.actions.setSetting('simulate_failure', true);
    await sendSample(t, 's-ramesh');
    expect(t.$('[data-testid="process-error"]').textContent).toContain("Couldn't read this message. Try again.");
  });

  it('AC-7.6: Settings in server mode shows the API version, business and each service status from the server with the server key it needs', async () => {
    t = setup({ hash: '#/settings' });
    await new Promise((r) => setTimeout(r, 0));
    expect(t.$('[data-testid="mode-banner"]').textContent).toContain('Server mode: KaryaHub API');
    expect(t.$('[data-testid="server-line"]').textContent).toContain('Connected to KaryaHub API v0.4.0 for CoolCare AC Services');
    const rows = t.$$('[data-testid="services"] .service');
    expect(rows.map((r) => r.querySelector('[data-testid="service-status"]').textContent)).toEqual(['Mock', 'Mock', 'Mock']);
    expect(rows.map((r) => r.querySelector('code').textContent)).toEqual(['KARYAHUB_WHATSAPP_ACCESS_TOKEN', 'KARYAHUB_SPEECH_API_KEY', 'AI_ENDPOINTS']);
    t.app.unmount();
    t = setup({ hash: '#/settings', api: fakeApi({ unreachable: true }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(t.$('[data-testid="server-line"]').textContent).toContain("Can't reach the KaryaHub server");
    expect(t.$$('[data-testid="service-status"]').map((s) => s.textContent)).toEqual(['Unreachable', 'Unreachable', 'Unreachable']);
  });
});
