import { describe, it, expect, afterEach } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { migrate } from '../src/migrations.js';
import { csvTemplate, csvColumns } from '../src/views/inventory.js';
import { splitCsv, recordsOf } from '../src/domain/csv.js';
import { applyUnits, UNITS, WHOLE_UNITS, parseQty, qtyText } from '../src/domain/inventory.js';
import { lineFromItem } from '../src/domain/bills.js';
import { billName, detailsLine, fnorm } from '../src/domain/fields.js';
import { createStore, STORAGE_WARN_AT } from '../src/store.js';

let t;
afterEach(() => { t?.app.unmount(); t = null; applyUnits([]); });

const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const change = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const tick = (el, on = true) => { el.checked = on; };

// ---------- a demo business: the screens and the rules, applied on the device ----------
const demo = (hash = '#/inventory/fields') => setup({ hash, signedInAs: 'st-owner' });
const store = (x) => x.app.store.get();
const nameOf = (x, list, id) => store(x)[list].find((e) => e.id === id).name;

function addField(x, name, kind = 'list', flags = {}) {
  const form = x.$('[data-form="inv-field"]');
  type(form.elements.name, name);
  change(form.elements.type, kind);
  for (const k of ['required', 'in_list', 'in_filter', 'on_bills']) tick(form.elements[k], Boolean(flags[k]));
  submit(form);
  return store(x).item_fields.find((f) => f.name === name);
}
function addEntry(x, field, name) {
  const form = x.$(`[data-form="inv-entry"][data-field="${field.id}"]`);
  type(form.elements.name, name);
  submit(form);
}

describe('US-32 Your own item details: fields', () => {
  it('AC-32.1: the owner adds a detail at any time and it is on the screen with its kind and where it shows', () => {
    t = demo();
    expect(t.$('h1').textContent).toBe('Item details and lists');
    expect(t.$('[data-testid="fields-table"]')).toBeNull(); // none yet
    const brand = addField(t, 'Brand', 'list', { in_list: true, in_filter: true, on_bills: true });
    expect(brand).toMatchObject({ type: 'list', required: false, in_list: true, in_filter: true, on_bills: true, stopped: false });
    expect(t.$('[data-testid="fields-table"]').textContent).toContain('Pick-list · In list · Filter · On bills');
    expect(t.$('[data-testid="fields-notice"]').textContent).toContain('Added Brand');
    expect(t.$(`[data-list="${brand.id}"]`)).toBeTruthy(); // a list to fill appears for a pick-list
    const size = addField(t, 'Size', 'text');
    expect(size.order).toBeGreaterThan(brand.order); // shown in the order they were made
  });

  it('AC-32.1: a name used twice, or one the CSV file already has, is refused in plain words and the form keeps what was typed', () => {
    t = demo();
    addField(t, 'Brand');
    addField(t, 'brand ');
    expect(t.$('#err-name').textContent).toBe('You already have a field called brand.');
    expect(t.$('[data-form="inv-field"] input[name="name"]').value).toBe('brand ');
    addField(t, 'Unit', 'text');
    expect(t.$('#err-name').textContent).toContain('already a standard column');
    expect(store(t).item_fields).toHaveLength(1);
  });

  it('AC-32.1: a business has up to 15 details in use; stopping one makes room', () => {
    t = demo();
    for (let i = 0; i < 15; i += 1) addField(t, `Detail ${i}`, 'text');
    addField(t, 'One more', 'text');
    expect(t.$('#err-name').textContent).toContain('up to 15 item fields');
    t.click('[data-action="inv-field-stop"][data-id]'); // the first one
    addField(t, 'One more', 'text');
    expect(store(t).item_fields.filter((f) => !f.stopped)).toHaveLength(15);
  });

  it('AC-32.1: a detail can be renamed or stopped; stopping keeps its values and Use again brings it back', () => {
    t = demo();
    const brand = addField(t, 'Brand');
    t.click(`[data-action="inv-field-edit"][data-id="${brand.id}"]`);
    const form = t.$('[data-form="inv-field"]');
    type(form.elements.name, 'Make');
    submit(form);
    expect(store(t).item_fields[0].name).toBe('Make');
    t.click(`[data-action="inv-field-stop"][data-id="${brand.id}"]`);
    expect(store(t).item_fields[0].stopped).toBe(true);
    expect(t.$('[data-testid="fields-notice"]').textContent).toContain('stay on the items');
    t.click(`[data-action="inv-field-stop"][data-id="${brand.id}"]`);
    expect(store(t).item_fields[0].stopped).toBe(false);
  });

  it('AC-32.1: pressing Change brings the form for that detail into view and puts the cursor in its name box', () => {
    t = demo();
    const brand = addField(t, 'Brand');
    const scrolled = [];
    window.HTMLElement.prototype.scrollIntoView = function scroll() { scrolled.push(this); };
    t.click(`[data-action="inv-field-edit"][data-id="${brand.id}"]`);
    const name = t.$('[data-form="inv-field"] input[name="name"]');
    expect(name.value).toBe('Brand');
    expect(document.activeElement).toBe(name);
    expect(scrolled).toContain(name);
    expect(t.$('[data-form="inv-field"] h3').textContent).toBe('Change Brand');
  });

  it('AC-32.2: text and number swap only when every value fits; a pick-list is locked', () => {
    t = demo();
    const size = addField(t, 'Size', 'text');
    const brand = addField(t, 'Brand', 'list');
    t.app.store.update((s) => { s.items[0].attrs = { [size.id]: '0.75 sq mm' }; });
    t.click(`[data-action="inv-field-edit"][data-id="${size.id}"]`);
    let form = t.$('[data-form="inv-field"]');
    change(form.elements.type, 'number');
    submit(form);
    expect(t.$('#err-type').textContent).toContain("These values aren't numbers: 0.75 sq mm");
    t.app.store.update((s) => { s.items[0].attrs = { [size.id]: '0.75' }; });
    submit(t.$('[data-form="inv-field"]'));
    expect(store(t).item_fields.find((f) => f.id === size.id).type).toBe('number');
    t.click(`[data-action="inv-field-edit"][data-id="${brand.id}"]`);
    form = t.$('[data-form="inv-field"]');
    change(form.elements.type, 'text');
    submit(form);
    expect(t.$('#err-type').textContent).toContain("can't change into another kind of field");
  });

  it('AC-32.1: a business with no details yet is offered a short starter set for its kind of business, added with one tap', () => {
    t = demo();
    expect(t.$('[data-testid="starters"]').textContent).toContain('Brand (pick-list)');
    t.click('[data-action="inv-field-starters"]');
    expect(store(t).item_fields.map((f) => f.name)).toEqual(['Brand', 'Size']); // the "other" starter set
    expect(t.$('[data-testid="starters"]')).toBeNull();
    expect(store(t).item_fields[0]).toMatchObject({ in_list: true, in_filter: true });
  });
});

describe('US-32 Your own item details: lists', () => {
  it('AC-32.3: entries are added to a pick-list, renamed and stopped; a name already in the list is refused', () => {
    t = demo();
    const brand = addField(t, 'Brand');
    addEntry(t, brand, 'Havells');
    addEntry(t, brand, 'Polycab');
    addEntry(t, brand, 'havells');
    expect(t.$(`[data-list="${brand.id}"] .field-error`).textContent).toBe('Havells is already in this list.');
    expect([...t.$$(`[data-testid="entries-${brand.id}"] li span:first-child`)].map((n) => n.textContent.trim())).toEqual(['Havells', 'Polycab']);
    const poly = store(t).list_entries.find((e) => e.name === 'Polycab');
    t.click(`[data-action="inv-entry-rename"][data-id="${poly.id}"]`);
    const form = t.$('[data-form="inv-entry-rename"]');
    type(form.elements.name, 'Polycab Cables');
    submit(form);
    expect(nameOf(t, 'list_entries', poly.id)).toBe('Polycab Cables');
    t.click(`[data-action="inv-entry-stop"][data-id="${poly.id}"]`);
    expect(store(t).list_entries.find((e) => e.id === poly.id).stopped).toBe(true);
  });

  it('AC-32.3: renaming an entry changes the words on every item that points to it, because items hold the entry and not its name', () => {
    t = demo('#/inventory');
    const brand = { id: 'fd-1', name: 'Brand', type: 'list', in_list: true, order: 1, stopped: false };
    t.app.store.update((s) => {
      s.item_fields = [brand];
      s.list_entries = [{ id: 'le-1', field_id: 'fd-1', name: 'Havels', stopped: false }];
      s.items[0].attrs = { 'fd-1': 'le-1' };
      s.items[1].attrs = { 'fd-1': 'le-1' };
    });
    expect(t.$$('[data-testid="card-details"]').map((n) => n.textContent)).toEqual(['Brand: Havels', 'Brand: Havels']);
    t.app.store.update((s) => { s.list_entries[0].name = 'Havells'; });
    expect(t.$$('[data-testid="card-details"]').map((n) => n.textContent)).toEqual(['Brand: Havells', 'Brand: Havells']);
  });

  it('AC-32.3: a merged duplicate (the server made it an alias) is not shown and an item that still points to it reads the first one', () => {
    t = demo('#/inventory/fields');
    addField(t, 'Brand');
    t.app.store.update((s) => {
      s.list_entries = [
        { id: 'le-1', field_id: s.item_fields[0].id, name: 'Havells', stopped: false },
        { id: 'le-2', field_id: s.item_fields[0].id, name: 'havells', stopped: true, alias_of: 'le-1' },
      ];
      s.items[0].attrs = { [s.item_fields[0].id]: 'le-2' };
    });
    expect(t.$$('[data-entry]')).toHaveLength(1);
    expect(detailsLine(store(t), store(t).items[0])).toBe('Brand: Havells');
  });

  it('AC-32.7: staff who manage stock add entries and units but cannot change the details; a technician sees no item screens', () => {
    t = setup({ hash: '#/inventory/fields', signedInAs: 'st-coord' });
    expect(t.$('[data-form="inv-field"]')).toBeNull();
    expect(t.$('.notice').textContent).toContain('Only the owner changes which details items have');
    expect(t.$('[data-form="inv-unit"]')).toBeTruthy();
    t.app.store.update((s) => { s.item_fields = [{ id: 'fd-1', name: 'Brand', type: 'list', stopped: false, order: 1 }]; });
    expect(t.$('[data-form="inv-entry"][data-field="fd-1"]')).toBeTruthy();
    t.app.unmount();
    t = setup({ hash: '#/inventory/fields', signedInAs: 'st-santosh' });
    expect(t.$('[data-form="inv-entry"]')).toBeNull();
    expect(t.$('h1').textContent).not.toBe('Item details and lists'); // no inventory access: the screen is closed
  });
});

describe('US-32 Your own item details: on an item', () => {
  function withBrand(x) {
    const brand = addField(x, 'Brand', 'list', { in_list: true, in_filter: true, on_bills: true });
    addEntry(x, brand, 'Havells');
    addEntry(x, brand, 'Polycab');
    addField(x, 'Size', 'text', { in_list: true });
    return brand;
  }

  it('AC-32.4: the item form asks for the details; a brand picked from the list is kept by id, and one typed new is added to the list', () => {
    t = demo();
    const brand = withBrand(t);
    t.app.navigate('#/inventory/new');
    const form = t.$('[data-form="inv-item"]');
    expect(t.$(`#dl-${brand.id}`).querySelectorAll('option')).toHaveLength(2);
    type(form.elements.name, 'Life Line Plus Red');
    type(form.elements.sale, '920');
    type(form.elements[`attr:${brand.id}`], 'havells');
    const size = store(t).item_fields.find((f) => f.name === 'Size');
    type(form.elements[`attr:${size.id}`], '0.75 sq mm');
    submit(form);
    const made = store(t).items.find((i) => i.name === 'Life Line Plus Red');
    expect(made.attrs).toEqual({ [brand.id]: store(t).list_entries.find((e) => e.name === 'Havells').id, [size.id]: '0.75 sq mm' });
    expect(store(t).list_entries).toHaveLength(2); // Havells matched, nothing new

    t.app.navigate('#/inventory/new');
    const form2 = t.$('[data-form="inv-item"]');
    type(form2.elements.name, 'Anchor switch');
    type(form2.elements.sale, '45');
    type(form2.elements[`attr:${brand.id}`], '  Anchor ');
    submit(form2);
    const switchItem = store(t).items.find((i) => i.name === 'Anchor switch');
    const anchor = store(t).list_entries.find((e) => e.name === 'Anchor');
    expect(anchor).toMatchObject({ field_id: brand.id, stopped: false });
    expect(switchItem.attrs[brand.id]).toBe(anchor.id);
  });

  it('AC-32.4: a required detail left empty, or a number field with words, is caught on the form', () => {
    t = demo();
    const brand = addField(t, 'Brand', 'list', { required: true });
    const weight = addField(t, 'Weight', 'number');
    t.app.navigate('#/inventory/new');
    const form = t.$('[data-form="inv-item"]');
    type(form.elements.name, 'Thing');
    type(form.elements.sale, '10');
    type(form.elements[`attr:${weight.id}`], 'heavy');
    submit(form);
    expect(t.$(`#err-attr\\:${brand.id}`).textContent).toBe('Give the Brand.');
    expect(t.$(`#err-attr\\:${weight.id}`).textContent).toBe('Weight must be a number.');
    expect(store(t).items.find((i) => i.name === 'Thing')).toBeUndefined();
  });

  it('AC-32.5: the list shows the chosen details, finds items by what they hold, and narrows by a brand', () => {
    t = demo('#/inventory');
    t.app.store.update((s) => {
      s.item_fields = [
        { id: 'fd-b', name: 'Brand', type: 'list', in_list: true, in_filter: true, order: 1, stopped: false },
        { id: 'fd-s', name: 'Size', type: 'text', in_list: false, order: 2, stopped: false },
      ];
      s.list_entries = [
        { id: 'le-h', field_id: 'fd-b', name: 'Havells', stopped: false },
        { id: 'le-p', field_id: 'fd-b', name: 'Polycab', stopped: false },
      ];
      s.items[0].attrs = { 'fd-b': 'le-h', 'fd-s': '0.75 sq mm' };
      s.items[1].attrs = { 'fd-b': 'le-p' };
    });
    expect(t.$$('[data-testid="card-details"]')).toHaveLength(2);
    expect(t.$('.inv-table-wrap thead').textContent).toContain('Brand');
    type(t.$('#inv-q'), 'havells');
    expect(t.$$('.inv-card')).toHaveLength(1);
    type(t.$('#inv-q'), '0.75');
    expect(t.$$('.inv-card')).toHaveLength(1); // found by a detail that is not on the card
    type(t.$('#inv-q'), '');
    expect(t.$$('.inv-card').length).toBeGreaterThan(2);
    change(t.$('[data-inv-filter="fd-b"]'), 'le-p');
    expect(t.$$('.inv-card')).toHaveLength(1);
    change(t.$('[data-inv-filter="fd-b"]'), '');
    expect(t.$$('.inv-card').length).toBeGreaterThan(2);
  });

  it('AC-32.5: the item page shows all its details', () => {
    t = demo('#/inventory');
    t.app.store.update((s) => {
      s.item_fields = [{ id: 'fd-b', name: 'Brand', type: 'list', order: 1, stopped: false }, { id: 'fd-s', name: 'Size', type: 'text', order: 2, stopped: false }];
      s.list_entries = [{ id: 'le-h', field_id: 'fd-b', name: 'Havells', stopped: false }];
      s.items[0].attrs = { 'fd-b': 'le-h', 'fd-s': '0.75 sq mm' };
    });
    t.app.navigate(`#/inventory/item/${store(t).items[0].id}`);
    expect(t.$('[data-testid="item-details"]').textContent).toBe('Brand: Havells · Size: 0.75 sq mm');
  });

  it('AC-32.6: only the details marked "print on bills" join the name on a bill line', () => {
    const state = {
      item_fields: [
        { id: 'fd-b', name: 'Brand', type: 'list', on_bills: true, order: 1, stopped: false },
        { id: 'fd-c', name: 'Colour', type: 'list', on_bills: false, order: 2, stopped: false },
        { id: 'fd-s', name: 'Size', type: 'text', on_bills: true, order: 3, stopped: false },
      ],
      list_entries: [{ id: 'le-h', field_id: 'fd-b', name: 'Havells' }, { id: 'le-r', field_id: 'fd-c', name: 'Red' }],
      units: [],
    };
    const item = { id: 'it-1', name: 'Life Line Plus', unit: 'nos', sale: 92000, gst: 18, attrs: { 'fd-b': 'le-h', 'fd-c': 'le-r', 'fd-s': '0.75 sq mm' } };
    expect(billName(state, item)).toBe('Life Line Plus (Havells, 0.75 sq mm)');
    expect(lineFromItem(item, null, state).description).toBe('Life Line Plus (Havells, 0.75 sq mm)');
    expect(lineFromItem(item).description).toBe('Life Line Plus'); // without the copy: as before
    expect(billName({ ...state, item_fields: state.item_fields.map((f) => ({ ...f, on_bills: false })) }, item)).toBe('Life Line Plus');
  });
});

describe('US-33 Your own units', () => {
  it('AC-33.1: a unit is added with a name and whether it takes only whole numbers; a name already used is refused', () => {
    t = demo();
    const form = t.$('[data-form="inv-unit"]');
    type(form.elements.name, 'Coil');
    tick(form.elements.whole, true);
    submit(form);
    expect(store(t).units).toEqual([expect.objectContaining({ name: 'Coil', whole: true, stopped: false })]);
    const again = t.$('[data-form="inv-unit"]');
    type(again.elements.name, 'coil');
    submit(again);
    expect(t.$('[data-testid="units-panel"] .field-error').textContent).toBe('coil is already one of your units.');
    type(t.$('[data-form="inv-unit"]').elements.name, 'Metre');
    submit(t.$('[data-form="inv-unit"]'));
    expect(t.$('[data-testid="units-panel"] .field-error').textContent).toContain('already one of your units'); // a built-in one
    type(t.$('[data-form="inv-unit"]').elements.name, '500');
    submit(t.$('[data-form="inv-unit"]'));
    expect(t.$('[data-testid="units-panel"] .field-error').textContent).toContain('A unit is a word');
  });

  it('AC-33.2: the item form can make a new unit on the spot; the item, its stock and its messages use that name and its whole-number rule', () => {
    t = demo('#/inventory/new');
    const form = t.$('[data-form="inv-item"]');
    expect(t.$('[data-slot="new-unit"]').hidden).toBe(true);
    change(form.elements.unit, '__new__');
    expect(t.$('[data-slot="new-unit"]').hidden).toBe(false);
    type(form.elements.name, 'Life Line Plus Red');
    type(form.elements.sale, '920');
    type(form.elements.new_unit, 'Coil');
    tick(form.elements.new_unit_whole, true);
    type(form.elements.opening, '2.5');
    submit(form);
    expect(t.$('#err-opening').textContent).toBe('Use a whole number for Coil.');
    type(t.$('[data-form="inv-item"]').elements.opening, '25');
    submit(t.$('[data-form="inv-item"]'));
    const made = store(t).items.find((i) => i.name === 'Life Line Plus Red');
    const coil = store(t).units.find((u) => u.name === 'Coil');
    expect(made.unit).toBe(coil.id);
    expect(t.$('.inv-card [data-testid="qty"]')).toBeTruthy();
    expect(t.$('[data-testid="inv-notice"]').textContent).toContain('25 Coil in stock');
    expect(UNITS[coil.id]).toBe('Coil');
    expect(WHOLE_UNITS.has(coil.id)).toBe(true);
    expect(parseQty('1.5', coil.id).ok).toBe(false);
    expect(qtyText(25, coil.id)).toBe('25 Coil');
  });

  it('AC-33.3: a stopped unit is not offered for new items but stays on the items that have it', () => {
    t = demo('#/inventory/fields');
    const form = t.$('[data-form="inv-unit"]');
    type(form.elements.name, 'Coil');
    submit(form);
    const coil = store(t).units[0];
    t.app.store.update((s) => { s.items[0].unit = coil.id; });
    t.click(`[data-action="inv-unit-stop"][data-id="${coil.id}"]`);
    expect(store(t).units[0].stopped).toBe(true);
    t.app.navigate('#/inventory/new');
    expect([...t.$('select[name="unit"]').options].map((o) => o.textContent)).not.toContain('Coil');
    t.app.navigate(`#/inventory/item/${store(t).items[0].id}/edit`);
    expect([...t.$('select[name="unit"]').options].map((o) => o.textContent)).toContain('Coil'); // the item that has it keeps it
  });
});

describe('US-34 The CSV file has the business\'s own columns', () => {
  const state = {
    item_fields: [
      { id: 'fd-b', name: 'Brand', type: 'list', order: 1, stopped: false },
      { id: 'fd-m', name: 'Material type', type: 'list', order: 2, stopped: false },
      { id: 'fd-s', name: 'Size', type: 'number', order: 3, stopped: false },
      { id: 'fd-x', name: 'Old', type: 'text', order: 4, stopped: true },
    ],
    list_entries: [{ id: 'le-1', field_id: 'fd-b', name: 'Havells' }],
    units: [],
  };

  it('AC-34.1: the template has a column for each detail in use, named as it is, with one example row', () => {
    expect(csvColumns(state)).toEqual(['code', 'name', 'Brand', 'Material type', 'Size', 'unit', 'sale_price', 'cost_price', 'hsn', 'gst_rate', 'low_stock_at', 'opening_stock']);
    const rows = csvTemplate(state).trimEnd().split('\n');
    expect(rows[0]).toBe('code,name,Brand,Material type,Size,unit,sale_price,cost_price,hsn,gst_rate,low_stock_at,opening_stock');
    expect(rows[1]).toBe('CAP-35,Capacitor 35 µF,Havells,Example,1,nos,380,170,8532,18,5,10');
    expect(csvTemplate({ item_fields: [] }).split('\n')[0]).toBe('code,name,unit,sale_price,cost_price,hsn,gst_rate,low_stock_at,opening_stock'); // as before
  });

  it('AC-34.1: a detail called with a comma or quote in its name is written safely', () => {
    const odd = { item_fields: [{ id: 'f', name: 'Make, model', type: 'text', order: 1, stopped: false }], list_entries: [], units: [] };
    expect(csvTemplate(odd).split('\n')[0]).toContain('"Make, model"');
  });

  it('AC-34.1: the import screen names the columns, and the template download is the same', async () => {
    t = open({ hash: '#/inventory/import' });
    await until(() => t.$('[data-action="inv-template"]'));
    t.app.store.update((s) => { s.item_fields = [{ id: 'fd-b', name: 'Brand', type: 'list', order: 1, stopped: false }]; }, { remote: true });
    expect(t.$('.start-step p').textContent).toContain('Brand');
    expect(t.$('.start-step p a').getAttribute('href')).toBe('#/inventory/fields');
  });

  it('AC-34.5: a file of more than 500 rows is cut into parts of 500, each with the column names, and no row is split', () => {
    const head = 'code,name,unit,sale_price';
    const rows = Array.from({ length: 1203 }, (_, i) => `C${i},"Item, number ${i}",nos,10`);
    const parts = splitCsv([head, ...rows].join('\r\n'), 500);
    expect(parts.map((p) => p.rows)).toEqual([500, 500, 203]);
    expect(parts.every((p) => p.text.startsWith(head))).toBe(true);
    expect(recordsOf(parts[2].text)).toHaveLength(204);
    expect(parts[0].text).toContain('"Item, number 0"');
    expect(splitCsv(`${head}\nA,B,nos,1`, 500)).toEqual([{ text: `${head}\nA,B,nos,1`, rows: 1 }]); // small files go in one piece, unchanged
    expect(recordsOf('a,"x\ny"\nb,c\n')).toEqual(['a,"x\ny"', 'b,c']); // a quoted new line stays inside its row
  });

  it('AC-34.5: the screen checks a big file part by part and numbers the rows as the spreadsheet does', async () => {
    const api = fakeApi();
    t = open({ api, hash: '#/inventory/import' });
    await until(() => t.$('input[data-action="pick-inv-csv"]'));
    const rows = Array.from({ length: 1100 }, (_, i) => `C${i},Item ${i},nos,10`);
    const input = t.$('input[data-action="pick-inv-csv"]');
    const file = new File([['code,name,unit,sale_price', ...rows].join('\n')], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => t.$('[data-testid="csv-new"]'));
    expect(api.csvCalls()).toHaveLength(3); // 500 + 500 + 100
    expect(t.$('[data-testid="csv-new"]').textContent).toBe('1100');
    const lastRow = t.$$('.import-table tbody tr').pop();
    expect(lastRow.querySelector('td').textContent).toBe('1101'); // header is row 1
  });

  it('AC-34.2: the check names what will be added to the lists, the columns it will not import and a likely typo', async () => {
    const api = fakeApi();
    api.inventoryImport = async () => ({
      checked: true, file: 'stock.csv', counts: { new: 2, update: 0, same: 0, problem: 0 },
      rows: [
        { row: 2, status: 'new', problems: [], notes: ['Brand "Havels": did you mean Havells? It will be added as new'], code: 'A1', name: 'Wire', unit: 'Coil', sale_price: '920', opening_stock: '25', details: 'Brand: Havels' },
        { row: 3, status: 'new', problems: [], notes: [], code: 'A2', name: 'Switch', unit: 'nos', sale_price: '45', opening_stock: '', details: 'Brand: Polycab' },
      ],
      adds: { units: ['Coil'], lists: [{ field: 'Brand', values: ['Havels', 'Polycab'] }] },
      unknown_columns: ['make'],
    });
    t = open({ api, hash: '#/inventory/import' });
    await until(() => t.$('input[data-action="pick-inv-csv"]'));
    const input = t.$('input[data-action="pick-inv-csv"]');
    Object.defineProperty(input, 'files', { value: [new File(['code,name\nA1,Wire'], 'stock.csv')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => t.$('[data-testid="csv-adds"]'));
    expect(t.$('[data-testid="csv-adds"]').textContent).toContain('units: Coil; Brand: Havels, Polycab');
    expect(t.$('[data-testid="csv-typos"]').textContent).toContain('Row 2: Brand "Havels": did you mean Havells?');
    expect(t.$('[data-testid="csv-unknown"]').textContent).toContain('make');
    expect(t.$('.import-table thead').textContent).toContain('Details');
  });
});

describe('US-35 The phone says when it is nearly full', () => {
  it('AC-35.1: past 3 million characters, or when the browser refuses a save, a plain warning is shown', () => {
    const real = { id: 'b-1', name: 'Shree', is_demo: false };
    const s = createStore();
    s.switchTo(real);
    expect(s.storage().warn).toBe(false);
    s.update((st) => { st.messages.push({ id: 'm-big', text: 'x'.repeat(STORAGE_WARN_AT + 10) }); });
    expect(s.storage()).toMatchObject({ warn: true, refused: false });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try { s.update((st) => { st.settings.theme = 'dark'; }); } finally { Storage.prototype.setItem = original; }
    expect(s.storage()).toMatchObject({ warn: true, refused: true });
  });

  it('AC-35.1: the warning is on the screen, not hidden', async () => {
    t = open({ hash: '#/inventory/fields' });
    await until(() => t.$('[data-form="inv-field"]'));
    expect(t.$('[data-testid="storage-warning"]')).toBeNull();
    t.app.store.update((st) => { st.messages.push({ id: 'm-big', text: 'x'.repeat(STORAGE_WARN_AT + 10) }); }, { remote: true });
    t.go('#/inventory');
    t.go('#/inventory/fields');
    expect(t.$('[data-testid="storage-warning"]').textContent).toContain('nearly full');
  });
});

// ---------- a real business: the server and a weak signal ----------
function open({ api = fakeApi(), me = meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, REAL_BUSINESS), hash = '#/inventory', preload } = {}) {
  localStorage.clear();
  if (preload) localStorage.setItem(`karyahub.biz.v1.${REAL_BUSINESS.id}`, JSON.stringify(preload));
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20], api, me });
  return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)], go: (h) => app.navigate(h), click: (s) => root.querySelector(s).click() };
}

describe('US-32 A real business: details travel to the server before the items that use them', () => {
  const chip = (x) => x.$('[data-testid="sync-status"]');
  const seed = (api) => {
    api.server.records.set('item:it-cap', { kind: 'item', id: 'it-cap', number: '', seq: 1, body: { id: 'it-cap', name: 'Capacitor 45 µF', code: 'CAP-45', unit: 'nos', sale: 45000, cost: 21000, hsn: '8532', gst: 18, low: 5, stopped: false, qty: 10 } });
    api.server.counters.seq = 1;
    return api;
  };

  it('AC-32.1: a field, an entry and an item made together reach the server in that order, once each', async () => {
    const api = seed(fakeApi());
    t = open({ api, hash: '#/inventory/fields' });
    await until(() => chip(t)?.textContent.includes('All saved') && t.$('[data-form="inv-field"]'));
    const brand = addField(t, 'Brand', 'list', { in_list: true });
    t.app.navigate('#/inventory/new');
    const form = t.$('[data-form="inv-item"]');
    type(form.elements.name, 'Life Line Plus');
    type(form.elements.sale, '920');
    type(form.elements[`attr:${brand.id}`], 'Havells');
    change(form.elements.unit, '__new__');
    type(form.elements.new_unit, 'Coil');
    submit(form);
    await until(() => chip(t)?.textContent.includes('All saved'));
    const order = api.syncCalls.flatMap((c) => c.ops).map((o) => o.kind);
    expect(order.indexOf('item_field')).toBeLessThan(order.indexOf('list_entry'));
    expect(order.indexOf('list_entry')).toBeLessThan(order.indexOf('item'));
    expect(order.indexOf('unit')).toBeLessThan(order.indexOf('item'));
    const onServer = [...api.server.records.values()];
    const item = onServer.find((r) => r.kind === 'item' && r.body.name === 'Life Line Plus').body;
    expect(item.unit).toBe(onServer.find((r) => r.kind === 'unit').id);
    expect(item.attrs[brand.id]).toBe(onServer.find((r) => r.kind === 'list_entry').id);
    expect(onServer.filter((r) => r.kind === 'item_field')).toHaveLength(1);
  });

  it('AC-32.1: details another phone made reach this phone, and items from before have empty details', async () => {
    const api = seed(fakeApi());
    api.server.records.set('item_field:fd-1', { kind: 'item_field', id: 'fd-1', number: '', seq: 2, body: { id: 'fd-1', name: 'Brand', type: 'list', required: false, in_list: true, in_filter: true, on_bills: false, stopped: false, order: 1 } });
    api.server.records.set('list_entry:le-1', { kind: 'list_entry', id: 'le-1', number: '', seq: 3, body: { id: 'le-1', field_id: 'fd-1', name: 'Havells', stopped: false } });
    api.server.records.get('item:it-cap').body.attrs = { 'fd-1': 'le-1' };
    api.server.counters.seq = 3;
    t = open({ api });
    await until(() => t.$('[data-testid="card-details"]'));
    expect(t.$('[data-testid="card-details"]').textContent).toBe('Brand: Havells');
    expect(t.$('[data-inv-filter="fd-1"]')).toBeTruthy();
    expect(t.app.store.get().item_fields).toHaveLength(1);
  });

  it('AC-32.1: made with no signal, the details are kept on the phone and sent when the signal returns', async () => {
    const api = seed(fakeApi());
    t = open({ api, hash: '#/inventory/fields' });
    await until(() => chip(t)?.textContent.includes('All saved') && t.$('[data-form="inv-field"]'));
    api.network.offline = true;
    addField(t, 'Brand', 'list');
    await until(() => chip(t)?.textContent.includes('waiting, offline'));
    expect(t.$('[data-testid="fields-table"]').textContent).toContain('Brand');
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => chip(t)?.textContent.includes('All saved'));
    expect([...api.server.records.values()].filter((r) => r.kind === 'item_field')).toHaveLength(1);
  });
});

describe('US-32 Data saved by v0.8.0', () => {
  it('AC-32.4: a business saved before details existed opens, with empty details and no units of its own', () => {
    const old = { version: 5, settings: { is_demo: false }, customers: [], jobs: [], documents: [], messages: [], items: [{ id: 'it-1', name: 'Pipe', unit: 'nos', sale: 100, gst: 18, stopped: false, qty: 3 }], stock_moves: [], seq: {} };
    const s = migrate(old);
    expect(s.version).toBe(6);
    expect(s.item_fields).toEqual([]);
    expect(s.list_entries).toEqual([]);
    expect(s.units).toEqual([]);
    expect(s.items[0]).toMatchObject({ id: 'it-1', qty: 3 });
    expect(fnorm('Material_type')).toBe('material type');
    expect(csvTemplate(s)).toBe(csvTemplate({ item_fields: [] }));
  });
});
