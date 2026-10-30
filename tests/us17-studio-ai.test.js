import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { createApiClient, ApiError } from '../src/api/client.js';
import { watchAiStatus } from '../src/ui/ai-status.js';
import { jobsheetImage } from '../src/data/jobsheet.js';
import { SAMPLES, demoState } from '../src/data/demo.js';

const OFFLINE_NOTICE = 'AI is offline right now, so this was read without AI. Check the details before approving.';
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

// The fake KaryaHub API, answering as if Studio AI read (or couldn't read) the message.
function aiApi(reader, notice = '') {
  const base = fakeApi();
  return {
    ...base,
    extract: async (text, fail) => ({ ...(await base.extract(text, fail)), reader, notice }),
    readImage: async (id, fail, image) => {
      base.calls.push({ name: 'readImage', args: [id, fail, image] });
      const s = SAMPLES.find((x) => x.id === id);
      return { text: s.mock_transcript, reader, notice };
    },
  };
}

let t;
afterEach(() => {
  t?.app.unmount();
  t = null;
  vi.unstubAllGlobals();
});

describe('US-17 Real AI for job notes and photos (web app side)', () => {
  it('AC-17.7: a message read by Studio AI says so on the processing steps and the job card', async () => {
    t = setup({ api: aiApi('ai') });
    t.go('#/chat');
    t.app.actions.send({ type: 'text', text: 'Gas refill for Mr Anil Kumar, 9900000150' });
    await t.settle();
    const steps = t.$$('[data-testid="processing-panel"] .step');
    expect(steps[1].textContent).toContain('Read by Studio AI (KaryaHub server)');
    expect(t.$('[data-testid="process-note"]')).toBeNull();
    expect(t.$('[data-testid="reader-tag"]').textContent).toContain('Read by AI');
  });

  it('AC-17.8: when AI is offline the message is read without AI, clearly labelled, and still becomes a draft', async () => {
    t = setup({ api: aiApi('quick', OFFLINE_NOTICE) });
    t.go('#/chat');
    t.app.actions.send({ type: 'text', text: 'Gas refill for Mr Anil Kumar, 9900000150' });
    await t.settle();
    const steps = t.$$('[data-testid="processing-panel"] .step');
    expect(steps.map((s) => s.dataset.status)).toEqual(['done', 'done', 'done']);
    expect(steps[1].textContent).toContain('Read without AI (KaryaHub server)');
    expect(t.$('[data-testid="process-note"]').textContent).toContain(OFFLINE_NOTICE);
    expect(t.$('[data-testid="reader-tag"]').textContent).toBe('Read without AI');
    expect(t.$('[data-testid="summary-card"]').textContent).toContain('Anil Kumar');
  });

  it('AC-17.9: the job sheet photo is sent to the server as an image for Studio AI to read', async () => {
    t = setup({ api: aiApi('ai'), photoImage: async (s) => (s.kind === 'photo' ? PHOTO : null) });
    await sendSample(t, 's-sunil');
    const call = t.api.calls.find((c) => c.name === 'readImage');
    expect(call.args).toEqual(['s-sunil', false, PHOTO]);
    expect(t.$$('[data-testid="processing-panel"] .step')[0].textContent).toContain('Read by Studio AI (KaryaHub server)');
    // Where the browser can't draw the photo (as in tests), nothing is sent and the server uses the sample text.
    expect(await jobsheetImage(SAMPLES.find((s) => s.id === 's-sunil'))).toBeNull();
    expect(await jobsheetImage(SAMPLES.find((s) => s.id === 's-ramesh'))).toBeNull();
  });

  it('AC-17.10: if the AI server is offline and a photo can\'t be read, the message stays with Try again, and the offline banner shows', async () => {
    const base = fakeApi();
    const api = { ...base, readImage: async () => { throw new ApiError('The AI server is offline right now, so AI features are paused. Everything else still works; please try again later.', { code: 'ai_unavailable', status: 503 }); } };
    t = setup({ api });
    await sendSample(t, 's-sunil');
    expect(t.$('[data-testid="image-bubble"]')).not.toBeNull();
    expect(t.$('[data-testid="process-error"]').textContent).toContain('AI server is offline right now');
    expect(t.$('[data-testid="process-error"] [data-action="retry"]')).not.toBeNull();
    // The API client turns a 503 ai_unavailable answer into an error and shows the offline banner.
    const res = { ok: false, status: 503, json: async () => ({ error: { code: 'ai_unavailable', message: 'The AI server is offline right now, so AI features are paused. Everything else still works; please try again later.' } }) };
    const client = createApiClient({ fetchImpl: async () => ({ ...res, clone: () => res }) });
    await expect(client.readImage('x-upload', false, PHOTO)).rejects.toBeInstanceOf(ApiError);
    expect(document.querySelector('.studio-ai-offline').textContent).toContain('AI features are offline right now');
  });

  it('AC-17.11: the offline banner follows /api/ai/status and stays quiet when AI isn\'t set up', async () => {
    let answer = { configured: true, online: true };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => answer })));
    const stop = watchAiStatus({ everyMs: 10 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    answer = { configured: true, online: false };
    await vi.waitFor(() => expect(document.querySelector('.studio-ai-offline')?.hidden).toBe(false));
    expect(document.querySelector('.studio-ai-offline').textContent).toContain('Everything else works as usual.');
    answer = { configured: true, online: true };
    await vi.waitFor(() => expect(document.querySelector('.studio-ai-offline').hidden).toBe(true));
    answer = { configured: false, online: false };
    await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector('.studio-ai-offline').hidden).toBe(true);
    stop();
  });

  it('AC-17.12: chat saved by v0.2.0 (cards without a reader) still shows and approves as before', async () => {
    const saved = demoState();
    saved.messages.push(
      { id: 'm-0090', at: '2027-01-01T10:00:00', from: 'bot', kind: 'process', source: { type: 'text', text: 'x' }, transcript: 'x', error: '', steps: [{ id: 'transcribe', label: 'Transcribe', status: 'done', detail: 'Text message, nothing to transcribe' }, { id: 'extract', label: 'Extract', status: 'done', detail: 'LLM adapter (KaryaHub server)' }, { id: 'save', label: 'Save', status: 'done', detail: 'Saved as a draft for your approval' }] },
      { id: 'm-0091', at: '2027-01-01T10:00:01', from: 'bot', kind: 'card', status: 'draft', job: { customer_name: 'Anil Kumar', phone: '9900000150', area: '', equipment: '', work_done: 'Gas refill', parts: '', amc_expiry: '', amc_value: 0, lines: [{ description: 'Gas refill', qty: 1, rate: 0 }] }, source_sample_id: null, reported_by: 'the technician' },
    );
    t = setup({ saved, hash: '#/chat' });
    expect(t.$('[data-testid="reader-tag"]')).toBeNull();
    expect(t.$('[data-testid="process-note"]')).toBeNull();
    expect(t.$('[data-testid="summary-card"]').textContent).toContain('Anil Kumar');
    t.click('[data-testid="summary-card"] [data-action="approve"]');
    expect(t.app.store.get().jobs.some((j) => j.customer_name === 'Anil Kumar')).toBe(true);
  });
});
