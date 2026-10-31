import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor, REAL_BUSINESS } from './fake-accounts.js';
import { until } from './helpers.js';

const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';
let t;
afterEach(() => { t?.app.unmount(); t = null; });

const owner = () => meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, REAL_BUSINESS);
const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };

/** Open the app as a real business's owner. Unlike tests/helpers.js this keeps what is already on the device. */
function open({ api = fakeApi(), me = owner(), hash = '#/', keep = false, preload, logoImage, ...rest } = {}) {
  if (!keep) localStorage.clear();
  if (preload) localStorage.setItem(`karyahub.biz.v1.${REAL_BUSINESS.id}`, JSON.stringify(preload));
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { ...FAST, api, me, logoImage, ...rest });
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  return { app, root, $, $$, api, go: (h) => app.navigate(h), settle: () => vi.waitFor(() => { if (app.actions.isBusy()) throw new Error('busy'); }, { timeout: 4000, interval: 5 }) };
}

async function say(x, text) {
  x.go('#/chat');
  const input = x.$('#composer-input');
  input.value = text;
  x.$('form[data-form="send-text"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await x.settle();
}
const RAMESH = 'Gas refill for Mr Anil Kumar, Voltas 1.5 ton split AC, phone 99000 00150, charge 2500';
async function approveJob(x, text = RAMESH) {
  await say(x, text);
  x.$('[data-action="approve"]').click();
  return x.app.store.get().jobs[0];
}
const serverJobs = (api) => [...api.server.records.values()].filter((r) => r.kind === 'job');
const chip = (x) => x.$('[data-testid="sync-status"]');

describe('US-23 Business data on the server', () => {
  it('AC-23.8: a real business loads its data from the server, and the demo business never syncs', async () => {
    const api = fakeApi();
    api.server.records.set('customer:c1', { kind: 'customer', id: 'c1', number: '', seq: 1, body: { name: 'Ramesh Sharma', phone: '9822200010', area: 'Kothrud', amc_expiry: '', amc_value: 0 } });
    api.server.records.set('job:j1', { kind: 'job', id: 'j1', number: 'J-0001', seq: 2, body: { customer_id: 'c1', customer_name: 'Ramesh Sharma', date: '2027-01-01', state: 'WORK_DONE', events: [], lines: [] } });
    api.server.counters.seq = 2;
    t = open({ api, hash: '#/jobs' });
    await until(() => t.$('[data-job="j1"]'));
    expect(t.$('[data-job="j1"]').textContent).toContain('Ramesh Sharma');
    expect(t.$('[data-job="j1"]').textContent).toContain('J-0001');
    await until(() => chip(t)?.textContent.includes('All saved'));
    expect(api.syncCalls[0].since).toBe(0);
    t.app.unmount();
    const demoApi = fakeApi();
    t = open({ api: demoApi, me: meFor(PEOPLE['st-owner']), hash: '#/jobs' });
    await new Promise((r) => setTimeout(r, 60));
    expect(demoApi.syncCalls).toHaveLength(0);
    expect(chip(t)).toBeNull();
  });

  it('AC-23.1: a job approved in Chat is saved on the server, numbered by it, and shown as New until then', async () => {
    const api = fakeApi();
    api.network.offline = true;
    t = open({ api });
    const job = await approveJob(t);
    expect(job.id).toMatch(/^J-[0-9a-z]{16}$/); // a unique id made on the phone, not a counter
    expect(job.number).toBe('');
    t.go('#/jobs');
    expect(t.$('[data-job]').textContent).toContain('New');
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => t.app.store.get().jobs[0].number === 'J-0001');
    expect(serverJobs(api)).toHaveLength(1);
    expect([...api.server.records.values()].filter((r) => r.kind === 'customer')).toHaveLength(1);
    expect(t.$('[data-job]').textContent).toContain('J-0001');
    expect(chip(t).textContent).toContain('All saved');
  });

  it('AC-23.9: changes made with no signal are kept on the phone, counted on screen, and sent once when it returns, even after the app was closed', async () => {
    const api = fakeApi();
    api.network.offline = true;
    t = open({ api });
    await approveJob(t);
    await until(() => /waiting/.test(chip(t).textContent));
    expect(chip(t).textContent).toMatch(/\d+ waiting, offline/);
    expect(chip(t).getAttribute('data-pending')).not.toBe('0');
    const queued = Number(chip(t).getAttribute('data-pending'));
    t.app.unmount();
    // The app is closed and opened again later, still with no signal: the queue is still there.
    t = open({ api, keep: true });
    await until(() => Number(chip(t)?.getAttribute('data-pending')) === queued);
    expect(serverJobs(api)).toHaveLength(0);
    api.network.offline = false;
    await t.app.sync.flush();
    await until(() => chip(t).textContent.includes('All saved'));
    expect(serverJobs(api)).toHaveLength(1);
    expect(t.app.store.get().jobs).toHaveLength(1);
    expect(t.app.store.get().jobs[0].number).toBe('J-0001');
  });

  it('AC-23.4: when the answer is lost, the same operations are sent again and nothing is duplicated', async () => {
    const api = fakeApi();
    api.network.loseNext = 1; // the server applies the first batch but the phone never hears back
    t = open({ api });
    await approveJob(t);
    await t.app.sync.flush();
    await until(() => chip(t).textContent.includes('All saved'));
    expect(serverJobs(api)).toHaveLength(1);
    expect([...api.server.records.values()].filter((r) => r.kind === 'customer')).toHaveLength(1);
    const sent = api.syncCalls.flatMap((c) => c.ops.map((o) => o.op_id));
    expect(new Set(sent).size).toBeLessThan(sent.length); // the same operation ids went twice
    expect(api.server.counters.job).toBe(1); // and the server numbered the job once
  });

  it('AC-23.10: a server fault keeps the queue and tries again; a refused change is shown with its reason and the server version is put back', async () => {
    const api = fakeApi();
    api.network.failNext = 1;
    t = open({ api });
    await approveJob(t);
    await until(() => serverJobs(api).length === 1, { timeout: 3000 }); // the retry got through
    api.network.deny = ['document'];
    const job = t.app.store.get().jobs[0];
    t.app.store.update((s) => { s.documents.unshift({ id: 'd-test-1', number: '', job_id: job.id, type: 'quote', lines: [{ description: 'Service', qty: 1, rate: 500 }], total: 590, date: '2027-01-01' }); });
    await t.app.sync.flush();
    await until(() => t.$('[data-testid="sync-rejected"]'));
    expect(t.$('[data-testid="sync-rejected"]').textContent).toContain("Your access doesn't include this");
    expect(t.app.store.get().documents).toHaveLength(0); // the document the server refused is taken off this phone
    t.$('[data-action="dismiss-sync-rejected"]').click();
    expect(t.$('[data-testid="sync-rejected"]')).toBeNull();
  });

  it("AC-23.6: a proof-of-work step waits for the job to reach the server, and the server's state is not sent back as a change", async () => {
    const api = fakeApi();
    api.network.offline = true;
    t = open({ api });
    const job = await approveJob(t);
    t.go(`#/jobs/${job.id}`);
    const stuck = await t.app.actions.transition(job.id, 'request_otp');
    expect(stuck.error).toContain('still waiting to be sent');
    api.network.offline = false;
    const ok = await t.app.actions.transition(job.id, 'request_otp');
    expect(ok.error).toBeUndefined();
    expect(api.calls.filter((c) => c.name === 'transition')).toHaveLength(1);
    const sentBefore = api.syncCalls.flatMap((c) => c.ops).length;
    await t.app.sync.flush();
    expect(api.syncCalls.flatMap((c) => c.ops).length).toBe(sentBefore); // a step is the server's own record, nothing to send
  });

  it('AC-23.7 and AC-23.8: what was on this phone before is moved to the server once, with a notice, and not again', async () => {
    const preload = {
      version: 4,
      settings: { business_name: 'Shree Cool AC', address: 'Nashik', gstin: '', is_demo: false, mode: 'server', simulate_failure: false, theme: 'system' },
      customers: [{ id: 'n0001', name: 'Ramesh Sharma', phone: '9822200010', area: 'Kothrud', equipment: '', amc_expiry: '', amc_value: 0, reminded_at: null }],
      jobs: [
        { id: 'J-0002', customer_id: 'n0001', customer_name: 'Ramesh Sharma', phone: '9822200010', date: '2027-01-02', work_done: 'Filter', lines: [], state: 'WORK_DONE', events: [], otp: null },
        { id: 'J-0001', customer_id: 'n0001', customer_name: 'Ramesh Sharma', phone: '9822200010', date: '2027-01-01', work_done: 'Gas', lines: [], state: 'CLOSED', events: [], otp: null },
      ],
      documents: [{ id: 'QT-2027-0001', job_id: 'J-0001', type: 'quote', lines: [], total: 590, date: '2027-01-01', sent: true }],
      messages: [{ id: 'm-welcome', from: 'bot', kind: 'text', body: 'Namaste', at: '2027-01-01T09:00:00' }, { id: 'm-0001', from: 'technician', kind: 'text', body: 'Gas refill', at: '2027-01-01T10:00:00' }],
      seq: { job: 2, quote: 1, invoice: 0, msg: 1, customer: 1 },
    };
    const api = fakeApi();
    t = open({ api, preload, hash: '#/jobs' });
    await until(() => t.$('[data-testid="sync-notice"]'));
    expect(t.$('[data-testid="sync-notice"]').textContent).toContain('We moved 5 items from this phone');
    expect(api.importCalls).toHaveLength(1);
    expect(api.importCalls[0].job.map((j) => j.id)).toEqual(['J-0002', 'J-0001']);
    await until(() => t.$$('[data-job]').length === 2);
    expect(t.$$('[data-job]').map((r) => r.textContent.match(/J-\d{4}/)[0]).sort()).toEqual(['J-0001', 'J-0002']); // numbers kept
    expect(t.app.store.get().documents[0].number).toBe('QT-2027-0001');
    expect(serverJobs(api)).toHaveLength(2);
    t.app.unmount();
    t = open({ api, keep: true, hash: '#/jobs' }); // signing in again on the same phone
    await until(() => t.$$('[data-job]').length === 2);
    await new Promise((r) => setTimeout(r, 40));
    expect(api.importCalls).toHaveLength(1);
    expect(t.$$('[data-job]')).toHaveLength(2);
    expect(serverJobs(api)).toHaveLength(2);
  });

  it('AC-23.3: when the owner takes a kind of record away, this phone stops showing it', async () => {
    const api = fakeApi();
    t = open({ api });
    const job = await approveJob(t);
    t.app.store.update((s) => { s.documents.unshift({ id: 'd-x', number: '', job_id: job.id, type: 'quote', lines: [], total: 0, date: '2027-01-01' }); });
    await t.app.sync.flush();
    expect(t.app.store.get().documents).toHaveLength(1);
    api.network.readable = ['customer', 'job', 'message'];
    await t.app.sync.flush();
    expect(t.app.store.get().documents).toHaveLength(0);
    expect(t.app.store.get().jobs).toHaveLength(1);
  });

  it('AC-23.11: the owner adds a logo in Settings, it shows on documents, and can be removed', async () => {
    const api = fakeApi();
    const logoImage = vi.fn(async () => PNG_URL);
    t = open({ api, hash: '#/settings', logoImage });
    expect(t.$('[data-testid="logo-field"]').textContent).toContain('No logo yet');
    const input = t.$('input[name="logo"]');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'logo.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => t.$('[data-testid="logo-preview"]'));
    expect(logoImage).toHaveBeenCalled();
    expect(api.server.logo).toBe(PNG_URL);
    expect(t.$('[data-testid="logo-preview"]').getAttribute('src')).toBe('/api/v1/business/logo?v=abc123def456');
    expect(t.$('[data-testid="profile-notice"]').textContent).toContain('logo now shows on your quotes');
    t.app.store.update((s) => { s.documents.unshift({ id: 'd-y', number: 'QT-2027-0001', job_id: 'j', type: 'quote', customer: { name: 'Ramesh Sharma', phone: '9822200010', area: '' }, lines: [], subtotal: 0, cgst: 0, sgst: 0, total: 0, roundOff: 0, invalid: 0, date: '2027-01-01' }); }, { remote: true });
    t.go('#/doc/d-y');
    expect(t.$('[data-testid="doc-logo"]').getAttribute('src')).toContain('/api/v1/business/logo?v=abc123def456');
    t.go('#/settings');
    t.$('[data-action="remove-logo"]').click();
    await until(() => t.$('[data-testid="logo-field"]')?.textContent.includes('No logo yet'));
    expect(api.server.logo).toBe('');
  });

  it('AC-23.11: the demo business has no logo controls', () => {
    t = open({ me: meFor(PEOPLE['st-owner']), hash: '#/settings' });
    expect(t.$('[data-testid="logo-field"]')).toBeNull();
  });

  it('AC-22.11: the Add a person button at the top of Admin stays on Admin and puts the cursor in the form', async () => {
    t = open({ hash: '#/admin' });
    await until(() => t.$('[data-testid="add-person-top"]'));
    const button = t.$('[data-testid="add-person-top"]');
    expect(button.tagName).toBe('BUTTON'); // it used to be a link to "#admin-add", which the app read as a page and sent Home
    button.click();
    expect(window.location.hash).toBe('#/admin');
    expect(t.$('h1').textContent).toBe('Admin');
    expect(document.activeElement).toBe(t.$('#admin-add input[name="name"]'));
  });
});
