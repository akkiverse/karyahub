// CR-0016: History. Who did what, with their name.
import { describe, it, expect, afterEach } from 'vitest';
import { setup, until } from './helpers.js';
import { meFor, PEOPLE } from './fake-accounts.js';
import { fakeApi } from './fake-api.js';
import { itemChanges } from '../src/domain/inventory.js';
import { historyOnDevice, filterHistory } from '../src/domain/history.js';
import { localClock, localDay } from '../src/format.js';

let t;
afterEach(() => t?.app.unmount());
const real = () => { const m = meFor(PEOPLE['st-owner']); return { ...m, business: { ...m.business, id: 'b1', name: 'Shree Cool', is_demo: false, setup_needed: false } }; };
const fill = (name, value) => { const el = t.$(`[name="${name}"]`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };

describe('US-43 History', () => {
  it('AC-43.1: the demo History shows stock moves with the name of who made them, newest first', () => {
    t = setup({ hash: '#/inventory' });
    t.click('[data-inv-step="it-cap45:in"]');
    t.click('[data-inv-step="it-cap45:out"]');
    t.go('#/history');
    const rows = t.$$('[data-testid="history-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].querySelector('[data-testid="history-who"]').textContent).toBe('Akash Mehta');
    expect(rows[0].textContent).toContain('Capacitor 45');
    expect(t.$('h1').textContent).toBe('History');
  });

  it('AC-43.2: an item says who added it, who changed what, and who stopped it, in its own history', () => {
    t = setup({ hash: '#/inventory/new' });
    fill('name', 'Filter mesh'); fill('sale', '350'); fill('low', '5');
    t.$('form[data-form="inv-item"]').requestSubmit();
    const it = t.app.store.get().items.find((i) => i.name === 'Filter mesh');
    expect(it.history.at(-1)).toMatchObject({ who: 'Akash Mehta', what: 'Added' });
    t.go(`#/inventory/item/${it.id}/edit`);
    fill('sale', '400');
    t.$('form[data-form="inv-item"]').requestSubmit();
    const line = t.app.store.get().items.find((i) => i.id === it.id).history.at(-1);
    expect(line.what).toBe('Changed: sale price ₹350 to ₹400');
    expect(line.who).toBe('Akash Mehta');
    const shown = t.$$('[data-testid="item-line"]').map((x) => x.textContent);
    expect(shown[0]).toContain('sale price ₹350 to ₹400');
    expect(shown[0]).toContain('Akash Mehta');
    t.click('[data-action="inv-stop"]');
    expect(t.$('[data-testid="item-line"]').textContent).toContain('Stopped using');
  });

  it('AC-43.2: what changed names no cost figures', () => {
    const said = itemChanges({ sale: 100, cost: 50, gst: 18, unit: 'nos', low: null }, { sale: 100, cost: 99900, gst: 5, unit: 'nos', low: 2 });
    expect(said).toBe('cost price, GST 18% to 5%, low-stock level none to 2');
    expect(itemChanges({ sale: 100, gst: 18 }, { sale: 100, gst: 18 })).toBe('');
  });

  it('AC-43.3: a saved bill shows its history, open, with the name of who did each step', () => {
    t = setup();
    const id = 'doc-h1';
    t.app.store.update((s) => { s.documents.push({ id, doc_version: 2, type: 'invoice', status: 'saved', number: '26-27/0001', date: '2027-01-01', customer: { name: 'Mehta Clinic' }, lines: [], history: [{ at: '2027-01-01T10:00:00', who: 'Priya Nair', what: 'Saved as 26-27/0001' }, { at: '2027-01-01T11:00:00', who: 'Akash Mehta', what: 'Marked paid' }] }); });
    t.go(`#/bills/${id}`);
    const box = t.$('[data-testid="bill-history"]');
    expect(box.open).toBe(true);
    const lines = [...box.querySelectorAll('li')].map((x) => x.textContent);
    expect(lines[0]).toContain('Marked paid'); // newest first
    expect(lines[0]).toContain('Akash Mehta');
    expect(lines[1]).toContain('Priya Nair');
  });

  it('AC-43.4: filters by kind, person and words, on the device for the demo', () => {
    const entries = [{ who: 'A', at: '2027-01-01T10:00:00', group: 'stock', text: 'Stock in: 3 nos Filter' }, { who: 'B', at: '2027-01-01T09:00:00', group: 'bills', text: 'Bill 26-27/0001: Saved' }];
    expect(filterHistory(entries, { group: 'bills' })).toHaveLength(1);
    expect(filterHistory(entries, { who: 'A' })[0].group).toBe('stock');
    expect(filterHistory(entries, { q: 'FILTER 3' })).toHaveLength(1);
    expect(filterHistory(entries, { q: 'nothing' })).toHaveLength(0);
    expect(historyOnDevice({ items: [], documents: [], jobs: [], stock_moves: [] })).toEqual([]);
  });

  it('AC-43.4: typing in the search narrows the list and keeps the cursor in the box', async () => {
    t = setup({ hash: '#/history' });
    const box = t.$('[data-hist-search]');
    box.focus();
    box.value = 'zzzz nothing';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => t.$('[data-testid="history-empty"]'));
    expect(document.activeElement).toBe(box);
    expect(t.$('[data-hist-search]')).toBe(box);
  });

  it('AC-43.4: a real business asks the server, and each filter asks again', async () => {
    const api = fakeApi();
    t = setup({ me: real(), api, hash: '#/history' });
    await until(() => t.$('[data-testid="history-row"]'));
    expect(t.$('[data-testid="history-who"]').textContent).toBe('Akash Mehta');
    t.click('[data-action="hist-group"][data-group="bills"]');
    await until(() => api.accountCalls.filter((c) => c.name === 'history').at(-1)?.args[0].group === 'bills');
    const who = t.$('[data-hist-who]');
    who.value = 'Akash Mehta';
    who.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => api.accountCalls.filter((c) => c.name === 'history').at(-1)?.args[0].who === 'Akash Mehta');
  });

  it('AC-43.5: History is in the menu only for those allowed; others are refused', () => {
    t = setup();
    expect(t.$('nav.tabs a[href="#/history"]')).toBeTruthy();
    t.app.unmount();
    t = setup({ signedInAs: 'st-coord', hash: '#/history' });
    expect(t.$('nav.tabs a[href="#/history"]')).toBeNull();
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
  });

  it('AC-43.7: a server time shows on the device clock; a demo time stands as written', () => {
    const utc = '2026-11-04T06:30:00';
    const expected = new Date(`${utc}Z`);
    expect(localClock(utc)).toBe(`${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`);
    expect(localClock('2027-01-01T10:00:00', true)).toBe('10:00');
    expect(localDay('2027-01-01T10:00:00', true, '2027-01-01')).toBe('Today');
    expect(localDay('2026-12-31T10:00:00', true, '2027-01-01')).toBe('Yesterday');
    expect(localDay('2026-12-20T10:00:00', true, '2027-01-01')).toBe('20 Dec 2026');
  });
});
