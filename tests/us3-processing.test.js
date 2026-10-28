import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-3 Visible processing', () => {
  it('AC-3.1: the processing panel shows Transcribe, Extract, Save in order, all done, with the transcript', async () => {
    t = setup();
    await sendSample(t, 's-ramesh');
    const steps = t.$$('[data-testid="processing-panel"] .step');
    expect(steps.map((s) => s.querySelector('strong').textContent)).toEqual(['Transcribe', 'Extract', 'Save']);
    expect(steps.map((s) => s.dataset.status)).toEqual(['done', 'done', 'done']);
    expect(steps[0].textContent).toContain('Speech adapter');
    expect(steps[1].textContent).toContain('LLM adapter');
    expect(t.$('[data-testid="transcript"]').textContent).toContain('visited Ramesh Sharma ji in Kothrud');
  });

  it('AC-3.2: the Ramesh Sharma sample extracts the expected fields', async () => {
    t = setup();
    await sendSample(t, 's-ramesh');
    const card = t.app.store.get().messages.find((m) => m.kind === 'card');
    expect(card.job).toMatchObject({
      customer_name: 'Ramesh Sharma',
      phone: '9876543210',
      equipment: 'Voltas 1.5T split AC',
      work_done: 'Gas refill',
      amc_expiry: '2027-03-15',
      amc_value: 6500,
    });
    const dd = (f) => t.$(`[data-testid="summary-card"] [data-field="${f}"] dd`).textContent;
    expect(dd('customer_name')).toBe('Ramesh Sharma');
    expect(dd('equipment')).toBe('Voltas 1.5T split AC');
    expect(dd('work_done')).toBe('Gas refill');
    expect(dd('amc_expiry')).toBe('15 Mar 2027');
    expect(dd('amc_value')).toBe('₹6,500');
  });

  it('AC-3.3: Edit, change a field and Approve saves the job with my value, first on the Jobs screen', async () => {
    t = setup();
    await sendSample(t, 's-neha');
    await sendSample(t, 's-ramesh');
    const cards = t.$$('[data-testid="summary-card"]');
    // approve the Neha card first so there is an older job
    cards[0].querySelector('[data-action="approve"]').click();
    const ramesh = t.$$('[data-testid="summary-card"]')[1];
    ramesh.querySelector('[data-action="edit-card"]').click();
    const form = t.$('form[data-form="approve"]');
    form.querySelector('input[name="work_done"]').value = 'Gas refill and coil cleaning';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    t.go('#/jobs');
    const first = t.$('[data-testid="jobs-list"] li');
    expect(first.textContent).toContain('Ramesh Sharma');
    expect(first.textContent).toContain('Gas refill and coil cleaning');
    expect(t.app.store.get().jobs[0].work_done).toBe('Gas refill and coil cleaning');
    expect(t.app.store.get().jobs).toHaveLength(2);
  });

  it('AC-3.4: with Simulate failure on, the failed step is red with the error text and nothing is saved', async () => {
    t = setup({ hash: '#/settings' });
    const sw = t.$('[data-action="toggle-failure"]');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.app.store.get().settings.simulate_failure).toBe(true);
    await sendSample(t, 's-ramesh');
    const failed = t.$('.step[data-status="failed"]');
    expect(failed).not.toBeNull();
    expect(failed.classList.contains('is-failed')).toBe(true);
    expect(t.$('[data-testid="process-error"]').textContent).toContain("Couldn't read this message. Try again.");
    expect(t.$('[data-testid="summary-card"]')).toBeNull();
    expect(t.app.store.get().jobs).toHaveLength(0);
    expect(t.app.store.get().messages.some((m) => m.kind === 'card')).toBe(false);
    // Retry works once the failure is switched off
    t.app.actions.setSetting('simulate_failure', false);
    t.click('[data-action="retry"]');
    await t.settle();
    expect(t.$('[data-testid="summary-card"]')).not.toBeNull();
  });
});
