import { describe, it, expect, afterEach } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { setup, sendSample, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor, REAL_BUSINESS } from './fake-accounts.js';
import { migrate } from '../src/migrations.js';
import { stockOf, partsOnJob, matches, validateItem, partLines } from '../src/domain/inventory.js';
import { defaultPermissions } from '../src/domain/access.js';

let t;
afterEach(() => { t?.app.unmount(); t = null; });

const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const names = (x) => x.$$('.inv-card strong').map((n) => n.textContent);
const itemOf = (x, id) => x.app.store.get().items.find((i) => i.id === id);

// ---------- a demo business: the screens and the rules, applied on the device ----------
const demo = (hash = '#/inventory', signedInAs = 'st-owner') => setup({ hash, signedInAs });

async function approvedJob(x, sample = 's-ramesh') {
  await sendSample(x, sample);
  x.click('[data-action="approve"]');
  return x.app.store.get().jobs[0];
}
function openSheet(x, type_) {
  x.click(`[data-action="inv-sheet"][data-type="${type_}"]`);
  return x.$('[data-form="inv-sheet"]');
}

describe('US-25 Inventory per business: the list', () => {
  it("AC-25.1: Inventory lists the business's items by name with quantity and tiles for items, low and out", () => {
    t = demo();
    expect(names(t)[0]).toBe('Capacitor 2.5 µF fan');
    expect(names(t)).toEqual([...names(t)].sort((a, b) => a.localeCompare(b, 'en-IN')));
    expect(t.$('[data-testid="kpi-items"]').textContent).toBe('12');
    expect(t.$('[data-testid="kpi-low"]').textContent).toBe('3');
    expect(t.$('[data-testid="kpi-out"]').textContent).toBe('1');
    expect(t.$('[data-testid="kpi-value"]').textContent).toBe('₹29,392'); // quantity times cost price, owners only
    expect(t.$('.inv-card [data-testid="qty"]').textContent).toBe('3 nos');
    expect(t.$('.inv-table-wrap thead').textContent).toContain('Cost price');
    expect(t.$('nav.bottom-tabs').textContent).toContain('Inventory');
    expect(t.$$('nav.bottom-tabs .tab')).toHaveLength(5); // Admin stays in the account menu
  });

  it('AC-25.2: search finds items by every word of the name or code, ignoring capitals, spaces, dots and µ', () => {
    t = demo();
    type(t.$('#inv-q'), 'cap 45');
    expect(names(t)).toEqual(['Capacitor 45 µF']);
    type(t.$('#inv-q'), 'CAP-2.5');
    expect(names(t)).toEqual(['Capacitor 2.5 µF fan']);
    type(t.$('#inv-q'), 'copper 3/8');
    expect(names(t)).toEqual(['Copper pipe 3/8 in']);
    type(t.$('#inv-q'), 'cap uf');
    expect(names(t)).toHaveLength(2);
    expect(matches({ name: 'Capacitor 45 µF', code: 'CAP-45' }, 'cap 45 uf')).toBe(true);
    type(t.$('#inv-q'), 'zzz');
    expect(t.$('[data-testid="inv-empty"]').textContent).toContain('No items match “zzz”. Check the spelling, or add it as a new item.');
    t.click('[data-action="inv-add"]');
    expect(t.$('input[name="name"]').value).toBe('zzz'); // Add item starts with what was searched for
    expect(window.location.hash).toBe('#/inventory/new');
  });

  it('AC-25.2: the chips All, Low, Out and Stopped show their counts and filter the list', () => {
    t = demo();
    expect(t.$$('[data-action="inv-filter"]').map((b) => b.textContent.replace(/\s+/g, ' ').trim())).toEqual(['All 12', 'Low 3', 'Out 1', 'Stopped 0']);
    t.click('[data-filter="low"]');
    expect(names(t)).toEqual(['Capacitor 2.5 µF fan', 'Indoor fan motor, 1.5 ton split', 'R22 refrigerant gas']);
    t.click('[data-filter="out"]');
    expect(names(t)).toEqual(['Copper pipe 3/8 in']);
    t.click('[data-filter="stopped"]');
    expect(t.$('[data-testid="inv-empty"]').textContent).toContain('No stopped items');
    expect(t.$('[data-filter="low"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('AC-25.3: the mark is Low at or below the level, Out at zero, Short by N below zero, and none with no level', () => {
    t = demo();
    t.app.store.update((s) => {
      s.items.find((i) => i.id === 'it-valve').qty = 0; // no low-stock level: only Out or Short
      s.items.find((i) => i.id === 'it-tape').qty = -2;
    });
    const mark = (id) => t.$(`.inv-card[data-item="${id}"] [data-testid="mark"]`)?.textContent || '';
    expect(mark('it-cap25')).toBe('Low');
    expect(mark('it-motor')).toBe('Low'); // 2 of a level of 2 is "at"
    expect(mark('it-cu38')).toBe('Out');
    expect(mark('it-valve')).toBe('Out');
    expect(mark('it-tape')).toBe('Short by 2 roll');
    expect(mark('it-cap45')).toBe('');
    t.app.store.update((s) => { s.items.find((i) => i.id === 'it-valve').qty = 1; });
    expect(mark('it-valve')).toBe(''); // no level, some stock: no mark
  });

  it('AC-25.17: a technician has no Inventory screen or tab; a person with only view access cannot change anything', () => {
    t = demo('#/inventory', 'st-santosh');
    expect(t.$('[data-testid="access-denied"]').textContent).toContain("You don't have access to Inventory");
    expect(t.$('nav.tabs').textContent).not.toContain('Inventory');
    t.app.unmount();
    t = setup({ hash: '#/inventory', me: meFor(PEOPLE['st-coord'], undefined, { permissions: ['view_inventory', 'view_jobs'] }) });
    expect(t.$('[data-testid="inv-readonly"]').textContent).toContain('Ask the office to add or correct stock.');
    expect(t.$('a[href="#/inventory/new"]')).toBeNull();
    expect(t.$('[data-testid="kpi-value"]')).toBeNull(); // no stock value without manage_inventory
    expect(t.$('.inv-table-wrap thead').textContent).not.toContain('Cost price');
    t.go('#/inventory/new');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    t.go('#/inventory/import');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
  });

  it('AC-25.17: the three permissions exist, are on for the office and off for technicians', () => {
    for (const id of ['view_inventory', 'manage_inventory', 'use_parts']) {
      expect(defaultPermissions('owner')).toContain(id);
      expect(defaultPermissions('coordinator')).toContain(id);
      expect(defaultPermissions('technician')).not.toContain(id);
    }
  });
});

describe('US-25 Inventory per business: items, stock in, stock out and counts', () => {
  it('AC-25.4: adding an item checks every field, keeps the code unique and saves opening stock as a first move', () => {
    t = demo('#/inventory/new');
    const form = () => t.$('[data-form="inv-item"]');
    const fill = (v) => Object.entries(v).forEach(([k, val]) => { form().elements[k].value = val; });
    fill({ name: 'X', code: 'cap-45', unit: 'nos', sale: '4,50x', cost: '', hsn: '853', gst: '18', low: 'many', opening: '2.5' });
    submit(form());
    const said = Object.fromEntries(t.$$('.field-error').map((n) => [n.id.replace('err-', ''), n.textContent]));
    expect(said).toEqual({
      name: 'Give the item a name of 2 to 80 characters.',
      code: 'Code cap-45 is already used by Capacitor 45 µF.',
      sale: 'Type the price in rupees, for example 450 or 450.50.',
      hsn: 'An HSN code has 4, 6 or 8 digits.',
      low: 'Type a number, or leave it empty for no Low mark.',
      opening: 'Use a whole number for nos.',
    });
    expect(t.app.store.get().items).toHaveLength(12); // nothing was added
    expect(t.$('input[name="name"]').getAttribute('aria-invalid')).toBe('true');
    fill({ name: 'Capacitor 35 µF', code: 'CAP-35', sale: '380', cost: '170', hsn: '8532', low: '5', opening: '10' });
    submit(form());
    expect(window.location.hash).toBe('#/inventory');
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('Added Capacitor 35 µF with 10 nos in stock.');
    const item = t.app.store.get().items.find((i) => i.code === 'CAP-35');
    expect(item).toMatchObject({ name: 'Capacitor 35 µF', unit: 'nos', sale: 38000, cost: 17000, gst: 18, low: 5, qty: 10, stopped: false });
    const first = t.app.store.get().stock_moves.find((m) => m.item_id === item.id);
    expect(first).toMatchObject({ kind: 'opening', qty: 10 }); // the opening stock is the item's first move
  });

  it('AC-25.4: editing an item changes its details and never its quantity', () => {
    t = demo('#/inventory/item/it-cap45/edit');
    expect(t.$('input[name="opening"]')).toBeNull();
    const f = t.$('[data-form="inv-item"]');
    f.elements.sale.value = '475.50';
    f.elements.code.value = 'CAP-45A';
    submit(f);
    expect(window.location.hash).toBe('#/inventory/item/it-cap45');
    expect(itemOf(t, 'it-cap45')).toMatchObject({ sale: 47550, code: 'CAP-45A', qty: 12 });
    expect(t.$('[data-testid="inv-notice"]').textContent).toBe('Saved Capacitor 45 µF.');
    expect(validateItem({ name: 'Own code kept', code: 'cap-45a', unit: 'nos', sale: '1', gst: '18' }, t.app.store.get(), 'it-cap45').errors).toEqual({});
  });

  it('AC-25.5: an item is stopped, not deleted: it leaves the list and the pickers, keeps its history, and can be used again', async () => {
    t = demo('#/inventory/item/it-cap45');
    t.click('[data-action="inv-stop"]');
    expect(itemOf(t, 'it-cap45').stopped).toBe(true);
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('Stopped using Capacitor 45 µF');
    expect(t.$('[data-action="inv-sheet"]')).toBeNull(); // no stock in, out or count for a stopped item
    t.go('#/inventory');
    expect(names(t)).not.toContain('Capacitor 45 µF');
    t.click('[data-filter="stopped"]');
    expect(names(t)).toEqual(['Capacitor 45 µF']);
    t.go('#/inventory/item/it-cap45');
    expect(t.$('[data-testid="inv-history"]').textContent).toContain('Opening stock');
    t.click('[data-action="inv-stop"]');
    expect(itemOf(t, 'it-cap45').stopped).toBe(false);
    expect(t.$('[data-testid="inv-notice"]').textContent).toBe('Capacitor 45 µF is in use again.');
  });

  it('AC-25.7: stock in adds to the quantity, checks the date and the quantity, and appears in the history', () => {
    t = demo('#/inventory/item/it-cap25');
    const form = openSheet(t, 'in');
    form.elements.qty.value = '1.5';
    form.elements.date.value = '31-12-2999';
    submit(form);
    expect(t.$('.sheet .field-error#err-qty').textContent).toBe('Use a whole number for nos.');
    expect(t.$('.sheet .field-error#err-date').textContent).toBe("The date can't be in the future.");
    const again = t.$('[data-form="inv-sheet"]');
    again.elements.qty.value = '5';
    again.elements.date.value = '30-12-2026';
    again.elements.supplier.value = 'Sai Refrigeration';
    again.elements.cost.value = '62.50';
    submit(again);
    expect(t.$('.sheet')).toBeNull();
    expect(itemOf(t, 'it-cap25').qty).toBe(8);
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('Added 5 nos to Capacitor 2.5 µF fan. In stock: 8 nos.');
    const top = t.$('[data-testid="inv-history"] li');
    expect(top.textContent).toContain('Stock in');
    expect(top.textContent).toContain('+5 nos');
    expect(top.textContent).toContain('then 8 nos');
    expect(t.app.store.get().stock_moves.at(-1)).toMatchObject({ kind: 'in', qty: 5, date: '2026-12-30', supplier: 'Sai Refrigeration', cost: 6250 });
  });

  it('AC-25.8: stock out needs a reason, refuses more than is in stock, and points to the job screen for parts', () => {
    t = demo('#/inventory/item/it-cap25');
    const form = openSheet(t, 'out');
    expect(t.$('.sheet').textContent).toContain("Taking a part for a job? Do it on the job's screen");
    form.elements.qty.value = '9';
    submit(form);
    expect(t.$('.sheet #err-qty').textContent).toBe("Only 3 nos in stock. If that's wrong, count the stock first.");
    expect(t.$('.sheet #err-reason').textContent).toBe('Pick a reason.');
    const f2 = t.$('[data-form="inv-sheet"]');
    f2.elements.qty.value = '1';
    f2.querySelector('input[value="other"]').checked = true;
    submit(f2);
    expect(t.$('.sheet #err-note').textContent).toBe('Say what it was used for.');
    const f3 = t.$('[data-form="inv-sheet"]');
    f3.elements.qty.value = '1';
    f3.querySelector('input[value="lost"]').checked = true;
    f3.elements.note.value = 'burnt while testing';
    submit(f3);
    expect(itemOf(t, 'it-cap25').qty).toBe(2);
    expect(t.app.store.get().stock_moves.at(-1)).toMatchObject({ kind: 'out', qty: -1, note: 'Damaged or lost: burnt while testing' });
  });

  it('AC-25.9: a count shows the difference before saving, records a correction, and saves nothing when it matches', () => {
    t = demo('#/inventory/item/it-r32');
    const form = openSheet(t, 'count');
    type(form.elements.qty, '5');
    expect(t.$('[data-slot="inv-diff"]').textContent).toBe('This records −1.5 kg as a count correction.');
    type(form.elements.qty, '6.5');
    expect(t.$('[data-slot="inv-diff"]').textContent).toBe('Count matches. Nothing to change.');
    const before = t.app.store.get().stock_moves.length;
    submit(form);
    expect(t.app.store.get().stock_moves).toHaveLength(before);
    expect(t.$('[data-testid="inv-notice"]').textContent).toBe('Count matches. Nothing to change.');
    const f2 = openSheet(t, 'count');
    f2.elements.qty.value = '5';
    f2.elements.note.value = 'monthly count';
    submit(f2);
    expect(itemOf(t, 'it-r32').qty).toBe(5);
    expect(t.app.store.get().stock_moves.at(-1)).toMatchObject({ kind: 'count', qty: -1.5, counted: 5, note: 'monthly count' });
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('Count saved: −1.5 kg as a correction. In stock: 5 kg.');
  });

  it("AC-25.10: an item's history lists every move newest first with who, the job and the quantity after, and has no way to edit one", () => {
    t = demo('#/inventory/item/it-cap25');
    for (const [kind, qty] of [['in', '4'], ['out', '2']]) {
      const f = openSheet(t, kind);
      f.elements.qty.value = qty;
      if (kind === 'out') f.querySelector('input[value="supplier"]').checked = true;
      submit(f);
    }
    const rows = t.$$('[data-testid="inv-history"] li');
    expect(rows.map((r) => r.dataset.kind)).toEqual(['out', 'in', 'opening']);
    expect(rows[0].textContent).toContain('−2 nos');
    expect(rows[0].textContent).toContain('then 5 nos');
    expect(rows[1].textContent).toContain('then 7 nos');
    expect(rows[0].textContent).toContain('Akash Mehta');
    expect(t.$('[data-testid="inv-history"] [data-action], [data-testid="inv-history"] button, [data-testid="inv-history"] input')).toBeNull();
  });
});

describe('US-25 Inventory per business: parts used on a job', () => {
  it('AC-25.11: taking a part from inventory lowers the stock, lists the part on the job and says so in its history', async () => {
    t = demo();
    const j = await approvedJob(t, 's-neha');
    t.go(`#/jobs/${j.id}`);
    expect(t.$('[data-testid="parts-empty"]').textContent).toBe('No parts taken from inventory yet.');
    t.click('[data-action="inv-pick"]');
    type(t.$('[data-pick-search]'), 'drain');
    t.click('[data-action="inv-pick-item"]');
    const f = t.$('[data-form="inv-sheet"]');
    f.elements.qty.value = '2';
    submit(f);
    expect(itemOf(t, 'it-drain').qty).toBe(43);
    expect(t.$('[data-testid="parts-list"]').textContent).toContain('Drain pipe 16 mm');
    expect(t.$('[data-testid="parts-list"] .qty').textContent).toBe('2 m');
    expect(t.app.store.get().jobs[0].parts_used).toEqual({ 'it-drain': 2 });
    expect(t.$('[data-testid="job-timeline"]').textContent).toContain('Akash Mehta used 2 m Drain pipe 16 mm');
    t.click('[data-action="inv-remove"]');
    expect(itemOf(t, 'it-drain').qty).toBe(45);
    expect(t.$('[data-testid="parts-empty"]')).toBeTruthy();
    expect(t.$('[data-testid="job-timeline"]').textContent).toContain('put back 2 m Drain pipe 16 mm');
  });

  it('AC-25.11: more than is in stock is allowed with a warning and shows as short; a closed job takes no parts', async () => {
    t = demo();
    const j = await approvedJob(t, 's-neha');
    t.go(`#/jobs/${j.id}`);
    t.click('[data-action="inv-pick"]');
    type(t.$('[data-pick-search]'), 'r22');
    t.click('[data-action="inv-pick-item"]');
    type(t.$('input[name="qty"]'), '2');
    expect(t.$('[data-slot="pick-short"]').hidden).toBe(false);
    expect(t.$('[data-slot="pick-short"]').textContent).toContain('Only 1.5 kg in stock. It will show as short until someone counts.');
    submit(t.$('[data-form="inv-sheet"]'));
    expect(itemOf(t, 'it-r22').qty).toBe(-0.5);
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('shows as short until someone counts');
    t.app.store.update((s) => { s.jobs[0].state = 'CLOSED'; });
    expect(t.$('[data-action="inv-pick"]')).toBeNull();
    expect(t.$('[data-testid="parts-panel"]').textContent).toContain("This job is closed, so its parts can't change.");
    expect(t.$('[data-action="inv-remove"]')).toBeNull();
    expect(t.app.actions.stock.takePart(j.id, 'it-cap45', 1).error).toBe("This job is closed, so its parts can't change.");
  });

  it('AC-25.12: parts named in the note are offered by name with no AI, and nothing is taken until Take is pressed', async () => {
    t = demo();
    const j = await approvedJob(t, 's-ramesh'); // the note says "R32 refrigerant"
    t.app.store.update((s) => { s.jobs[0].parts = 'R32 gas 1.5 kg, capacitor 45 uF, copper nut, drain pipe 2 m'; });
    t.go(`#/jobs/${j.id}`);
    const box = t.$('[data-testid="part-suggestions"]');
    expect(box.textContent).toContain('R32 refrigerant gas');
    expect(box.textContent).toContain('Take 1.5 kg');
    expect(box.textContent).toContain('Capacitor 45 µF');
    expect(box.textContent).toContain('Take 1 nos'); // no quantity in the note means one
    expect(box.textContent).toContain('Take 2 m');
    expect(t.$('[data-testid="part-unmatched"]').textContent).toBe('Not in your inventory: copper nut');
    expect(itemOf(t, 'it-r32').qty).toBe(6.5); // nothing taken yet
    t.click('[data-action="inv-take"][data-item="it-r32"]');
    expect(itemOf(t, 'it-r32').qty).toBe(5);
    expect(t.$('[data-testid="part-suggestions"]').textContent).not.toContain('R32 refrigerant gas'); // taken: no longer offered
    t.click('[data-action="inv-dismiss"]');
    expect(t.$$('[data-action="inv-take"]').map((b) => b.dataset.item)).toEqual(['it-drain']);
    t.click('[data-action="inv-add"]');
    expect(t.$('input[name="name"]').value).toBe('copper nut');
  });

  it('AC-25.13: the parts a job used become lines on its quote and invoice, after the work lines and still editable', async () => {
    t = demo();
    const j = await approvedJob(t, 's-ramesh');
    t.go(`#/jobs/${j.id}`);
    expect(t.app.actions.stock.takePart(j.id, 'it-r32', '1').short).toBe(false);
    expect(t.app.actions.stock.takePart(j.id, 'it-motor', '1').item.name).toBe('Indoor fan motor, 1.5 ton split');
    t.click('[data-action="create-doc"][data-type="invoice"]');
    await until(() => t.$('.doc-table'));
    const lines = t.app.store.get().documents[0].lines;
    expect(lines.map((l) => l.description)).toEqual(['Gas refill (R32), Voltas 1.5T split AC', 'Service visit', 'R32 refrigerant gas', 'Indoor fan motor, 1.5 ton split']);
    expect(lines[2]).toEqual({ description: 'R32 refrigerant gas', qty: 1, rate: 950 });
    expect(lines[3]).toEqual({ description: 'Indoor fan motor, 1.5 ton split', qty: 1, rate: 3200 });
    t.app.actions.updateDocumentLine(t.app.store.get().documents[0].id, 2, { rate: 1000 });
    expect(t.app.store.get().documents[0].lines[2].rate).toBe(1000);
  });

  it('AC-25.13: a part the job already charges for is not added a second time', async () => {
    t = demo();
    const j = await approvedJob(t, 's-sunil'); // its own line is "Capacitor 45 uF"
    t.app.actions.stock.takePart(j.id, 'it-cap45', '1');
    t.go(`#/jobs/${j.id}`);
    t.click('[data-action="create-doc"][data-type="quote"]');
    await until(() => t.$('.doc-table'));
    const lines = t.app.store.get().documents[0].lines.map((l) => l.description);
    expect(lines.filter((l) => /capacitor/i.test(l))).toEqual(['Capacitor 45 uF']);
    expect(partLines(t.app.store.get(), t.app.store.get().jobs[0])).toEqual([]);
  });

  it('AC-25.17: a technician the owner allows to take parts can do so, but still sees no Inventory and no cost prices', async () => {
    const tech = meFor(PEOPLE['st-santosh'], undefined, { permissions: [...defaultPermissions('technician'), 'use_parts'] });
    t = setup({ me: tech, hash: '#/jobs' });
    t.app.store.update((s) => { s.jobs.unshift({ id: 'J-0001', customer_id: 'c01', customer_name: 'Anita Deshpande', phone: '9900000101', area: 'Baner', equipment: '', date: '2027-01-01', work_done: 'Gas top-up', parts: 'R32', lines: [], state: 'WORK_DONE', events: [], otp: null }); });
    t.go('#/jobs/J-0001');
    expect(t.$('nav.tabs').textContent).not.toContain('Inventory');
    t.click('[data-action="inv-pick"]');
    expect(t.$('.sheet').textContent).toContain('R32 refrigerant gas');
    t.click('[data-action="inv-pick-item"][data-item="it-r32"]');
    type(t.$('input[name="qty"]'), '1');
    submit(t.$('[data-form="inv-sheet"]'));
    expect(t.$('[data-testid="parts-list"]').textContent).toContain('R32 refrigerant gas');
    expect(t.$('[data-testid="parts-list"]').textContent).not.toContain('₹'); // no prices for someone who makes no paperwork
    t.go('#/inventory');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    expect(t.app.actions.stock.move('it-r32', 'in', { qty: '5', date: '01-01-2027' }).error).toBe("Your access doesn't include this. Ask your business owner.");
  });

  it("AC-25.17: a technician with no inventory permission sees nothing about parts on a job", async () => {
    t = setup({ signedInAs: 'st-santosh', hash: '#/chat' });
    const j = await approvedJob(t);
    t.go(`#/jobs/${j.id}`);
    expect(t.$('[data-testid="parts-panel"]')).toBeNull();
  });
});

describe('US-25 Inventory per business: a real business, with the server and a weak signal', () => {
  const owner = () => meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, REAL_BUSINESS);
  const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };
  const ITEM = { id: 'it-cap', name: 'Capacitor 45 µF', code: 'CAP-45', unit: 'nos', sale: 45000, cost: 21000, hsn: '8532', gst: 18, low: 5, stopped: false, qty: 10 };
  const JOB = { id: 'j1', customer_id: 'c1', customer_name: 'Ramesh Sharma', phone: '9822200010', date: '2027-01-01', work_done: 'Gas top-up', parts: 'capacitor 45 uF', lines: [], state: 'WORK_DONE', events: [], otp: null, parts_used: {} };

  function serverWith(api = fakeApi()) {
    const set = (kind, id, body, seq) => api.server.records.set(`${kind}:${id}`, { kind, id, number: kind === 'job' ? 'J-0001' : '', seq, body: JSON.parse(JSON.stringify(body)) });
    set('item', 'it-cap', ITEM, 1);
    set('job', 'j1', JOB, 2);
    api.server.counters.seq = 2;
    return api;
  }
  function open({ api = serverWith(), me = owner(), hash = '#/inventory', preload } = {}) {
    localStorage.clear();
    if (preload) localStorage.setItem(`karyahub.biz.v1.${REAL_BUSINESS.id}`, JSON.stringify(preload));
    setToday('2027-01-01');
    window.location.hash = hash;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    const app = mountApp(root, { ...FAST, api, me });
    return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)], go: (h) => app.navigate(h), click: (s) => root.querySelector(s).click() };
  }
  const chip = (x) => x.$('[data-testid="sync-status"]');
  const serverQty = (api) => api.server.records.get('item:it-cap').body.qty;
  const moveOps = (api) => api.syncCalls.flatMap((c) => c.ops).filter((o) => o.kind === 'stock_move');

  it('AC-25.1: a real business gets its items from the server, not from the demo sample', async () => {
    t = open();
    await until(() => t.$('.inv-card'));
    expect(names(t)).toEqual(['Capacitor 45 µF']);
    expect(t.$('.inv-card [data-testid="qty"]').textContent).toBe('10 nos');
    expect(t.app.store.get().items).toHaveLength(1);
    expect(t.$('.inv-table-wrap thead').textContent).toContain('Cost price');
    expect(t.$('[data-testid="inv-notice"]')).toBeNull();
    expect(t.$('.page-head').textContent).not.toContain('Sample stock'); // the demo note is for the demo only
    expect(t.$('a[href="#/inventory/import"]')).toBeTruthy();
  });

  it('AC-25.14: with no signal a part is taken at once, counted as waiting, and sent once when the signal returns', async () => {
    const api = serverWith();
    t = open({ api, hash: '#/jobs/j1' });
    await until(() => t.$('[data-testid="parts-panel"]') && t.app.store.get().items.length === 1);
    await until(() => chip(t)?.textContent.includes('All saved'));
    api.network.offline = true;
    t.click('[data-action="inv-take"]'); // the note says "capacitor 45 uF": one tap
    expect(t.$('[data-testid="parts-list"] .qty').textContent).toBe('1 nos');
    expect(stockOf(t.app.store.get(), t.app.store.get().items[0])).toBe(9);
    await until(() => chip(t)?.textContent.includes('waiting, offline'));
    expect(serverQty(api)).toBe(10);
    t.go('#/inventory');
    expect(t.$('.inv-card [data-testid="qty"]').textContent).toBe('9 nos'); // shown at once, before the server knows
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => chip(t)?.textContent.includes('All saved'));
    expect(serverQty(api)).toBe(9);
    expect(new Set(moveOps(api).filter((o) => o.body.kind === 'used').map((o) => o.op_id)).size).toBe(1); // one operation, however many tries
    expect(t.$('.inv-card [data-testid="qty"]').textContent).toBe('9 nos'); // the server's 9, not 9 minus the move again
    expect(partsOnJob(t.app.store.get(), t.app.store.get().jobs[0])).toHaveLength(1);
    expect(t.app.store.get().jobs[0].parts_used).toEqual({ 'it-cap': 1 });
  });

  it('AC-25.14: an answer lost on the way, sent again, changes the stock once', async () => {
    const api = serverWith();
    t = open({ api, hash: '#/jobs/j1' });
    await until(() => t.app.store.get().items.length === 1 && chip(t)?.textContent.includes('All saved'));
    api.network.loseNext = 1; // the server applies the change but its answer never arrives
    t.click('[data-action="inv-take"]');
    await until(() => chip(t)?.textContent.includes('waiting') || serverQty(api) === 9);
    await t.app.sync.flush();
    await until(() => chip(t)?.textContent.includes('All saved'));
    expect(serverQty(api)).toBe(9); // not 8
    const ids = moveOps(api).map((o) => o.op_id);
    expect(new Set(ids).size).toBe(1);
    expect(ids.length).toBeGreaterThan(1); // the same operation was sent more than once
  });

  it('AC-25.15: the quantity is the server\'s: this phone sends moves and never a quantity, and a refused move is taken back', async () => {
    const api = serverWith();
    api.server.records.get('item:it-cap').body.qty = 3;
    t = open({ api, hash: '#/inventory/item/it-cap' });
    await until(() => t.app.store.get().items.length === 1 && chip(t)?.textContent.includes('All saved'));
    expect(t.$('.kpi-value .qty').textContent).toBe('3 nos');
    // Two phones: the server's quantity dropped to 1 while this phone still shows 3.
    const onServer = api.server.records.get('item:it-cap');
    onServer.body.qty = 1;
    onServer.seq = 10;
    api.server.counters.seq = 10;
    const f = openSheet(t, 'out');
    f.elements.qty.value = '2';
    f.querySelector('input[value="lost"]').checked = true;
    submit(f);
    expect(t.$('.kpi-value .qty').textContent).toBe('1 nos'); // 3 - 2 on this phone for the moment
    await until(() => t.$('[data-testid="sync-rejected"]'));
    expect(t.$('[data-testid="sync-rejected"]').textContent).toContain("Only 1 nos in stock. If that's wrong, count the stock first.");
    expect(t.app.store.get().stock_moves).toHaveLength(0); // the refused move is gone
    await until(() => t.$('.kpi-value .qty').textContent === '1 nos'); // the server's quantity, 1, is shown
    expect(onServer.body.qty).toBe(1);
  });

  it('AC-25.15: editing an item sends the item but never counts a changed quantity as an edit', async () => {
    const api = serverWith();
    t = open({ api, hash: '#/inventory/item/it-cap/edit' });
    await until(() => t.app.store.get().items.length === 1 && chip(t)?.textContent.includes('All saved'));
    const calls = api.syncCalls.length;
    api.server.records.get('item:it-cap').body.qty = 4; // a quantity change from another phone arrives...
    api.server.records.get('item:it-cap').seq = 50;
    api.server.counters.seq = 50;
    await t.app.sync.flush();
    expect(api.syncCalls.slice(calls).flatMap((c) => c.ops)).toEqual([]); // ...and is not sent back as an edit
    expect(t.app.store.get().items[0].qty).toBe(4);
    const f = t.$('[data-form="inv-item"]');
    f.elements.sale.value = '500';
    submit(f);
    await until(() => api.server.records.get('item:it-cap').body.sale === 50000);
    expect(api.server.records.get('item:it-cap').body.qty).toBe(4);
  });

  it('AC-25.14: opening stock for a new item is sent as the item and then a move, in that order', async () => {
    const api = serverWith();
    t = open({ api, hash: '#/inventory/new' });
    await until(() => t.app.store.get().items.length === 1 && chip(t)?.textContent.includes('All saved'));
    const f = t.$('[data-form="inv-item"]');
    Object.entries({ name: 'Copper pipe 1/4 in', code: 'CU-14', unit: 'metre', sale: '260', cost: '', hsn: '', gst: '18', low: '20', opening: '38' }).forEach(([k, v]) => { f.elements[k].value = v; });
    submit(f);
    await until(() => [...api.server.records.values()].some((r) => r.kind === 'stock_move'));
    const sent = api.syncCalls.flatMap((c) => c.ops).filter((o) => o.id !== 'it-cap');
    expect(sent.map((o) => o.kind)).toEqual(['item', 'stock_move']);
    const made = [...api.server.records.values()].find((r) => r.kind === 'item' && r.body.code === 'CU-14');
    expect(made.body.qty).toBe(38);
  });

  it('AC-25.6: Check lists each row and its problems, Import saves the good ones, and a signal is needed', async () => {
    const api = serverWith();
    t = open({ api, hash: '#/inventory/import' });
    await until(() => chip(t)?.textContent.includes('All saved'));
    const file = (text) => new File([text], 'stock.csv', { type: 'text/csv' });
    const choose = async (f) => {
      const input = t.$('input[data-action="pick-inv-csv"]');
      Object.defineProperty(input, 'files', { value: [f], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => t.$('[data-testid="csv-new"]') || t.$('[data-testid="csv-error"]'));
    };
    await choose(file('code,name,unit,sale_price\nCAP-45,Capacitor 45 µF,nos,500\nTHM-1,Thermistor,nos,90\nBAD-1,Wall bracket,boxes,10\n,,nos,5\n'));
    expect(t.$('[data-testid="csv-new"]').textContent).toBe('1');
    expect(t.$('[data-testid="csv-update"]').textContent).toBe('1');
    expect(t.$('[data-testid="csv-problem"]').textContent).toBe('2');
    expect(t.$('[data-testid="csv-problems"]').textContent).toContain('Row 4: unit "boxes" isn\'t one of nos, kg, metre, litre, set, roll.');
    expect(t.$('[data-testid="csv-problems"]').textContent).toContain('Row 5: name is empty');
    expect(api.server.records.has('item:it-csv-3')).toBe(false); // a check saves nothing
    expect(t.$('[data-action="inv-do-import"]').textContent).toBe('Import 2 good rows');
    api.network.offline = true;
    t.click('[data-action="inv-do-import"]');
    await until(() => t.$('[data-testid="csv-error"]'));
    expect(t.$('[data-testid="csv-error"]').textContent).toContain('Importing needs a signal');
    expect(t.$('[data-action="inv-check-again"]')).toBeTruthy();
    api.network.offline = false;
    t.click('[data-action="inv-check-again"]');
    await until(() => t.$('[data-testid="csv-new"]'));
    t.click('[data-action="inv-do-import"]');
    await until(() => t.$('[data-testid="csv-result"]'));
    expect(t.$('[data-testid="csv-result"]').textContent).toContain('Imported from stock.csv: 1 new, 1 updated.');
    expect(t.$('[data-testid="csv-result"]').textContent).toContain('2 rows were skipped');
    expect(api.server.records.has('item:it-csv-3')).toBe(true);
    await until(() => t.app.store.get().items.length === 2); // the new item reaches this phone
    await choose(file('code,unit\nA,nos\n'));
    expect(t.$('[data-testid="csv-error"]').textContent).toContain('no "name" column');
  });
});

describe('US-25 Inventory per business: data saved by earlier versions', () => {
  it('AC-25.19: data saved by v0.6.0 (version 4) loads with no items, keeps its jobs, and nothing is put into stock from their parts text', () => {
    const v4 = { version: 4, settings: { business_name: 'Shree Cool AC', is_demo: false, mode: 'server', theme: 'system' }, customers: [], jobs: [{ id: 'j1', customer_name: 'A', parts: 'R32 gas 1 kg', lines: [], state: 'WORK_DONE' }], documents: [], messages: [], seq: {} };
    const s = migrate(v4);
    expect(s.version).toBe(5);
    expect(s.items).toEqual([]);
    expect(s.stock_moves).toEqual([]);
    expect(s.jobs[0].parts).toBe('R32 gas 1 kg');
    expect(partsOnJob(s, s.jobs[0])).toEqual([]);
  });

  it('AC-25.19: the demo business has sample stock labelled as such, which never syncs and has no CSV import', async () => {
    t = demo();
    expect(t.$('.page-head').textContent).toContain('Sample stock for the demo. It stays on this device.');
    expect(t.$('a[href="#/inventory/import"]')).toBeNull();
    expect(t.app.sync.status().active).toBe(false);
    t.go('#/inventory/import');
    expect(t.$('[data-action="inv-template"]')).toBeTruthy(); // the template can still be downloaded
  });
});
