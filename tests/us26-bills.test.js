import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor, REAL_BUSINESS, DEMO_BUSINESS } from './fake-accounts.js';
import { setup, until } from './helpers.js';
import { defaultPermissions } from '../src/domain/access.js';
import { BANNED_WORDS } from '../src/words.js';

let t;
afterEach(() => { t?.app.unmount(); t = null; vi.restoreAllMocks(); });

const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };
const SHREE = { ...REAL_BUSINESS, address: '12 MG Road, Pune', gstin: '27AAPFU0939F1ZV', state_code: '27', business_type: 'service', packs: ['field_service'], gst_registration: 'regular', setup_needed: false, bill_look: {} };
const owner = (business = SHREE, extra = {}) => meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, business, extra);

/** A real business (it syncs through the fake server); tests/helpers.js opens the demo. */
function real({ api = fakeApi(), me = owner(), hash = '#/' } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { ...FAST, api, me });
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  return { app, root, $, $$, api, go: (h) => app.navigate(h), click: (sel) => (typeof sel === 'string' ? root.querySelector(sel) : sel).click() };
}
const type = (x, sel, value, ev = 'input') => { const el = x.$(sel); el.value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); };
const change = (x, sel, value) => type(x, sel, value, 'change');
const nav = (x) => x.$$('nav.tabs a.tab span').map((s) => s.textContent).filter((w) => !['Admin', 'Settings'].includes(w)); // the Workspace places

/** + New → Bill, an item line from the search, typed values; returns the draft's id. */
async function newBill(x, { kind = 'bills', item = 'it-r32', qty = '2', rate = null } = {}) {
  x.go(`#/${kind}/new`);
  await until(() => x.$('[data-testid="bill-editor"]'));
  if (item) {
    type(x, '[data-item-search]', item === 'it-r32' ? 'R32' : 'motor');
    await until(() => x.$('[data-action="bill-add-item"]'));
    x.click('[data-action="bill-add-item"]');
  } else {
    type(x, '[data-item-search]', 'AC service visit');
    x.click('[data-action="bill-add-typed"]');
  }
  await until(() => x.$('[data-k="q0"]'));
  change(x, '[data-k="q0"]', qty);
  if (rate !== null) change(x, '[data-k="r0"]', rate);
  await until(() => String(x.app.store.get().documents[0].lines[0].qty) === qty);
  return x.app.store.get().documents[0].id;
}

describe('US-26 Business type and packs (screens)', () => {
  it('AC-26.1: an owner of a business not set up is asked once; saving it opens the app', async () => {
    const api = fakeApi();
    const fresh = owner({ ...SHREE, business_type: '', setup_needed: true });
    api.saveSetup = vi.fn(async (f) => ({ business_type: f.business_type, setup_needed: false, packs: f.business_type === 'service' ? ['field_service'] : [], gst_registration: f.gst_registration, state_code: f.state_code }));
    api.me = vi.fn(async () => owner());
    t = real({ api, me: fresh });
    expect(t.$('[data-testid="setup-screen"] h1').textContent).toBe('What kind of business do you run?');
    expect(t.$$('input[name="business_type"]').map((i) => i.value)).toEqual(['service', 'trading', 'shop', 'other']);
    expect(t.$$('input[name="gst_registration"]').map((i) => i.value)).toEqual(['regular', 'composition', 'unregistered']);
    t.go('#/bills'); // every screen asks until it is answered
    expect(t.$('[data-testid="setup-screen"]')).toBeTruthy();
    t.$('input[value="service"]').checked = true;
    t.$('select[name="state_code"]').value = '27';
    t.$('form[data-form="bill-first-setup"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => !t.$('[data-testid="setup-screen"]'));
    expect(api.saveSetup).toHaveBeenCalledWith({ business_type: 'service', gst_registration: 'regular', state_code: '27' });
  });

  it('AC-26.1: the state is needed: "Pick your state to work out GST."', async () => {
    const api = fakeApi();
    api.saveSetup = vi.fn();
    t = real({ api, me: owner({ ...SHREE, setup_needed: true, state_code: '' }) });
    t.$('input[value="trading"]').checked = true;
    t.$('form[data-form="bill-first-setup"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="setup-notice"]'));
    expect(t.$('[data-testid="setup-notice"]').textContent).toBe('Pick your state to work out GST.');
    expect(api.saveSetup).not.toHaveBeenCalled();
  });

  it('AC-26.2: the demo and older businesses (no packs saved) keep every v0.7.0 screen and are never asked', () => {
    t = setup();
    expect(t.$('[data-testid="setup-screen"]')).toBeNull();
    expect(nav(t)).toEqual(['Home', 'Bills', 'Chat', 'Jobs', 'Inventory', 'Renewals']);
  });

  it('AC-26.3: with Field service off there is no menu, Home figure or + New choice for jobs, Chat or renewals', () => {
    const fieldService = ['use_chat', 'view_jobs', 'verify_work', 'close_jobs', 'manage_renewals', 'use_parts'];
    const me = owner({ ...SHREE, business_type: 'trading', packs: [] }, { permissions: defaultPermissions('owner').filter((p) => !fieldService.includes(p)) });
    t = real({ me });
    expect(nav(t)).toEqual(['Home', 'Bills', 'Inventory']);
    expect(t.$('[data-testid="today-kpis"]')).toBeNull();
    expect(t.$('[data-testid="money-at-stake"]')).toBeNull();
    expect(t.$('[data-testid="home-bills"]')).toBeTruthy();
    t.click('[data-action="bill-new-menu"]');
    expect(t.$$('[data-testid="new-choice"]').map((a) => a.textContent.trim())).toEqual(['Bill', 'Estimate', 'Item']);
    t.go('#/jobs');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
  });

  it('AC-26.4: Settings shows the type, GST registration and pack switch to people with manage_settings, and saves them', async () => {
    const api = fakeApi();
    api.saveSetup = vi.fn(async (f) => ({ ...f, setup_needed: false }));
    api.me = vi.fn(async () => owner());
    t = real({ api, hash: '#/settings' });
    expect(t.$('[data-testid="packs-panel"]').textContent).toContain('Field service');
    expect(t.$('[data-testid="packs-panel"]').textContent).toContain('Coming soon');
    t.$('input[name="pack_field_service"]').checked = false;
    t.$('form[data-form="bill-setup"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="packs-notice"]'));
    expect(api.saveSetup).toHaveBeenCalledWith({ business_type: 'service', gst_registration: 'regular', state_code: '27', packs: [] });
    expect(t.$('[data-testid="packs-notice"]').textContent).toBe('Saved. Everyone sees this at their next screen.');
  });

  it('AC-26.5: one + New button offers Bill, Estimate, Item, Job, in that order, only as permissions allow', () => {
    t = setup();
    t.click('[data-action="bill-new-menu"]');
    expect(t.$$('[data-testid="new-choice"]').map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual([['Bill', '#/bills/new'], ['Estimate', '#/estimates/new'], ['Item', '#/inventory/new'], ['Job', '#/chat']]);
    t.app.unmount();
    t = setup({ signedInAs: 'st-santosh', hash: '#/jobs' });
    t.click('[data-action="bill-new-menu"]');
    expect(t.$$('[data-testid="new-choice"]').map((a) => a.textContent.trim())).toEqual(['Job']); // technicians report jobs in Chat
    expect(nav(t)).not.toContain('Bills');
  });

  it('AC-26.6: the new and changed screens take their words from one file and never say voucher, ledger, debit note or credit note', () => {
    const files = ['src/words.js', 'src/views/bills.js', 'src/bills-app.js', 'src/views/settings.js', 'src/views/home.js', 'src/views/jobs.js', 'src/views/inventory.js', 'src/app.js'];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').toLowerCase().replace(/banned_words = \[[^\]]*\]/, '').replace(/"voucher", "ledger", "debit note" or "credit note"/, '');
      for (const word of BANNED_WORDS) expect(text.includes(word), `${f}: ${word}`).toBe(false);
    }
    expect(readFileSync('src/views/bills.js', 'utf8')).toContain("from '../words.js'");
  });
});

describe('US-27 Bills that are right (screens)', () => {
  it('AC-27.1: + New → Bill opens dated today for "Walk-in customer", with Save and share as the one main button and the rest under More options', async () => {
    t = setup();
    t.go('#/bills/new');
    await until(() => t.$('[data-testid="bill-editor"]'));
    const d = t.app.store.get().documents[0];
    expect([d.type, d.status, d.date, d.customer.name]).toEqual(['invoice', 'draft', '2027-01-01', 'Walk-in customer']);
    expect(t.$('[data-testid="bill-customer"]').textContent).toContain('Walk-in customer');
    expect(t.$$('.bill-editor .btn-primary').map((b) => b.textContent.trim())).toEqual(['Save and share']);
    const more = t.$('[data-testid="more-options"]');
    expect(more.open).toBe(false);
    for (const label of ['Discount on the whole bill', 'Notes', 'Terms', 'Due date', 'Place of supply']) expect(more.textContent).toContain(label);
    t.click('[data-action="bill-pick-customer"]');
    type(t, '[data-cust-search]', 'anita');
    expect(t.$('[data-slot="cust-results"]').textContent).toContain('Anita Deshpande');
  });

  it('AC-27.2: an item line takes the unit, sale price and GST rate; the customer\'s last price is used and marked; service items are offered', async () => {
    t = setup();
    t.app.store.update((s) => { s.items.push({ id: 'it-gas', name: 'Gas refill service', unit: 'nos', sale: 150000, gst: 18, service: true, qty: 0 }); });
    await newBill(t, { qty: '1' });
    const l = t.app.store.get().documents[0].lines[0];
    expect(l).toMatchObject({ item_id: 'it-r32', description: 'R32 refrigerant gas', unit: 'kg', rate: 95000, gst_rate: '18' });
    t.click('[data-action="bill-pick-customer"]');
    type(t, '[data-cust-search]', 'anita');
    t.click('[data-action="bill-set-customer"]');
    change(t, '[data-k="r0"]', '900');
    await until(() => t.app.store.get().documents[0].lines[0].rate === 90000);
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="bill-paper"]'));
    await newBill(t, { qty: '1' });
    t.click('[data-action="bill-pick-customer"]');
    type(t, '[data-cust-search]', 'anita');
    t.click('[data-action="bill-set-customer"]');
    await until(() => t.$('[data-testid="last-price"]'));
    expect(t.app.store.get().documents[0].lines[0].rate).toBe(90000);
    type(t, '[data-item-search]', 'gas refill');
    expect(t.$('[data-slot="item-results"]').textContent).toContain('Service, no stock');
  });

  it('AC-27.3 and AC-27.4: line and bill discounts show at once: 2 × ₹1,250 at 18% less 10% is ₹2,655', async () => {
    t = setup();
    await newBill(t, { item: null, qty: '2', rate: '1250' });
    type(t, '[data-k="ld0"]', '10');
    expect(t.$('[data-testid="editor-total"]').textContent).toBe('₹2,655');
    expect(t.$('[data-testid="editor-taxes"]').textContent).toContain('CGST ₹202.50 + SGST ₹202.50');
    type(t, '[data-k="bd"]', '5');
    expect(t.$('[data-testid="editor-total"]').textContent).toBe('₹2,522'); // 5% off 2,250 before tax
  });

  it('AC-27.8: a wrong GSTIN stops the save with the message, and the bill stays a draft', async () => {
    t = setup();
    await newBill(t, { item: null, qty: '1', rate: '500' });
    change(t, '[data-k="cg"]', '27AAPFU0939F1ZA');
    await until(() => t.app.store.get().documents[0].customer.gstin === '27AAPFU0939F1ZA');
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="editor-error"]'));
    expect(t.$('[data-testid="editor-error"]').textContent).toBe("This GSTIN doesn't look right. Check it with the customer.");
    expect(t.app.store.get().documents[0]).toMatchObject({ status: 'draft', number: '' });
  });
});

describe('US-28 Numbers and status (screens)', () => {
  it('AC-28.1: the demo numbers bills and estimates in their own series for the financial year', async () => {
    t = setup();
    const numbers = [];
    for (const kind of ['bills', 'bills', 'estimates']) {
      await newBill(t, { kind, item: null, qty: '1', rate: '100' });
      t.click('[data-testid="save-and-share"]');
      await until(() => t.$('[data-testid="bill-number"]'));
      numbers.push(t.$('[data-testid="bill-number"]').textContent);
    }
    expect(numbers).toEqual(['26-27/0001', '26-27/0002', 'E/26-27/0001']);
  });

  it('AC-28.3: with no signal Save keeps the bill as "Number given when online"; the number shows once it is sent', async () => {
    const api = fakeApi();
    t = real({ api });
    await newBill(t, { item: null, qty: '1', rate: '500' });
    api.network.offline = true;
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="number-when-online"]'));
    expect(t.$('[data-testid="send-whatsapp"]')).toBeNull();
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => t.app.store.get().documents[0].number === '26-27/0001');
    t.go('#/bills');
    expect(t.$('[data-testid="bill-row"]').textContent).toContain('26-27/0001');
  });

  it('AC-28.5: a sent bill opens as a bill, not the editor; Cancel takes a reason, keeps the number and can be undone', async () => {
    const api = fakeApi();
    t = real({ api });
    const id = await newBill(t, { item: null, qty: '1', rate: '500' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="send-whatsapp"]'));
    t.click('[data-action="bill-mark-sent"]');
    await until(() => t.$('[data-testid="status-chip"]').textContent === 'Sent');
    t.go(`#/bills/${id}/edit`);
    await until(() => !t.$('[data-testid="bill-editor"]'));
    expect(t.$('[data-testid="bill-paper"]')).toBeTruthy();
    t.click('[data-action="bill-cancel"]');
    t.$('form[data-form="bill-cancel"] input').value = 'Wrong customer';
    t.$('form[data-form="bill-cancel"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="cancelled-stamp"]'));
    expect(api.billCalls.at(-1)).toMatchObject({ action: 'cancel', extra: { reason: 'Wrong customer' } });
    expect(t.$('[data-testid="bill-number"]').textContent).toBe('26-27/0001');
    t.click('[data-action="bill-undo-cancel"]');
    await until(() => t.$('[data-testid="status-chip"]').textContent === 'Sent');
  });

  it('AC-28.6: the Bills list searches by number, name or phone and filters with chips and counts, newest first', async () => {
    t = setup();
    for (const rate of ['100', '200']) {
      await newBill(t, { item: null, qty: '1', rate });
      t.click('[data-testid="save-and-share"]');
      await until(() => t.$('[data-testid="bill-paper"]'));
    }
    await newBill(t, { item: null, qty: '1', rate: '300' }); // a draft
    t.go('#/bills');
    expect(t.$$('[data-testid="bill-row"]').map((r) => r.textContent.match(/26-27\/\d+|Draft/)[0])).toEqual(['Draft', '26-27/0002', '26-27/0001']);
    expect(t.$('[data-chip-count="all"]').textContent).toBe('3');
    expect(t.$('[data-chip-count="draft"]').textContent).toBe('1');
    expect(t.$('[data-chip-count="unpaid"]').textContent).toBe('2');
    t.click('[data-chip="draft"]');
    expect(t.$$('[data-testid="bill-row"]')).toHaveLength(1);
    t.click('[data-chip="all"]');
    type(t, '[data-bill-search]', '0002');
    expect(t.$$('[data-testid="bill-row"]')).toHaveLength(1);
    expect(t.$('.bill-table')).toBeTruthy(); // the table shows from 760 px (styles)
  });

  it('AC-28.7: quotes and invoices from v0.7.0 show in the list as Saved with their own number and open in the old view', () => {
    t = setup();
    t.app.store.update((s) => { s.documents.unshift({ id: 'QT-2026-0003', job_id: 'J-1', type: 'quote', customer: { name: 'Old Customer' }, lines: [{ description: 'Service', qty: 1, rate: 999 }], subtotal: 999, cgst: 89.91, sgst: 89.91, roundOff: 0.18, total: 1179, date: '2026-06-01', sent: true }); });
    t.go('#/estimates');
    const row = t.$('[data-testid="bill-row"]');
    expect(row.textContent).toContain('QT-2026-0003');
    expect(row.textContent).toContain('₹1,179');
    expect(row.textContent).toContain('Saved');
    expect(row.getAttribute('href')).toBe('#/doc/QT-2026-0003');
  });

  it('AC-28.8: a coordinator makes bills but sees no Cancel; a technician has no Bills', async () => {
    t = setup({ signedInAs: 'st-coord' });
    await newBill(t, { item: null, qty: '1', rate: '100' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="bill-actions"]'));
    expect(t.$('[data-action="bill-cancel"]')).toBeNull();
    expect(t.$('[data-action="bill-mark-paid"]')).toBeTruthy();
  });
});

describe('US-29 Estimate to bill (screens)', () => {
  it('AC-29.1 to AC-29.3: an estimate is valid for 15 days; Make bill copies it once, then says it is already billed', async () => {
    t = setup();
    await newBill(t, { kind: 'estimates', item: null, qty: '2', rate: '750' });
    expect(t.app.store.get().documents[0].valid_until).toBe('2027-01-16');
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-action="bill-make-bill"]'));
    const est = t.app.store.get().documents[0];
    t.click('[data-action="bill-make-bill"]');
    await until(() => t.$('[data-testid="bill-editor"]'));
    const draft = t.app.store.get().documents[0];
    expect([draft.type, draft.estimate_id, draft.lines[0].description, draft.lines[0].rate]).toEqual(['invoice', est.id, 'AC service visit', 75000]);
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="bill-number"]')?.textContent === '26-27/0001');
    t.go(`#/bills/${est.id}`);
    expect(t.$('[data-testid="billed-as"]').textContent).toContain('Billed as 26-27/0001');
    expect(t.$('[data-action="bill-make-bill"]')).toBeNull();
  });

  it('AC-29.3: on a real business a second Make bill is refused with the bill\'s number and Open bill', async () => {
    const api = fakeApi();
    t = real({ api });
    await newBill(t, { kind: 'estimates', item: null, qty: '1', rate: '400' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-action="bill-make-bill"]'));
    const est = t.app.store.get().documents[0];
    t.app.store.update((s) => { Object.assign(s.documents.find((d) => d.id === est.id), { bill_id: 'doc-x', bill_number: '26-27/0007' }); }, { remote: true });
    t.go(`#/bills/${est.id}`);
    expect(t.$('[data-testid="billed-as"]').textContent).toContain('26-27/0007');
  });
});

describe('US-30 Bill look and link (screens)', () => {
  it('AC-30.1: Settings → Bill look has the layouts, six colours and a live preview of a sample bill', async () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async (f) => f);
    t = real({ api, hash: '#/settings' });
    expect(t.$$('input[name="layout"]').map((i) => i.value)).toEqual(['a4_classic', 'a4_modern', 'receipt_80']);
    expect(t.$$('input[name="colour"]')).toHaveLength(6);
    t.$('input[value="a4_modern"]').checked = true;
    t.$('input[value="a4_modern"]').dispatchEvent(new Event('change', { bubbles: true }));
    type(t, 'input[name="prefix"]', 'ac');
    expect(t.$('[data-testid="look-preview"] .bill-paper').className).toContain('layout-a4_modern');
    expect(t.$('[data-testid="look-preview"] [data-testid="bill-number"]').textContent).toBe('AC/26-27/0001');
    t.$('form[data-form="bill-look"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="look-notice"]'));
    expect(api.saveBillLook.mock.calls[0][0]).toMatchObject({ layout: 'a4_modern', prefix: 'ac' });
  });

  it('AC-30.2 and AC-30.5: a real bill shows Tax Invoice, place of supply and Download PDF; the link can be turned off and on', async () => {
    const api = fakeApi();
    t = real({ api });
    await newBill(t, { item: null, qty: '1', rate: '1000' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="download-pdf"]'));
    expect(t.$('[data-testid="bill-heading"]').textContent).toBe('Tax Invoice');
    expect(t.$('[data-testid="place-of-supply"]').textContent).toBe('Place of supply: Maharashtra (27)');
    expect(t.$('[data-testid="paper-words"]').textContent).toBe('Rupees One Thousand One Hundred Eighty only');
    expect(t.$('[data-testid="download-pdf"]').getAttribute('href')).toMatch(/^\/b\/tok.+\/pdf$/);
    t.click('[data-action="bill-link"]');
    await until(() => t.$('[data-testid="link-off"]'));
    t.click('[data-action="bill-link"]');
    await until(() => !t.$('[data-testid="link-off"]'));
    expect(api.billCalls.filter((c) => c.name === 'documentLink').map((c) => c.on)).toEqual([false, true]);
  });

  it('AC-30.6: demo bills carry Sample, get no link, and Send on WhatsApp opens with sample text', async () => {
    t = setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await newBill(t, { item: null, qty: '1', rate: '100' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="sample-mark"]'));
    expect(t.$('[data-testid="download-pdf"]')).toBeNull();
    expect(t.$('[data-testid="links-for-real"]').textContent).toBe('Links work for real businesses.');
    t.click('[data-testid="send-whatsapp"]');
    const url = decodeURIComponent(open.mock.calls[0][0]);
    expect(url).toContain('https://wa.me/?text=Namaste, here is your bill 26-27/0001 from CoolCare AC Services for ₹118: (sample');
    expect(t.$('[data-testid="status-chip"]').textContent).toBe('Sent');
    expect(DEMO_BUSINESS.is_demo).toBe(true);
  });
});

describe('US-31 Send on WhatsApp (screens)', () => {
  it('AC-31.1: Send goes through the server, opens WhatsApp with the message and the bill becomes Sent', async () => {
    const api = fakeApi();
    t = real({ api });
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockImplementation(() => tab);
    await newBill(t, { item: null, qty: '1', rate: '1000' });
    t.click('[data-action="bill-pick-customer"]');
    type(t, '[data-cust-search]', 'Mehta 9822000001');
    t.click('[data-action="bill-new-customer"]');
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-testid="send-whatsapp"]'));
    t.click('[data-testid="send-whatsapp"]');
    await until(() => tab.location.href);
    expect(decodeURIComponent(tab.location.href)).toMatch(/^https:\/\/wa\.me\/919822000001\?text=Namaste Customer, here is your bill 26-27\/0001 from Shree Cool AC for ₹1,180: https:\/\/karyahub-akkiverse\.vercel\.app\/b\/tok/);
    await until(() => t.$('[data-testid="status-chip"]').textContent === 'Sent');
  });

  it('AC-31.3: Copy link copies it and marks the bill Sent; Mark as sent does the same without sharing', async () => {
    const api = fakeApi();
    t = real({ api });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    await newBill(t, { item: null, qty: '1', rate: '1000' });
    t.click('[data-testid="save-and-share"]');
    await until(() => t.$('[data-action="bill-copy-link"]'));
    t.click('[data-action="bill-copy-link"]');
    await until(() => t.$('[data-testid="status-chip"]').textContent === 'Sent');
    expect(writeText.mock.calls[0][0]).toMatch(/\/b\/tok/);
    expect(api.billCalls.at(-1)).toMatchObject({ name: 'documentAction', action: 'mark_sent', extra: { how: 'copy' } });
    expect(t.$('[data-testid="bill-notice"]').textContent).toContain('Link copied.');
  });
});

void PEOPLE;
