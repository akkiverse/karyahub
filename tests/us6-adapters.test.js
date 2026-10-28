import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { setup, sendSample } from './helpers.js';
import { getAdapters } from '../src/adapters/index.js';
import { DEFAULT_MODE } from '../src/config.js';
import * as whatsapp from '../src/adapters/whatsapp.js';
import * as speech from '../src/adapters/speech.js';
import * as llm from '../src/adapters/llm.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-6 Adapters and demo mode', () => {
  it('AC-6.1: src/adapters has whatsapp, speech and llm modules with mock, live and server implementations of one interface, chosen by one config value defaulting to "server"', () => {
    for (const f of ['whatsapp', 'speech', 'llm']) expect(existsSync(`src/adapters/${f}.js`)).toBe(true);
    expect(typeof whatsapp.mockWhatsApp.sendMessage).toBe('function');
    expect(typeof whatsapp.liveWhatsApp.sendMessage).toBe('function');
    expect(typeof speech.mockSpeech.transcribe).toBe('function');
    expect(typeof speech.liveSpeech.transcribe).toBe('function');
    expect(typeof llm.mockLlm.extractJob).toBe('function');
    expect(typeof llm.liveLlm.extractJob).toBe('function');
    expect(existsSync('src/adapters/server.js')).toBe(true);
    expect(DEFAULT_MODE).toBe('server');
    const d = getAdapters();
    expect(d.mode).toBe('server');
    expect([typeof d.speech.transcribe, typeof d.llm.extractJob, typeof d.llm.readImage, typeof d.whatsapp.sendMessage]).toEqual(['function', 'function', 'function', 'function']);
    const m = getAdapters('mock');
    expect([m.whatsapp, m.speech, m.llm]).toEqual([whatsapp.mockWhatsApp, speech.mockSpeech, llm.mockLlm]);
    const l = getAdapters('live');
    expect([l.whatsapp, l.speech, l.llm]).toEqual([whatsapp.liveWhatsApp, speech.liveSpeech, llm.liveLlm]);
  });

  it('AC-6.2: in live mode with no key, a live adapter returns "Not configured: add <SERVICE> key" and the UI shows it without crashing', async () => {
    await expect(getAdapters('live').speech.transcribe({})).rejects.toThrow('Not configured: add Speech-to-text key');
    await expect(getAdapters('live').whatsapp.sendMessage({ to: '1', body: 'x' })).rejects.toThrow('Not configured: add WhatsApp key');
    await expect(getAdapters('live').llm.extractJob('x')).rejects.toThrow('Not configured: add LLM key');
    t = setup({ hash: '#/settings' });
    const live = t.$('input[data-action="set-mode"][value="live"]');
    live.checked = true;
    live.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.$('[data-testid="mode-banner"]').textContent).toContain('Live mode');
    await sendSample(t, 's-ramesh');
    expect(t.$('[data-testid="process-error"]').textContent).toContain('Not configured: add Speech-to-text key');
    expect(t.$('[data-testid="chat-phone"]')).not.toBeNull();
    t.go('#/renewals');
    t.click('[data-action="remind"]');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.$('[data-testid="reminder-sheet"]').textContent).toContain('Not configured: add WhatsApp key');
  });

  it('AC-6.3: in the in-browser mode, Settings shows "Demo mode: mock responses" and three services with status Mock and the key each needs', () => {
    t = setup({ hash: '#/settings' });
    const mock = t.$('input[data-action="set-mode"][value="mock"]');
    mock.checked = true;
    mock.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.$('[data-testid="mode-banner"]').textContent).toContain('Demo mode: mock responses');
    const rows = t.$$('[data-testid="services"] .service');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('[data-testid="service-status"]').textContent)).toEqual(['Mock', 'Mock', 'Mock']);
    expect(rows.map((r) => r.querySelector('code').textContent)).toEqual(['WHATSAPP_ACCESS_TOKEN', 'SPEECH_API_KEY', 'LLM_API_KEY']);
  });

  it('AC-6.4: Reset demo returns jobs, documents and reminder marks to the bundled demo data', async () => {
    t = setup();
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    await t.app.actions.createDocument(t.app.store.get().jobs[0].id, 'quote');
    await t.app.actions.sendReminder('c02');
    const s = t.app.store.get();
    expect(s.jobs).toHaveLength(1);
    expect(s.documents).toHaveLength(1);
    expect(s.customers.find((c) => c.id === 'c02').reminded_at).not.toBeNull();
    t.go('#/settings');
    t.click('[data-action="reset"]');
    const r = t.app.store.get();
    expect(r.jobs).toHaveLength(0);
    expect(r.documents).toHaveLength(0);
    expect(r.customers.every((c) => c.reminded_at === null)).toBe(true);
    expect(r.customers).toHaveLength(12);
    expect(r.messages).toHaveLength(1);
    t.go('#/jobs');
    expect(t.$('[data-testid="jobs-empty"]').textContent).toContain('No jobs yet, send a sample in Chat');
  });

  it('AC-6.4 (changed CR-0003): Reset demo keeps the team, their PINs and the access log, and keeps you signed in', () => {
    t = setup({ hash: '#/settings' });
    t.app.store.update((s) => { s.staff[1].role = 'technician'; s.access_log.unshift({ id: 'log-x', at: '2027-01-01T09:00:00', who: 'Akash Mehta', text: 'Changed something' }); });
    t.click('[data-action="reset"]');
    const s = t.app.store.get();
    expect(s.staff[1].role).toBe('technician');
    expect(s.access_log[0].id).toBe('log-x');
    expect(t.$('[data-testid="account-menu"]')).toBeTruthy();
  });
});

