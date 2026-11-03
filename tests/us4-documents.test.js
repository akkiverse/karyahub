import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, sendSample, until } from './helpers.js';
import { computeTotals } from '../src/domain/documents.js';
import { readFileSync } from 'node:fs';

// CR-0012 changed US-4: a job's Make estimate and Make bill open the bill editor (AC-29.4); the demo saves the
// bill on the device with a Sample mark (AC-30.6). AC-4.4 (sent at once, with a chat bubble) is retired:
// sending is now Send on WhatsApp (US-31).
let t;
afterEach(() => { t?.app.unmount(); vi.restoreAllMocks(); });

async function approvedRameshJob() {
  await sendSample(t, 's-ramesh');
  t.click('[data-action="approve"]');
  return t.app.store.get().jobs[0].id;
}
async function makeAndSave(type) {
  const id = await approvedRameshJob();
  t.go(`#/jobs/${id}`);
  t.click(`[data-action="create-doc"][data-type="${type}"]`);
  await until(() => t.$('[data-testid="bill-editor"]'));
  t.click('[data-testid="save-and-share"]');
  await until(() => t.$('[data-testid="bill-paper"]'));
  return id;
}

describe('US-4 Estimate and GST bill from a job (changed CR-0012)', () => {
  it('AC-4.1: a bill made from a job shows the business, GSTIN, customer, lines, CGST and SGST and a total rounded to the rupee', async () => {
    t = setup();
    await makeAndSave('invoice');
    expect(t.$('[data-testid="bill-heading"]').textContent).toBe('Tax Invoice');
    expect(t.$('.doc-biz').textContent).toContain('CoolCare AC Services');
    expect(t.$('[data-testid="seller-gstin"]').textContent).toBe('27AAAAA0000A1Z5');
    expect(t.$('[data-testid="bill-customer"]').textContent).toBe('Ramesh Sharma');
    expect(t.$$('[data-testid="paper-lines"] tbody tr')).toHaveLength(2);
    expect(t.$('[data-testid="paper-cgst"]').textContent).toBe('₹261.00');
    expect(t.$('[data-testid="paper-sgst"]').textContent).toBe('₹261.00');
    expect(t.$('[data-testid="paper-total"]').textContent).toBe('₹3,422');
    expect(t.$('[data-testid="bill-number"]').textContent).toBe('26-27/0001');
    // an estimate too; documents saved before v0.8.0 keep their old maths (AC-28.7)
    t.go(`#/jobs/${t.app.store.get().jobs[0].id}`);
    t.click('[data-action="create-doc"][data-type="quote"]');
    await until(() => t.$('[data-testid="bill-editor"]'));
    expect(t.$('h1').textContent).toBe('New estimate');
    expect(computeTotals([{ description: 'x', qty: 1, rate: 333 }])).toMatchObject({ subtotal: 333, cgst: 29.97, sgst: 29.97, total: 393 });
  });

  it('AC-4.2: every demo bill and estimate carries a visible Sample mark', async () => {
    t = setup();
    await makeAndSave('quote');
    expect(t.$('[data-testid="sample-mark"]').textContent).toBe('Sample');
    expect(t.$('[data-testid="bill-heading"]').textContent).toBe('Estimate');
  });

  it('AC-4.3: Print opens the browser print dialog with a print-styled layout and no external service', async () => {
    t = setup();
    await makeAndSave('invoice');
    const print = vi.fn();
    window.print = print;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('no network'); });
    t.click('[data-testid="download"]');
    expect(print).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/@media print\s*{[\s\S]*\.no-print[\s\S]*display:\s*none/);
  });
});
