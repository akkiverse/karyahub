import { describe, it, expect, afterEach } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { applyUnits, stockOf, unitsOf, historyOf, summary, listItems, validateItem } from '../src/domain/inventory.js';
import { lineFromItem, lineInUnit } from '../src/domain/bills.js';
import { splitCsv } from '../src/domain/csv.js';

let t;
afterEach(() => { t?.app.unmount(); t = null; applyUnits([]); });

const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const change = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const store = (x) => x.app.store.get();

const COIL = { id: 'un-coil', name: 'Coil', whole: true, stopped: false };
/** Wire counted by the coil, also sold by the metre (cut from a coil, 90 to a coil). */
const WIRE = {
  id: 'it-w', name: 'Life Line Plus Red', code: 'WIR-RD', unit: 'un-coil', sale: 92000, cost: 74000, hsn: '8544', gst: 18, low: 5, stopped: false, qty: 25,
  attrs: {}, sells: [{ unit: 'metre', sale: 1200, cost: 900, low: 20, cut_from: 'un-coil', cut_gives: 90, qty: 0 }],
};
const demo = (hash = '#/inventory') => {
  const x = setup({ hash, signedInAs: 'st-owner' });
  x.app.store.update((s) => { s.units = [COIL]; s.items.unshift(JSON.parse(JSON.stringify(WIRE))); });
  return x;
};
const wire = (x) => store(x).items.find((i) => i.id === 'it-w');
const openSheet = (x, kind) => { x.click(`[data-action="inv-sheet"][data-type="${kind}"]`); return x.$('[data-form="inv-sheet"]'); };

describe('US-36 An item sold in several units: the form', () => {
  it('AC-36.1: "Add a unit" adds a row with its own price, level and cut, keeping what was typed; a row can be taken off', () => {
    t = demo('#/inventory/new');
    const f = t.$('[data-form="inv-item"]');
    type(f.elements.name, 'Copper wire 1.5');
    type(f.elements.sale, '920');
    t.click('[data-action="inv-add-unit"]');
    expect(t.$('[data-form="inv-item"]').elements.name.value).toBe('Copper wire 1.5'); // typed values stay
    expect(t.$$('[data-sell]')).toHaveLength(1);
    t.click('[data-action="inv-add-unit"]');
    expect(t.$$('[data-sell]')).toHaveLength(2);
    t.click('[data-action="inv-remove-unit"][data-i="0"]');
    expect(t.$$('[data-sell]')).toHaveLength(1);
    expect(t.$('[data-testid="sells"]').textContent).toContain('Each unit has its own price and its own stock');
  });

  it('AC-36.1: the item is saved with each unit\'s price, level, cut and opening stock; the first unit stays the main one', () => {
    t = demo('#/inventory/new');
    const f = t.$('[data-form="inv-item"]');
    type(f.elements.name, 'Copper wire 1.5');
    type(f.elements.sale, '920');
    change(f.elements.unit, 'un-coil');
    type(f.elements.opening, '25');
    t.click('[data-action="inv-add-unit"]');
    const form = () => t.$('[data-form="inv-item"]'); // choosing a unit or a cut redraws the form, so look it up again
    change(form().elements.sell_unit_0, 'metre');
    type(form().elements.sell_sale_0, '12');
    type(form().elements.sell_cost_0, '9');
    type(form().elements.sell_low_0, '20');
    change(form().elements.sell_cut_from_0, 'un-coil');
    expect(t.$('[data-form="inv-item"]').elements.sell_cut_gives_0).toBeTruthy(); // choosing a cut shows its box at once
    type(t.$('[data-form="inv-item"]').elements.sell_opening_0, '500');
    t.click('[data-action="inv-add-unit"]'); // a re-draw keeps the first row
    expect(t.$('[data-form="inv-item"]').elements.sell_sale_0.value).toBe('12');
    t.click('[data-action="inv-remove-unit"][data-i="1"]');
    const h = t.$('[data-form="inv-item"]');
    expect(h.elements.sell_cut_gives_0).toBeTruthy(); // a cut asks how many it gives
    type(h.elements.sell_cut_gives_0, '90');
    submit(h);
    const made = store(t).items.find((i) => i.name === 'Copper wire 1.5');
    expect(made.unit).toBe('un-coil');
    expect(made.sells).toEqual([{ unit: 'metre', sale: 1200, cost: 900, low: 20, cut_from: 'un-coil', cut_gives: 90, qty: 500 }]);
    expect(made.qty).toBe(25);
    expect(stockOf(store(t), made, 'metre')).toBe(500);
  });

  it('AC-36.1: the form says what is wrong with a unit row: no unit, the same unit twice, no price, a cut from itself', () => {
    const state = { units: [COIL], item_fields: [], list_entries: [], items: [] };
    applyUnits(state.units);
    const base = { name: 'Wire', sale: '10', unit: 'un-coil', gst: '18' };
    const bad = (extra) => validateItem({ ...base, ...extra }, state).errors;
    expect(bad({ sell_unit_0: '', sell_sale_0: '1' }).sell_unit_0).toBe('Pick a unit.');
    expect(bad({ sell_unit_0: 'un-coil', sell_sale_0: '1' }).sell_unit_0).toBe("Coil is already one of this item's units.");
    expect(bad({ sell_unit_0: 'metre', sell_unit_1: 'metre', sell_sale_0: '1', sell_sale_1: '1' }).sell_unit_1).toContain('already one of');
    expect(bad({ sell_unit_0: 'metre', sell_sale_0: '' }).sell_sale_0).toBe('Type the price for this unit.');
    expect(bad({ sell_unit_0: 'metre', sell_sale_0: '1', sell_cut_from_0: 'metre', sell_cut_gives_0: '2' }).sell_cut_from_0).toBe("A unit can't be cut from itself.");
    expect(bad({ sell_unit_0: 'metre', sell_sale_0: '1', sell_cut_from_0: 'kg', sell_cut_gives_0: '2' }).sell_cut_from_0).toBe("Cut from one of this item's own units.");
    expect(bad({ sell_unit_0: 'metre', sell_sale_0: '1', sell_cut_from_0: 'un-coil' }).sell_cut_gives_0).toBe('Type a quantity.');
    expect(validateItem({ ...base, sell_unit_0: 'metre', sell_sale_0: '1' }, state).item.sells).toHaveLength(1);
  });

  it('AC-36.1: editing an item shows its units as rows and a price change leaves every unit\'s stock alone', () => {
    t = demo();
    t.app.navigate('#/inventory/item/it-w/edit');
    const f = t.$('[data-form="inv-item"]');
    expect(f.elements.sell_unit_0.value).toBe('metre');
    expect(f.elements.sell_sale_0.value).toBe('12');
    type(f.elements.sell_sale_0, '13');
    submit(f);
    expect(wire(t).sells[0]).toMatchObject({ sale: 1300, qty: 0 });
    expect(wire(t).qty).toBe(25);
  });
});

describe('US-36 Stock in each unit', () => {
  it('AC-36.2: the list and the item page show every unit\'s quantity with its own price', () => {
    t = demo();
    t.app.store.update((s) => { s.items.find((i) => i.id === 'it-w').sells[0].qty = 85; });
    const card = t.$('[data-item="it-w"]');
    expect(card.querySelector('[data-testid="qty"]').textContent).toBe('25 Coil');
    expect(card.querySelector('[data-testid="qty-extras"]').textContent).toBe('85 m');
    t.app.navigate('#/inventory/item/it-w');
    const kpi = t.$('[data-unit-kpi="metre"]');
    expect(kpi.textContent).toContain('85 m');
    expect(kpi.textContent).toContain('₹12 per m');
    expect(kpi.textContent).toContain('Low at 20 m');
    expect(kpi.textContent).toContain('1 Coil gives 90 m');
  });

  it('AC-36.2: stock in, stock out and a count choose the unit; each moves its own quantity', () => {
    t = demo('#/inventory/item/it-w');
    let f = openSheet(t, 'in');
    change(f.elements.unit, 'metre');
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.qty, '300');
    submit(f);
    expect(wire(t).sells[0].qty).toBe(300);
    expect(wire(t).qty).toBe(25);
    f = openSheet(t, 'out');
    change(f.elements.unit, 'metre');
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.qty, '40');
    f.querySelector('input[name="reason"][value="lost"]').checked = true;
    submit(f);
    expect(wire(t).sells[0].qty).toBe(260);
    f = openSheet(t, 'count');
    change(f.elements.unit, 'metre');
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.qty, '255');
    expect(t.$('[data-slot="inv-diff"]').textContent).toBe('This records −5 m as a count correction.');
    submit(f);
    expect(wire(t).sells[0].qty).toBe(255);
    expect(wire(t).qty).toBe(25);
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('In stock: 255 m');
  });

  it('AC-36.2: more than a unit holds is refused for that unit, in its own words', () => {
    t = demo('#/inventory/item/it-w');
    let f = openSheet(t, 'out');
    change(f.elements.unit, 'metre');
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.qty, '10');
    f.querySelector('input[name="reason"][value="lost"]').checked = true;
    submit(f);
    expect(t.$('#err-qty').textContent).toBe("Only 0 m in stock. If that's wrong, count the stock first.");
  });

  it('AC-36.2: a unit is marked Low only when it has a level set, and the Low chip counts an item with any unit low', () => {
    t = demo('#/inventory');
    t.app.store.update((s) => { s.items.find((i) => i.id === 'it-w').sells[0].qty = 15; });
    const state = store(t);
    const ids = (filter) => listItems(state, { filter }).map((i) => i.id);
    expect(ids('low')).toContain('it-w'); // 15 metre is at or below its level of 20
    t.app.store.update((s) => { s.items.find((i) => i.id === 'it-w').sells[0].qty = 0; s.items.find((i) => i.id === 'it-w').sells[0].low = null; });
    expect(listItems(store(t), { filter: 'out' }).map((i) => i.id)).not.toContain('it-w'); // 0 loose metres with no level is not "Out"
    const before = summary(store(t));
    expect(before.all).toBeGreaterThan(0);
  });

  it('AC-36.4: parts for a job are taken in the main unit', () => {
    t = demo('#/inventory');
    expect(unitsOf(wire(t)).map((u) => u.unit)).toEqual(['un-coil', 'metre']);
    expect(wire(t).unit).toBe('un-coil'); // takePart reads the item's unit: no unit choice is offered on a job
  });
});

describe('US-37 Cut', () => {
  it('AC-37.1: the Cut sheet fills the usual metres; cutting a coil lowers the coils, raises the metres, and says so', () => {
    t = demo('#/inventory/item/it-w');
    const f = openSheet(t, 'cut');
    expect(f.elements.from.value).toBe('un-coil');
    expect(f.elements.to.value).toBe('metre');
    expect(f.elements.gives.value).toBe('90'); // the unit's usual cut
    expect(f.elements.count.value).toBe('1');
    expect(t.$('[data-testid="cut-gives"]').closest('label').textContent).toContain('usually 90 m');
    submit(f);
    expect(wire(t).qty).toBe(24);
    expect(wire(t).sells[0].qty).toBe(90);
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('Cut 1 Coil of Life Line Plus Red into 90 m. In stock: 24 Coil and 90 m.');
    const move = store(t).stock_moves.find((m) => m.kind === 'cut');
    expect(move).toMatchObject({ unit: 'un-coil', qty: -1, to_unit: 'metre', gave: 90, after: 24, to_after: 90 });
  });

  it('AC-37.2: the person can change the metres a coil gives (88, not 90), and the unit keeps its usual 90', () => {
    t = demo('#/inventory/item/it-w');
    const f = openSheet(t, 'cut');
    type(f.elements.gives, '88');
    submit(f);
    expect(wire(t).sells[0].qty).toBe(88);
    expect(wire(t).sells[0].cut_gives).toBe(90);
  });

  it('AC-37.1: a cut is refused when there is not enough, or the numbers are wrong, and nothing moves', () => {
    t = demo('#/inventory/item/it-w');
    let f = openSheet(t, 'cut');
    type(f.elements.count, '30');
    submit(f);
    expect(t.$('#err-count').textContent).toBe("Only 25 Coil in stock. If that's wrong, count the stock first.");
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.count, '1.5');
    submit(f);
    expect(t.$('#err-count').textContent).toBe('Use a whole number for Coil.');
    f = t.$('[data-form="inv-sheet"]');
    type(f.elements.count, '1');
    type(f.elements.gives, '0');
    submit(f);
    expect(t.$('#err-gives').textContent).toBe('A cut must give more than 0.');
    expect(wire(t).qty).toBe(25);
    expect(wire(t).sells[0].qty).toBe(0);
  });

  it('AC-37.3: the history of each unit shows the cut, in both units, with who did it; a move cannot be changed', () => {
    t = demo('#/inventory/item/it-w');
    submit(openSheet(t, 'cut'));
    expect(t.$$('[data-testid="inv-history"] .move')).toHaveLength(1);
    expect(t.$('[data-testid="inv-history"]').textContent).toContain('Cut into 90 m');
    expect(t.$('[data-testid="inv-history"]').textContent).toContain('−1 Coil');
    t.click('[data-action="inv-hist-unit"][data-unit="metre"]');
    expect(t.$('[data-testid="inv-history"]').textContent).toContain('Cut from Coil');
    expect(t.$('[data-testid="inv-history"]').textContent).toContain('+90 m');
    const rows = historyOf(store(t), wire(t), 'metre');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 90, shown_after: 90 });
    expect(t.$('[data-testid="inv-history"] .move').textContent).toContain('Akash'); // who
  });

  it('AC-37.1: an item with one unit has no Cut button', () => {
    t = demo('#/inventory/item/it-cap-45');
    expect(t.$('[data-testid="cut-button"]')).toBeNull();
    t.app.navigate('#/inventory/item/it-w');
    expect(t.$('[data-testid="cut-button"]')).toBeTruthy();
  });

  it('AC-37.1: a person who may only take parts has no Cut button', () => {
    t = setup({ hash: '#/inventory/item/it-cap-45', signedInAs: 'st-coord' });
    t.app.store.update((s) => { s.units = [COIL]; s.items.unshift(JSON.parse(JSON.stringify(WIRE))); });
    t.app.navigate('#/inventory/item/it-w');
    expect(t.$('[data-testid="cut-button"]')).toBeTruthy(); // the coordinator manages inventory: the sheet and rule are the same as the owner's
  });
});

describe('US-36 Bills sell in a unit', () => {
  it('AC-36.3: a bill line takes the item\'s main unit; choosing another unit changes its name and its price', () => {
    const state = { units: [COIL], item_fields: [], list_entries: [], items: [JSON.parse(JSON.stringify(WIRE))] };
    const line = lineFromItem(state.items[0], null, state);
    expect(line).toMatchObject({ unit_id: 'un-coil', unit: 'Coil', rate: 92000 });
    const metres = lineInUnit(state, { ...line, qty: 5, last_price: true }, 'metre');
    expect(metres).toMatchObject({ unit_id: 'metre', unit: 'metre', rate: 1200, qty: 5, last_price: false });
    expect(lineInUnit(state, line, 'nope')).toBe(line); // an unknown unit changes nothing
  });

  it('AC-36.3: the bill editor offers the unit when the item has several, and picking one changes the rate', async () => {
    t = demo('#/bills/new');
    const search = () => t.$('[data-item-search]');
    type(search(), 'Life Line');
    t.click('[data-action="bill-add-item"]');
    const unit = t.$('[data-testid="line-unit"]');
    expect(unit).toBeTruthy();
    expect([...unit.options].map((o) => o.textContent)).toEqual(['Coil', 'metre']);
    expect(t.$('[data-k="r0"]').value).toBe('920');
    change(unit, 'metre');
    await until(() => t.$('[data-k="r0"]').value === '12');
    expect(t.$('[data-testid="line-unit"]').value).toBe('metre');
  });

  it('AC-36.3: an item with one unit shows no unit menu on its bill line', () => {
    t = demo('#/bills/new');
    type(t.$('[data-item-search]'), 'Capacitor 45');
    t.click('[data-action="bill-add-item"]');
    expect(t.$('[data-testid="line-unit"]')).toBeNull();
  });
});

describe('US-36 The CSV file: one row for each unit', () => {
  it('AC-36.5: the template ends with the cut columns, and the import screen explains one row per unit', async () => {
    t = open({ hash: '#/inventory/import' });
    await until(() => t.$('[data-action="inv-template"]'));
    expect(t.$('.start-step p').textContent).toContain('cut_from');
    expect(t.$('.start-step p').textContent).toContain('one row for each');
  });

  it('AC-36.5: unit rows are counted apart and can be imported with the good rows', async () => {
    const api = fakeApi();
    api.inventoryImport = async ({ check }) => ({
      checked: check, file: 'wire.csv', counts: { new: 1, update: 0, same: 0, problem: 0, unit: 2 },
      rows: [
        { row: 2, status: 'new', problems: [], notes: [], code: 'W1', name: 'Wire', unit: 'Coil', sale_price: '920', opening_stock: '25', details: '' },
        { row: 3, status: 'unit', problems: [], notes: [], code: 'W1', name: 'Wire', unit: 'Metre', sale_price: '12', opening_stock: '500', details: '' },
        { row: 4, status: 'unit', problems: [], notes: [], code: 'W1', name: 'Wire', unit: 'Box', sale_price: '4400', opening_stock: '2', details: '' },
      ],
      adds: { units: ['Coil'], lists: [] }, unknown_columns: [], ...(check ? {} : { imported: { added: 1, updated: 0, skipped: 0 } }),
    });
    t = open({ api, hash: '#/inventory/import' });
    await until(() => t.$('input[data-action="pick-inv-csv"]'));
    const input = t.$('input[data-action="pick-inv-csv"]');
    Object.defineProperty(input, 'files', { value: [new File(['code,name\nW1,Wire'], 'wire.csv')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => t.$('[data-testid="csv-unit"]'));
    expect(t.$('[data-testid="csv-unit"]').textContent).toBe('2');
    expect(t.$('.import-table').textContent).toContain('Another unit');
    expect(t.$('[data-action="inv-do-import"]').textContent).toBe('Import 3 good rows');
  });

  it('AC-36.5: a file cut into parts is never cut in the middle of an item\'s unit rows by the row count alone (parts are whole rows)', () => {
    const rows = Array.from({ length: 700 }, (_, i) => `W${i % 350},Wire ${i % 350},${i < 350 ? 'Coil' : 'Metre'},10`);
    const parts = splitCsv(['code,name,unit,sale_price', ...rows].join('\n'), 500);
    expect(parts.map((p) => p.rows)).toEqual([500, 200]);
  });
});

// ---------- a real business: the server and a weak signal ----------
function open({ api = fakeApi(), me = meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, REAL_BUSINESS), hash = '#/inventory' } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20], api, me });
  return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)], go: (h) => app.navigate(h), click: (s) => root.querySelector(s).click() };
}
const chip = (x) => x.$('[data-testid="sync-status"]');

describe('US-37 A real business: a cut is one move that the server applies', () => {
  function seeded() {
    const api = fakeApi();
    api.server.records.set('unit:un-coil', { kind: 'unit', id: 'un-coil', number: '', seq: 1, body: { ...COIL } });
    api.server.records.set('item:it-w', { kind: 'item', id: 'it-w', number: '', seq: 2, body: JSON.parse(JSON.stringify(WIRE)) });
    api.server.counters.seq = 2;
    return api;
  }
  const moveOps = (api) => api.syncCalls.flatMap((c) => c.ops).filter((o) => o.kind === 'stock_move');

  it('AC-37.1: with no signal a cut shows at once as waiting; when the signal returns it is sent once and the server\'s numbers replace it', async () => {
    const api = seeded();
    t = open({ api, hash: '#/inventory/item/it-w' });
    await until(() => store(t).items.length === 1 && chip(t)?.textContent.includes('All saved'));
    api.network.offline = true;
    submit(openSheet(t, 'cut'));
    expect(stockOf(store(t), wire(t))).toBe(24); // shown at once
    expect(stockOf(store(t), wire(t), 'metre')).toBe(90);
    await until(() => chip(t)?.textContent.includes('waiting, offline'));
    expect(api.server.records.get('item:it-w').body.qty).toBe(25); // the server has not heard yet
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => chip(t)?.textContent.includes('All saved'));
    const onServer = api.server.records.get('item:it-w').body;
    expect(onServer.qty).toBe(24);
    expect(onServer.sells[0].qty).toBe(90);
    expect(stockOf(store(t), wire(t))).toBe(24); // the server's 24, not 23
    expect(stockOf(store(t), wire(t), 'metre')).toBe(90);
    const cuts = moveOps(api).filter((o) => o.body.kind === 'cut');
    expect(new Set(cuts.map((o) => o.op_id)).size).toBe(1);
    expect(cuts[0].body).toMatchObject({ unit: 'un-coil', to_unit: 'metre', count: 1, gives: 90 });
  });

  it('AC-37.1: the server refuses a cut another phone made impossible, and this phone takes it back', async () => {
    const api = seeded();
    t = open({ api, hash: '#/inventory/item/it-w' });
    await until(() => store(t).items.length === 1 && chip(t)?.textContent.includes('All saved'));
    const onServer = api.server.records.get('item:it-w');
    onServer.body.qty = 0; // another phone used the last coils; this phone still shows 25
    onServer.seq = 10;
    api.server.counters.seq = 10;
    submit(openSheet(t, 'cut'));
    await until(() => chip(t)?.textContent.includes('not saved') || t.$('[data-testid="sync-rejected"]'));
    expect(t.$('[data-testid="sync-rejected"]').textContent).toContain('Only 0 Coil in stock');
  });

  it('AC-36.1: editing a price keeps every unit\'s quantity, and sends no quantity as an edit', async () => {
    const api = seeded();
    api.server.records.get('item:it-w').body.sells[0].qty = 85;
    t = open({ api, hash: '#/inventory/item/it-w/edit' });
    await until(() => store(t).items.length === 1 && chip(t)?.textContent.includes('All saved'));
    const f = t.$('[data-form="inv-item"]');
    type(f.elements.sell_sale_0, '13');
    submit(f);
    await until(() => chip(t)?.textContent.includes('All saved'));
    const sent = api.syncCalls.flatMap((c) => c.ops).filter((o) => o.kind === 'item');
    expect(sent).toHaveLength(1);
    expect(api.server.records.get('item:it-w').body.sells[0]).toMatchObject({ sale: 1300, qty: 85 });
  });
});
