import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, until, sendSample } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { createApiClient, ApiError, ApiUnreachable, AI_TIMEOUT_MS, STOPPED_MESSAGE } from '../src/api/client.js';
import { SAMPLES } from '../src/data/demo.js';
import { THINKING } from '../src/domain/actions.js';

const NOTE = 'Gas refill for Mr Anil Kumar, 9900000150';

// A fake API whose AI answers only when the test says so, and which honours Stop like the real client.
function slowApi() {
  const base = fakeApi();
  const pending = [];
  const wait = (signal, answer) => new Promise((resolve, reject) => {
    const stopped = () => reject(new ApiError(STOPPED_MESSAGE, { code: 'stopped' }));
    if (signal?.aborted) { stopped(); return; }
    pending.push(() => resolve(answer()));
    signal?.addEventListener('abort', stopped, { once: true });
  });
  return {
    ...base,
    pending,
    extract: (text, fail, { signal } = {}) => {
      base.calls.push({ name: 'extract', args: [text] });
      return wait(signal, async () => ({ ...(await base.extract(text, false)), reader: 'ai', notice: '' }));
    },
  };
}

// A fetch answer whose body arrives in pieces, like the server's stream of JSON lines.
function streamed(lines, { status = 200 } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(enc.encode(l))); c.close(); } });
  return { ok: status < 300, status, body, json: async () => ({}), clone() { return this; } };
}

let t;
afterEach(() => {
  t?.app.unmount();
  t = null;
  vi.useRealTimers();
});

describe('US-24 Chat works and AI is smooth (web app side)', () => {
  it('AC-24.10: opening Chat asks the server to load the AI models, once every few minutes, without showing anything', async () => {
    t = setup({ hash: '#/' });
    t.go('#/chat');
    await until(() => t.api.calls.some((c) => c.name === 'warmAi'));
    t.go('#/jobs');
    t.go('#/chat');
    await new Promise((r) => setTimeout(r, 20));
    expect(t.api.calls.filter((c) => c.name === 'warmAi')).toHaveLength(1);
    expect(t.$('[role="alert"]')).toBeNull();
  });

  it('AC-24.10: people without Chat, and a failing warm-up, show nothing', async () => {
    const api = { ...fakeApi(), warmAi: vi.fn(async () => { throw new ApiUnreachable(); }) };
    t = setup({ api, hash: '#/chat' });
    t.go('#/jobs');
    t.go('#/chat');
    await until(() => api.warmAi.mock.calls.length >= 1);
    expect(t.$('[data-testid="process-error"]')).toBeNull();
    t.app.unmount();
    const tech = { ...fakeApi(), warmAi: vi.fn(async () => ({})) };
    t = setup({ api: tech, signedInAs: 'st-santosh', hash: '#/' });
    t.go('#/chat');
    await new Promise((r) => setTimeout(r, 20));
    if (!t.$('[data-testid="chat-phone"]')) expect(tech.warmAi).not.toHaveBeenCalled();
  });

  it('AC-24.11: while the AI reads a message, Chat says what it is doing, counts the seconds and offers Stop', async () => {
    const api = slowApi();
    t = setup({ api });
    t.go('#/chat');
    t.app.actions.send({ type: 'text', text: NOTE });
    await until(() => t.$('[data-testid="ai-thinking"]'));
    expect(t.$('[data-testid="ai-thinking"]').textContent).toContain(THINKING.extract);
    expect(t.$('[data-testid="ai-timer"]').textContent).toMatch(/^\d+ s$/);
    expect(t.$('[data-testid="ai-stop"]').textContent).toContain('Stop');
    expect(t.$('#composer-input').disabled).toBe(true);
    await until(() => api.pending.length === 1);
    api.pending.shift()();
    await t.settle();
    expect(t.$('[data-testid="ai-thinking"]')).toBeNull();
    expect(t.$('[data-testid="summary-card"]').textContent).toContain('Anil Kumar');
  });

  it('AC-24.14: after a message is read, Send works again for the next one (it stayed greyed out before)', async () => {
    t = setup();
    t.go('#/chat');
    await t.app.actions.send({ type: 'text', text: NOTE });
    expect(t.$('#composer-input').disabled).toBe(false);
    expect(t.$('.composer .send').disabled).toBe(false);
    expect(t.$('[data-sample="s-ramesh"]').disabled).toBe(false);
    t.$('#composer-input').value = 'Cleaning for Mr Ravi Rao, 9900000151';
    t.$('[data-form="send-text"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await t.settle();
    expect(t.$$('[data-testid="summary-card"]').length).toBe(2);
  });

  it('AC-24.11: Stop ends the wait, keeps the message with Try again, and Try again reads it', async () => {
    const api = slowApi();
    t = setup({ api });
    t.go('#/chat');
    t.app.actions.send({ type: 'text', text: NOTE });
    await until(() => t.$('[data-testid="ai-stop"]') && api.pending.length === 1);
    t.click('[data-testid="ai-stop"]');
    await t.settle();
    expect(t.$('[data-testid="process-error"]').textContent).toContain(STOPPED_MESSAGE);
    expect(t.$$('[data-testid="processing-panel"] .step')[1].dataset.status).toBe('failed');
    expect(t.app.store.get().messages.some((m) => m.from === 'technician' && m.body === NOTE)).toBe(true);
    expect(t.$('#composer-input').disabled).toBe(false);
    api.pending.length = 0; // the stopped call can't answer any more
    t.click('[data-testid="process-error"] [data-action="retry"]');
    await until(() => api.pending.length === 1);
    api.pending.shift()();
    await t.settle();
    expect(t.$('[data-testid="summary-card"]').textContent).toContain('Anil Kumar');
  });

  it('AC-24.12: a job-sheet photo shows its text as the AI reads it, then the finished transcript', async () => {
    const base = fakeApi();
    let feed;
    let finish;
    const api = {
      ...base,
      readImageStream: (id, image, { onText }) => new Promise((resolve) => {
        feed = onText;
        finish = () => resolve({ text: 'Cust: Sunil Patil, Warje\nPh: 99000 00177', reader: 'ai', notice: '' });
      }),
    };
    t = setup({ api });
    t.go('#/chat');
    t.click('[data-sample="s-sunil"]');
    await until(() => feed);
    expect(t.$('[data-testid="ai-thinking"]').textContent).toContain(THINKING.photo);
    feed('Cust: Sunil Patil, Warje\n');
    await until(() => t.$('[data-testid="transcript-streaming"]'));
    expect(t.$('[data-testid="transcript-streaming"]').textContent).toContain('Sunil Patil');
    feed('Ph: 99000 00177');
    finish();
    await t.settle();
    expect(t.$('[data-testid="transcript-streaming"]')).toBeNull();
    expect(t.$('[data-testid="transcript"]').textContent).toContain('99000 00177');
    expect(t.$$('[data-testid="processing-panel"] .step')[0].textContent).toContain('Read by Studio AI (KaryaHub server)');
    // The text being read is only on screen: the saved chat holds the finished transcript, never a half-read one.
    expect(t.app.ui.streaming).toEqual({});
  });

  it('AC-24.13: the API client reads the photo stream piece by piece and returns the final answer', async () => {
    const lines = ['{"text":"Cust: Sunil"}\n{"text":" Patil"}\n', '{"done":true,"text":"Cust: Sunil Patil","reader":"ai","notice":""}\n'];
    const seen = [];
    const fetchImpl = vi.fn(async () => streamed(lines));
    const client = createApiClient({ fetchImpl });
    const out = await client.readImageStream('s-sunil', 'data:image/jpeg;base64,AA==', { onText: (p) => seen.push(p) });
    expect(seen).toEqual(['Cust: Sunil', ' Patil']);
    expect(out).toMatchObject({ text: 'Cust: Sunil Patil', reader: 'ai' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/pipeline/read-image/stream');
    expect(JSON.parse(init.body)).toEqual({ media_id: 's-sunil', simulate_failure: false, image_base64: 'data:image/jpeg;base64,AA==' });
  });

  it('AC-24.13: a stream that ends with an error, an unreachable server and Stop are told apart', async () => {
    const offline = createApiClient({ fetchImpl: async () => streamed(['{"done":true,"error":{"code":"ai_unavailable","message":"The AI server is offline right now."}}\n']) });
    await expect(offline.readImageStream('x', 'AA==')).rejects.toMatchObject({ code: 'ai_unavailable' });
    expect(document.querySelector('.studio-ai-offline')).not.toBeNull();
    const cut = createApiClient({ fetchImpl: async () => streamed(['{"text":"half"}\n']) });
    await expect(cut.readImageStream('x', 'AA==')).rejects.toBeInstanceOf(ApiUnreachable);
    const stop = new AbortController();
    const hanging = createApiClient({ fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
    const p = hanging.extract('note', false, { signal: stop.signal });
    stop.abort();
    await expect(p).rejects.toMatchObject({ code: 'stopped', message: STOPPED_MESSAGE });
  });

  it('AC-24.13: the app waits longer than the server\'s 90-second AI step before giving up', () => {
    expect(AI_TIMEOUT_MS).toBeGreaterThanOrEqual(100000);
    expect(AI_TIMEOUT_MS).toBeLessThan(120000);
  });

  it('AC-24.12: the sample photo still works with a server that has no stream (older server or in-browser mode)', async () => {
    t = setup();
    await sendSample(t, 's-sunil');
    expect(t.$('[data-testid="transcript"]').textContent).toContain(SAMPLES.find((s) => s.id === 's-sunil').mock_transcript.slice(0, 20));
  });
});
