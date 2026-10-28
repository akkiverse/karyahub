import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { computeTotals } from '../src/domain/documents.js';
import { readFileSync } from 'node:fs';

let t;
afterEach(() => { t?.app.unmount(); vi.restoreAllMocks(); });

async function approvedRameshJob() {
  await sendSample(t, 's-ramesh');
  t.click('[data-action="approve"]');
  return t.app.store.get().jobs[0].id;
}
async function create(type) {
  const id = await approvedRameshJob();
  t.go(`#/jobs/${id}`);
  t.click(`[data-action="create-doc"][data-type="${type}"]`);
  await vi.waitFor(() => { if (!t.$('[data-testid="document"]')) throw new Error('no doc'); });
  return id;
}

describe('US-4 Quotation and GST-format invoice', () => {
  it('AC-4.1: quote and invoice show business, GSTIN, customer, lines, subtotal, CGST 9% + SGST 9% and a rounded total', async () => {
    t = setup();
    await create('invoice');
    const doc = t.$('[data-testid="document"]');
    expect(t.$('h1').textContent).toBe('Invoice');
    expect(t.$('[data-testid="doc-business"]').textContent).toContain('CoolCare AC Services');
    expect(t.$('[data-testid="doc-gstin"]').textContent).toBe('27AAAAA0000A1Z5');
    expect(t.$('[data-testid="doc-customer"]').textContent).toBe('Ramesh Sharma');
    expect(t.$$('[data-testid="doc-lines"] tbody tr')).toHaveLength(2);
    expect(t.$('[data-testid="subtotal"]').textContent).toBe('₹2,900.00');
    expect(doc.textContent).toContain('CGST 9%');
    expect(doc.textContent).toContain('SGST 9%');
    expect(t.$('[data-testid="cgst"]').textContent).toBe('₹261.00');
    expect(t.$('[data-testid="sgst"]').textContent).toBe('₹261.00');
    expect(t.$('[data-testid="total"]').textContent).toBe('₹3,422');
    // quote too, and rounding to the rupee
    t.go(`#/jobs/${t.app.store.get().jobs[0].id}`);
    t.click('[data-action="create-doc"][data-type="quote"]');
    await vi.waitFor(() => { if (t.$('h1')?.textContent !== 'Quotation') throw new Error('no quote'); });
    const r = computeTotals([{ description: 'x', qty: 1, rate: 333 }]);
    expect(r).toMatchObject({ subtotal: 333, cgst: 29.97, sgst: 29.97, total: 393 });
  });

  it('AC-4.2: every document carries a visible "DEMO, not a valid tax invoice" watermark', async () => {
    t = setup();
    await create('quote');
    expect(t.$('[data-testid="watermark"]').textContent).toBe('DEMO, not a valid tax invoice');
  });

  it('AC-4.3: Download opens the browser print dialog with a print-styled layout and no external service', async () => {
    t = setup();
    await create('invoice');
    const print = vi.fn();
    window.print = print;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('no network'); });
    t.click('[data-testid="download"]');
    expect(print).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/@media print\s*{[\s\S]*\.no-print[\s\S]*display:\s*none/);
  });

  it('AC-4.4: the chat shows "Quotation sent to Ramesh Sharma" with a simulated document attachment', async () => {
    t = setup();
    await create('quote');
    t.go('#/chat');
    expect(t.$$('[data-testid="doc-sent"]').map((p) => p.textContent)).toContain('Quotation sent to Ramesh Sharma');
    const att = t.$('[data-testid="doc-attachment"]');
    expect(att.textContent).toContain('Quotation QT-2027-0001');
    expect(att.textContent).toContain('simulated');
  });
});
