import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { NO_NAME_REPLY, UNDERSTOOD_REPLY } from '../src/domain/actions.js';
import { mockLlm } from '../src/adapters/llm.js';

let t;
afterEach(() => { t?.app.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('US-2 Simulated WhatsApp chat', () => {
  it('AC-2.1: Chat shows a phone-style chat titled KaryaHub and at least 3 samples (2 voice notes, 1 photo)', () => {
    t = setup({ hash: '#/chat' });
    expect(t.$('[data-testid="chat-title"]').textContent).toBe('KaryaHub');
    const samples = t.$$('[data-testid="sample-picker"] [data-sample]');
    expect(samples.length).toBeGreaterThanOrEqual(3);
    const kinds = samples.map((b) => (b.querySelector('small') ? 'voice' : 'photo'));
    expect(kinds.filter((k) => k === 'voice').length).toBe(2);
    expect(kinds.filter((k) => k === 'photo').length).toBe(1);
    expect(t.$('[data-testid="chat-hint"]').textContent).toBe('Pick a sample to start');
  });

  it('AC-2.2: the Ramesh Sharma voice note shows a player with duration, then within 3 seconds the bot reply and a job summary card', async () => {
    vi.useFakeTimers();
    t = setup({ realTiming: true, hash: '#/chat' }); // default demo timing
    const btn = t.$$('[data-sample]').find((b) => b.textContent.includes('Ramesh Sharma gas refill'));
    btn.click();
    expect(t.$('[data-testid="voice-note"] .voice-play')).not.toBeNull();
    expect(t.$('[data-testid="voice-duration"]').textContent).toBe('0:42');
    expect(t.$('[data-testid="summary-card"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    const texts = t.$$('.msg.in .bubble-text').map((p) => p.textContent);
    expect(texts).toContain(UNDERSTOOD_REPLY);
    expect(UNDERSTOOD_REPLY).toBe('Got it. Here is what I understood');
    expect(t.$('[data-testid="summary-card"]')).not.toBeNull();
  });

  it('AC-2.3: the job-sheet photo sample shows an image bubble and a job summary card', async () => {
    t = setup();
    await sendSample(t, 's-sunil');
    expect(t.$('[data-testid="image-bubble"] svg')).not.toBeNull();
    const card = t.$('[data-testid="summary-card"]');
    expect(card.textContent).toContain('Sunil Patil');
  });

  it('AC-2.4: free text is answered by the mock LLM with a summary card, or asks for a missing customer name', async () => {
    const spy = vi.spyOn(mockLlm, 'extractJob');
    t = setup({ hash: '#/chat' });
    const input = t.$('#composer-input');
    input.value = 'Gas refill for Mr Anil Kumar, Voltas 1.5 ton split AC, phone 99000 00150, charge 2500';
    t.$('form[data-form="send-text"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await t.settle();
    expect(spy).toHaveBeenCalled();
    const card = t.$('[data-testid="summary-card"]');
    expect(card.querySelector('[data-field="customer_name"] dd').textContent).toBe('Anil Kumar');
    expect(card.querySelector('[data-field="phone"] dd').textContent).toBe('99000 00150');

    const input2 = t.$('#composer-input');
    input2.value = 'did the service, all good, cooling fine now';
    t.$('form[data-form="send-text"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await t.settle();
    const last = t.$$('.msg.in .bubble-text').map((p) => p.textContent).pop();
    expect(last).toBe(NO_NAME_REPLY);
    expect(NO_NAME_REPLY).toBe("I couldn't find a customer name, can you add it?");
    expect(t.$$('[data-testid="summary-card"]').length).toBe(1);
  });
});
