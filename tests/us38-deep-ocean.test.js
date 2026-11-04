// CR-0015: the Deep Ocean Teal look, Aurora Dark and Clean Light, and the new layouts.
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, sendSample, until } from './helpers.js';
import { billRows } from '../src/views/bills.js';
import { billFigures, gstThisMonth } from '../src/domain/bills.js';
import { THEME_KEY, themePref, resolveTheme } from '../src/theme.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor } from './fake-accounts.js';

const css = readFileSync('src/styles.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const main = readFileSync('src/main.js', 'utf8');
const theme = () => document.documentElement.dataset.theme;

let t;
afterEach(() => { t?.app.unmount(); delete window.matchMedia; document.documentElement.removeAttribute('data-theme'); });

const bill = (over = {}) => ({
  id: `doc-${Math.random().toString(36).slice(2)}`, doc_version: 2, type: 'invoice', status: 'saved', number: '26-27/0001', date: '2027-01-01', due_date: '2027-01-01',
  customer: { name: 'Mehta Clinic', phone: '9900000111', gstin: '27AAAAA0000A1Z5' },
  lines: [{ description: 'AC service', qty: 1, unit: 'nos', rate: 100000, gst_rate: '18' }],
  totals: { taxable: 100000, cgst: 9000, sgst: 9000, igst: 0, round_off: 0, total: 118000, in_words: '' }, ...over,
});
const addDocs = (docs) => t.app.store.update((s) => { s.documents.push(...docs); });

describe('US-38 Aurora Dark and Clean Light', () => {
  it('AC-38.1: the first visit is Aurora Dark on the root element, and the top bar button switches to Clean Light at once and remembers it', () => {
    t = setup();
    expect(theme()).toBe('dark');
    expect(t.$('[data-testid="theme-toggle"]').textContent).toContain('Aurora Dark');
    t.click('[data-testid="theme-toggle"]');
    expect(theme()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(t.$('[data-testid="theme-toggle"]').textContent).toContain('Clean Light');
  });

  it('AC-38.1: the sign-in screen has the same button', () => {
    t = setup({ signedInAs: null });
    t.click('[data-testid="theme-toggle"]');
    expect(theme()).toBe('light');
  });

  it('AC-38.2: Settings offers Dark, Light and System; System follows the device, and the button and the choice stay in step', () => {
    let listener;
    let light = true;
    window.matchMedia = vi.fn(() => ({ get matches() { return light; }, addEventListener: (_, f) => { listener = f; }, removeEventListener: () => {} }));
    t = setup({ hash: '#/settings' });
    const radio = (v) => t.$(`input[name="theme"][value="${v}"]`);
    expect(radio('dark').checked).toBe(true);
    radio('system').click();
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
    expect(theme()).toBe('light');
    light = false;
    listener();
    expect(theme()).toBe('dark');
    expect(t.$('[data-testid="theme-toggle"]').textContent).toContain('Aurora Dark');
    t.click('[data-testid="theme-toggle"]');
    expect(radio('light').checked).toBe(true);
  });

  it('AC-38.3: a light or dark choice made on an older version is kept; "follow system" from before starts dark', () => {
    localStorage.clear();
    localStorage.setItem('karyahub.prefs.v1', JSON.stringify({ theme: 'light' }));
    expect(themePref()).toBe('light');
    localStorage.setItem('karyahub.prefs.v1', JSON.stringify({ theme: 'system' }));
    expect(themePref()).toBe('dark');
    expect(resolveTheme('anything')).toBe('dark');
    localStorage.clear();
  });

  it('AC-38.4: the theme is set before the first paint, and switching it leaves what is being typed alone', () => {
    expect(html).toMatch(/<script>[\s\S]*kh-theme[\s\S]*dataset\.theme[\s\S]*<\/script>[\s\S]*<body>/);
    t = setup({ hash: '#/inventory' });
    const box = t.$('[data-inv-search]');
    box.value = 'cap';
    t.click('[data-testid="theme-toggle"]');
    expect(t.$('[data-inv-search]')).toBe(box);
    expect(box.value).toBe('cap');
  });

  it('AC-38.5: the exact design tokens of both themes are in the stylesheet', () => {
    for (const token of ['--kh-bg: #060814', '--kh-bg: #F8FAFC', '--kh-primary-grad: linear-gradient(135deg, #0F766E 0%, #0369A1 50%, #2563EB 100%)', '--kh-primary: #0D9488', '--kh-primary: #0F766E', '--kh-primary-accent: #0EA5E9', '--kh-primary-accent: #0284C7', '--kh-card-radius: 16px', '--kh-text-muted: #94A3B8', '--kh-text-muted: #64748B',
      '--kh-ok: #34D399', '--kh-ok: #047857', '--kh-warn: #FBBF24', '--kh-warn: #B45309', '--kh-bad: #FB7185', '--kh-bad: #BE123C']) expect(css).toContain(token);
    expect(css).not.toMatch(/prefers-color-scheme/); // the theme comes only from data-theme
  });

  it('AC-38.6: the three font roles are bundled with the app, so no request leaves for fonts', () => {
    for (const f of ['plus-jakarta-sans/800', 'inter/400', 'jetbrains-mono/700']) expect(main).toContain(`@fontsource/${f}.css`);
    expect(html).not.toContain('fonts.googleapis');
    expect(css).toContain("--font-mono: 'JetBrains Mono'");
    expect(css).toMatch(/\.kpi-value[^{]*\.qty[^{]*input\[name="gstin"\][^{]*input\[name="pin"\][^{]*\{\s*font-family: var\(--font-mono\)/);
  });

  it('AC-38.7: the paper is white in both themes, carries the gradient in the default colour, and a business\'s own colour otherwise', () => {
    expect(css).toMatch(/\.doc \{[\s\S]*?background: #FFFFFF; color: #0F172A/);
    t = setup({ hash: '#/settings' });
    expect(t.$('[data-testid="look-preview"] .bill-paper').className).toContain('is-ocean');
    const blue = t.$('[data-form="bill-look"] input[name="colour"][value="#1D4ED8"]');
    blue.disabled = false;
    blue.click();
    blue.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.$('[data-testid="look-preview"] .bill-paper').className).not.toContain('is-ocean');
  });
});

describe('US-39 The shell', () => {
  it('AC-39.1: the top bar shows where you are, and the side menu opens as a drawer, closes on Escape and on a link', async () => {
    t = setup({ hash: '#/bills' });
    expect(t.$('[data-testid="breadcrumb"]').textContent.replace(/\s+/g, ' ').trim()).toBe('Workspace/Bills');
    const shell = () => t.$('.shell').classList.contains('nav-open');
    t.click('.nav-toggle');
    expect(shell()).toBe(true);
    expect(t.$('.nav-toggle').getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shell()).toBe(false);
    t.click('.nav-toggle');
    t.click('#side-nav a[href="#/inventory"]');
    expect(t.app.ui.navOpen).toBe(false);
  });

  it('AC-39.2: Ctrl or Cmd + K goes to the search; it finds bills, items and jobs and opens them', async () => {
    t = setup();
    addDocs([bill()]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    const box = t.$('[data-global-search]');
    expect(document.activeElement).toBe(box);
    const search = (q) => { box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); return t.$$('[data-testid="gs-result"]'); };
    expect(search('mehta')[0].getAttribute('href')).toContain('#/bills/doc-');
    expect(search('cap 45')[0].getAttribute('href')).toBe('#/inventory/item/it-cap45');
    expect(search('zzzz')).toHaveLength(0);
    expect(t.$('[data-testid="gs-none"]')).toBeTruthy();
  });

  it('AC-39.3: search shows only what this person may open', () => {
    t = setup({ signedInAs: 'st-santosh', hash: '#/jobs' });
    t.app.store.update((s) => { s.documents.push(bill()); });
    const box = t.$('[data-global-search]');
    for (const q of ['mehta', 'cap']) {
      box.value = q;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      expect(t.$$('[data-testid="gs-result"]')).toHaveLength(0);
    }
  });

  it('AC-39.4: + New is one button, and it also shows on Admin and Settings (top bar from 900 px)', () => {
    t = setup({ hash: '#/settings' });
    expect(t.$$('[data-testid="new-button"]')).toHaveLength(1);
    t.go('#/admin');
    expect(t.$$('[data-testid="new-button"]')).toHaveLength(1);
    t.go('#/chat');
    expect(t.$('[data-testid="new-button"]')).toBeNull();
  });

  it('AC-39.5: the entrance plays when the screen changes, not on a redraw of the same screen', () => {
    t = setup({ hash: '#/bills' });
    expect(t.$('[data-slot="view"].view-enter')).toBeNull();
    t.go('#/inventory');
    expect(t.$('[data-slot="view"].view-enter')).toBeTruthy();
    t.app.render();
    expect(t.$('[data-slot="view"].view-enter')).toBeNull();
    expect(css).toMatch(/kh-enter 280ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });
});

describe('US-40 Home', () => {
  it('AC-40.1: four figures come from the data: billed today, unpaid balance, overdue in rupees with how many, and stock value', () => {
    t = setup();
    addDocs([bill(), bill({ date: '2026-12-01', due_date: '2026-12-10', number: '26-27/0002' }), bill({ status: 'paid', number: '26-27/0003' }), bill({ status: 'draft', number: '' })]);
    t.app.render();
    const kpi = (k) => t.$(`[data-kpi="${k}"]`).textContent;
    expect(kpi('billed-today')).toBe('₹2,360');
    expect(kpi('unpaid')).toBe('₹2,360');
    expect(kpi('overdue-amount')).toBe('₹1,180');
    expect(kpi('overdue')).toBe('1');
    expect(kpi('stock-value')).toBe('₹29,392');
    expect(t.$('[data-testid="home-bills"]').textContent).toContain('3 items low in stock');
    expect(billFigures([], '2027-01-01')).toMatchObject({ billedToday: 0, overdueAmount: 0, madeToday: 0, unpaidCount: 0 });
  });

  it('AC-40.1: without inventory permission there is no stock value', () => {
    t = setup();
    t.app.session.set({ ...t.app.session.get(), permissions: t.app.session.get().permissions.filter((p) => p !== 'manage_inventory') });
    t.app.render();
    expect(t.$('[data-kpi="stock-value"]')).toBeNull();
  });

  it('AC-40.2: the field feed shows each technician message with what was read; an approved job makes a bill or a GST quote in one tap', async () => {
    t = setup();
    expect(t.$('[data-testid="stream-empty"]')).toBeTruthy();
    await sendSample(t, 's-ramesh');
    t.go('#/');
    expect(t.$('[data-testid="stream-row"]').textContent).toContain('Voice note');
    expect(t.$('[data-testid="stream-status"]').textContent).toMatch(/check it/);
    expect(t.$('[data-testid="stream-bill"]')).toBeNull();
    t.go('#/chat');
    t.click('[data-action="approve"]');
    t.go('#/');
    expect(t.$('[data-testid="stream-status"]').textContent).toBe('Job created');
    expect(t.$('[data-testid="stream-bill"]').textContent).toContain('Generate Bill from Note');
    t.click('[data-testid="stream-quote"]');
    await until(() => t.$('[data-testid="bill-editor"]'));
    expect(t.$('[data-testid="bill-customer"]').textContent).toContain('Ramesh');
    expect(t.$('h1').textContent).toContain('estimate');
    t.go('#/');
    expect(t.$('[data-testid="stream-quote"]')).toBeNull(); // the quote exists now: it opens, it isn't made twice
    expect(t.$('[data-testid="stream-row"]').textContent).toContain('Open quote');
  });

  it('AC-40.2: Generate Bill from Note opens a bill with the job on it', async () => {
    t = setup();
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    t.go('#/');
    t.click('[data-testid="stream-bill"]');
    await until(() => t.$('[data-testid="bill-editor"]'));
    expect(t.$('h1').textContent).toContain('bill');
    expect(t.app.store.get().documents[0].job_id).toBeTruthy();
  });

  it('AC-40.3: the renewals list gives customer, equipment, urgency and value, and Remind opens the same preview as Renewals', async () => {
    t = setup();
    const row = t.$('[data-testid="renewals-watch"] .watch-row');
    expect(row.textContent).toContain('Anita Deshpande');
    expect(row.textContent).toContain('8 days left');
    expect(row.textContent).toContain('₹4,800');
    expect(row.querySelector('.pill-bad')).toBeTruthy();
    t.click(row.querySelector('[data-action="remind"]'));
    await until(() => t.$('[data-testid="reminder-sheet"]'));
    expect(t.$('[data-testid="reminder-sheet"]').textContent).toContain('Preview only');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(t.$('[data-testid="reminder-sheet"]')).toBeNull();
  });

  it('AC-40.4: GST this month adds only saved bills of this month', () => {
    const sum = gstThisMonth([bill(), bill({ status: 'paid' }), bill({ status: 'draft' }), bill({ status: 'cancelled' }), bill({ date: '2026-12-31' }), bill({ deleted: true }), bill({ type: 'quote' }),
      bill({ totals: { taxable: 50000, cgst: 0, sgst: 0, igst: 9000, round_off: 0, total: 59000 } })], '2027-01-15');
    expect(sum).toEqual({ count: 3, taxable: 250000, cgst: 18000, sgst: 18000, igst: 9000, total: 295000 });
    t = setup();
    expect(t.$('[data-testid="gst-card"]').textContent).toContain('No bills saved this month yet');
  });

  it('AC-40.5: a technician sees no money on Home', () => {
    t = setup({ signedInAs: 'st-santosh', me: undefined });
    t.go('#/');
    expect(t.$('[data-testid="gst-card"]')).toBeNull();
    expect(t.$('[data-testid="money-at-stake"]')).toBeNull();
    expect(t.$('[data-kpi="unpaid"]')).toBeNull();
  });
});

describe('US-42 The Home dashboard', () => {
  const headline = 'Bill, track stock, and manage field jobs all in one place.';
  const real = () => ({ ...meFor(PEOPLE['st-owner']), business: { id: 'b1', name: 'Shree Cool', is_demo: false, packs: ['field_service'], state_code: '20', gst_registration: 'regular' } });

  it('AC-42.1: the banner shows the headline, the next AMC, the reminder dots and three steps, on a real business too', () => {
    t = setup({ me: real(), api: fakeApi() });
    expect(t.$('h1').textContent).toBe(headline);
    expect(t.$('[data-testid="hero-new-bill"]').getAttribute('href')).toBe('#/bills/new');
    expect(t.$$('.hero-steps li')).toHaveLength(3);
    expect(t.$('[data-testid="see-how"]')).toBeNull();
  });

  it('AC-42.1: with Field service off the banner says nothing about jobs or WhatsApp', () => {
    const me = real();
    me.business.packs = [];
    me.permissions = me.permissions.filter((p) => !['use_chat', 'view_jobs', 'manage_renewals', 'verify_work', 'close_jobs', 'use_parts'].includes(p));
    t = setup({ me, api: fakeApi() });
    const hero = t.$('[data-testid="home-hero"]').textContent;
    expect(hero).toContain('Bill and track stock');
    expect(hero).not.toMatch(/WhatsApp|field jobs|AMC/);
    expect(t.$('.hero-steps')).toBeNull();
  });

  it('AC-42.2: Hide banner is remembered on this device, and the banner can come back', () => {
    t = setup();
    t.click('[data-testid="hero-hide"]');
    expect(t.$('[data-testid="home-hero"]')).toBeNull();
    expect(localStorage.getItem('kh-home-hero')).toBe('hidden');
    expect(t.$('h1').textContent).toBe('Home');
    t.go('#/bills');
    t.go('#/');
    expect(t.$('[data-testid="home-hero"]')).toBeNull();
    t.click('[data-testid="hero-show"]');
    expect(t.$('[data-testid="home-hero"]')).toBeTruthy();
  });

  it('AC-42.3: bills and jobs without a bill show in the table, newest first, with phone, items, amount, status and Share', async () => {
    t = setup();
    expect(t.$('[data-testid="recent-empty"]')).toBeTruthy();
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    t.go('#/');
    addDocs([bill()]);
    t.app.render();
    const rows = t.$$('[data-testid="recent-table"] tbody tr');
    expect(rows).toHaveLength(2);
    const billRow = rows.find((r) => r.textContent.includes('Mehta Clinic'));
    expect(billRow.textContent).toContain('AC service');
    expect(billRow.textContent).toContain('₹1,180');
    expect(billRow.querySelector('[data-testid="recent-share"]')).toBeTruthy();
    const jobRow = rows.find((r) => r.textContent.includes('Ramesh'));
    expect(jobRow.textContent).toContain('To bill');
    t.click(jobRow.querySelector('[data-testid="recent-bill"]'));
    await until(() => t.$('[data-testid="bill-editor"]'));
  });

  it('AC-42.4: the switch shows a Kanban board by status, is remembered, and the banner button does the same', async () => {
    t = setup();
    addDocs([bill({ number: '26-27/0001' }), bill({ number: '26-27/0002', status: 'paid' }), bill({ number: '26-27/0003', date: '2026-12-01', due_date: '2026-12-10' }), bill({ number: '', status: 'draft' }), bill({ number: '26-27/0004', status: 'cancelled' })]);
    t.app.render();
    expect(t.$('[data-testid="hero-view"]').textContent).toContain('Switch to Kanban Board View');
    t.click('[data-testid="recent-switch"] [data-view="kanban"]');
    expect(t.$('[data-testid="recent-table"]')).toBeNull();
    const col = (k) => t.$$(`[data-column="${k}"] [data-testid="kan-card"]`).length;
    expect([col('draft'), col('unpaid'), col('overdue'), col('paid')]).toEqual([1, 1, 1, 1]);
    expect(t.$('[data-column="unpaid"] .kan-sum').textContent).toBe('₹1,180');
    expect(t.$('[data-column="paid"] [data-testid="kan-card"]').getAttribute('href')).toContain('#/bills/');
    expect(localStorage.getItem('kh-home-view')).toBe('kanban');
    t.go('#/bills');
    t.go('#/');
    expect(t.$('[data-testid="recent-board"]')).toBeTruthy();
    expect(t.$('[data-testid="hero-view"]').textContent).toContain('Switch to Table View');
    t.click('[data-testid="hero-view"]');
    expect(t.$('[data-testid="recent-table"]')).toBeTruthy();
  });

  it('AC-42.5: the checklist ticks what is really done, and counts it', async () => {
    const api = fakeApi();
    t = setup({ api });
    await until(() => t.$('[data-testid="check-count"]')?.textContent === '2 of 3 done');
    const items = t.$$('.check-item');
    expect(items.map((x) => x.dataset.done)).toEqual(['true', 'true', 'false']);
    expect(items[2].textContent).toContain('Connect WhatsApp Cloud API');
    expect(items[2].querySelector('a').getAttribute('href')).toBe('#/settings');
  });
});

describe('US-41 Bills, Inventory, Team and Settings', () => {
  it('AC-41.1: the bills table shows number and date, customer and GSTIN, source, taxable with tax, total and status; GSTIN can be searched', () => {
    t = setup({ hash: '#/bills' });
    addDocs([bill(), bill({ number: '26-27/0002', customer: { name: 'Walk-in customer' }, job_id: 'J-1' })]);
    t.app.render();
    const rows = t.$$('.bill-table tbody tr');
    const row = rows.find((r) => r.textContent.includes('Mehta'));
    expect(row.textContent).toContain('27AAAAA0000A1Z5');
    expect(row.textContent).toContain('CGST ₹90 + SGST ₹90');
    expect(row.querySelector('[data-testid="bill-source"]').textContent).toContain('Counter');
    const other = rows.find((r) => r.textContent.includes('Walk-in'));
    expect(other.textContent).toContain('Unregistered (B2C)');
    expect(other.querySelector('[data-testid="bill-source"]').textContent).toContain('WhatsApp');
    const box = t.$('[data-bill-search]');
    box.value = '27aaaaa';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.$$('.bill-table tbody tr')).toHaveLength(1);
  });

  it('AC-41.2: a row has Send on WhatsApp and the PDF for a saved bill, for people who may make bills; a draft has neither', () => {
    const link = bill({ link_token: 'tok123' });
    const real = billRows([link], '2027-01-01', { make: true, demo: false });
    expect(real).toContain('data-testid="row-send"');
    expect(real).toContain('href="/b/tok123/pdf"');
    expect(billRows([link], '2027-01-01', { make: false, demo: false })).not.toContain('row-send');
    expect(billRows([link], '2027-01-01', { make: true, demo: true })).not.toContain('/pdf');
    const draft = billRows([bill({ status: 'draft', number: '' })], '2027-01-01', { make: true, demo: false });
    expect(draft).not.toContain('row-send');
    expect(draft).not.toContain('row-pdf');
  });

  it('AC-41.2: the answer of a send from a row shows on the list', async () => {
    t = setup({ hash: '#/bills' });
    window.open = vi.fn();
    addDocs([bill()]);
    t.app.render();
    t.click('[data-testid="row-send"]');
    await until(() => t.$('[data-testid="bills-notice"]'));
    expect(t.$('[data-testid="bills-notice"]').textContent).toContain('WhatsApp');
    expect(t.app.store.get().documents.at(-1).status).toBe('sent');
  });

  it('AC-41.3: − and + in the stock column write ordinary moves, keep the focus, and − stops at nothing in stock', () => {
    t = setup({ hash: '#/inventory' });
    const qty = (id) => t.$(`.inv-table tr[data-item="${id}"] [data-testid="qty"]`).textContent;
    expect(qty('it-cap45')).toBe('12 nos');
    t.click('[data-inv-step="it-cap45:in"]');
    expect(qty('it-cap45')).toBe('13 nos');
    expect(document.activeElement.dataset.invStep).toBe('it-cap45:in');
    t.click('[data-inv-step="it-cap45:out"]');
    t.click('[data-inv-step="it-cap45:out"]');
    expect(qty('it-cap45')).toBe('11 nos');
    const moves = t.app.store.get().stock_moves.filter((m) => m.item_id === 'it-cap45').slice(-3);
    expect(moves.map((m) => m.kind)).toEqual(['in', 'out', 'out']);
    expect(moves[1].note).toContain('Used without a job');
    const empty = t.$$('.inv-table tbody tr').find((r) => r.querySelector('.qty.is-out'));
    expect(empty.querySelector('[data-dir="out"]').disabled).toBe(true);
    expect(empty.querySelector('[data-dir="in"]').disabled).toBe(false);
  });

  it('AC-41.3: someone who may only see inventory gets no − or +', () => {
    t = setup({ signedInAs: 'st-owner', hash: '#/inventory' });
    t.app.session.set({ ...t.app.session.get(), permissions: t.app.session.get().permissions.filter((p) => p !== 'manage_inventory') });
    t.app.render();
    expect(t.$('[data-action="inv-step"]')).toBeNull();
    expect(t.$('.inv-table tbody tr .sku')).toBeTruthy();
  });

  it('AC-41.4: Admin has the team and forms on the left, roles and the log on the right', async () => {
    t = setup({ hash: '#/admin' });
    await until(() => t.$('[data-testid="team-list"]'));
    const left = t.$('.admin-split > .col-5');
    const right = t.$('.admin-split > .col-7');
    expect(left.querySelector('[data-testid="team-list"]')).toBeTruthy();
    expect(left.querySelector('#admin-add')).toBeTruthy();
    expect(left.querySelector('#admin-import')).toBeTruthy();
    expect(right.querySelector('[data-testid="role-matrix"]')).toBeTruthy();
  });

  it('AC-41.5: Settings has the forms on the left and the live paper in its own sticky column on the right', () => {
    t = setup({ hash: '#/settings' });
    const left = t.$('.settings-split > .col-6.stack');
    const right = t.$('.settings-preview');
    for (const id of ['[data-testid="packs-panel"]', '[data-testid="look-panel"]', '[data-testid="services"]', '[data-testid="theme-setting"]']) expect(left.querySelector(id)).toBeTruthy();
    expect(right.querySelector('[data-testid="look-preview"] .bill-paper')).toBeTruthy();
    expect(left.querySelector('[data-testid="look-preview"]')).toBeNull();
    expect(css).toMatch(/\.settings-preview \{ position: sticky; top: 96px;/);
  });
});
