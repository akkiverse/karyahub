import { describe, it, expect, afterEach } from 'vitest';
import { setup } from './helpers.js';
import { demoState } from '../src/data/demo.js';
import { businessStorageKey, createStore } from '../src/store.js';
import { DEMO_BUSINESS, REAL_BUSINESS } from './fake-accounts.js';

let t;
afterEach(() => t?.app.unmount());

// A state object exactly as KaryaHub v0.1.0 saved it (version 1, jobs without workflow fields).
function savedByV010() {
  const s = demoState();
  s.version = 1;
  s.settings.mode = 'mock';
  s.customers[0].reminded_at = '2027-01-01';
  s.jobs = [{ id: 'J-0001', customer_id: 'n0001', customer_name: 'Ramesh Sharma', phone: '9876543210', area: 'Kothrud', equipment: 'Voltas 1.5T split AC', date: '2027-01-01', work_done: 'Gas refill', parts: 'R32 refrigerant', amc_expiry: '2027-03-15', amc_value: 6500, lines: [{ description: 'Gas refill', qty: 1, rate: 2500 }], source_sample_id: 's-ramesh', approved_at: '2027-01-01T10:05:00' }];
  s.documents = [{ id: 'QT-2027-0001', job_id: 'J-0001', type: 'quote', customer: { name: 'Ramesh Sharma' }, lines: [{ description: 'Gas refill', qty: 1, rate: 2500 }], subtotal: 2500, cgst: 225, sgst: 225, roundOff: 0, total: 2950, date: '2027-01-01', sent: true }];
  s.seq.job = 1; s.seq.quote = 1;
  return s;
}

describe('US-11 Existing data keeps working', () => {
  it('AC-11.1: data saved by v0.1.0 loads with jobs, documents, customers and settings kept, and jobs gain a workflow state', () => {
    t = setup({ saved: savedByV010(), hash: '#/jobs/J-0001' });
    const s = t.app.store.get();
    expect(s.version).toBe(5); // v1 -> v2 (CR-0002) -> v3 (CR-0003) -> v4 (CR-0005) -> v5 (CR-0011)
    expect(s.staff).toBeUndefined(); // the team now lives on the server
    expect(s.settings.mode).toBe('mock');
    expect(s.jobs).toHaveLength(1);
    expect(s.documents).toHaveLength(1);
    expect(s.customers[0].reminded_at).toBe('2027-01-01');
    expect(s.jobs[0].state).toBe('WORK_DONE');
    expect(s.jobs[0].events).toHaveLength(1);
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Work done, waiting for customer check');
    t.go('#/doc/QT-2027-0001');
    expect(t.root.textContent).toContain('2,950');
  });

  it('AC-11.3: data saved by the 0.2.0 preview (version 2) loads with jobs and proof of work kept', () => {
    const v2 = savedByV010();
    v2.version = 2;
    v2.jobs[0].state = 'VERIFIED';
    v2.jobs[0].events = [{ id: 'ev-1', action: 'verify_otp', from_state: 'WORK_DONE', to_state: 'VERIFIED', client_op_id: 'op-1', actor: 'Owner', channel: 'web', detail: 'Customer confirmed with the code' }];
    t = setup({ saved: v2, hash: '#/jobs/J-0001' });
    const s = t.app.store.get();
    expect(s.version).toBe(5);
    expect(s.jobs[0].state).toBe('VERIFIED');
    expect(s.jobs[0].events).toHaveLength(1);
    expect(s.staff).toBeUndefined();
    expect(s.access_log).toBeUndefined();
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Verified by customer');
  });

  it('AC-22.8: data saved by v0.3.0 (version 3, with the on-device team) loads for the demo business without the team and keeps jobs and documents', () => {
    const v3 = savedByV010();
    v3.version = 3;
    v3.staff = [{ id: 'st-owner', name: 'Akash Mehta', role: 'owner', pin_hash: 'x' }];
    v3.access_log = [{ id: 'log-1', who: 'Akash Mehta', text: 'Signed in', at: '2027-01-01T09:00:00' }];
    v3.seq.staff = 1; v3.seq.log = 1;
    v3.jobs[0].state = 'WORK_DONE';
    v3.jobs[0].events = [{ id: 'ev-1', action: 'report_done', client_op_id: 'op-1', detail: 'x' }];
    t = setup({ saved: v3, hash: '#/jobs/J-0001' });
    const s = t.app.store.get();
    expect(s.version).toBe(5);
    expect(s.staff).toBeUndefined();
    expect(s.access_log).toBeUndefined();
    expect(s.seq.staff).toBeUndefined();
    expect(s.jobs).toHaveLength(1);
    expect(s.documents).toHaveLength(1);
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Work done, waiting for customer check');
  });

  it('AC-22.8: each business keeps its own data on this device, a new business starts empty, and switching back restores each', () => {
    localStorage.clear();
    const store = createStore();
    store.switchTo(DEMO_BUSINESS);
    store.update((s) => { s.customers[0].name = 'Changed in the demo'; s.jobs.push({ id: 'J-DEMO' }); });
    store.switchTo(REAL_BUSINESS);
    expect(store.get().customers).toEqual([]);
    expect(store.get().jobs).toEqual([]);
    expect(store.get().settings).toMatchObject({ business_name: 'Shree Cool AC', is_demo: false });
    expect(store.get().messages).toHaveLength(1); // just the welcome message, no sample chat
    store.update((s) => { s.jobs.push({ id: 'J-SHREE' }); });
    store.switchTo(DEMO_BUSINESS);
    expect(store.get().customers[0].name).toBe('Changed in the demo');
    expect(store.get().jobs.map((j) => j.id)).toEqual(['J-DEMO']);
    store.switchTo(REAL_BUSINESS);
    expect(store.get().jobs.map((j) => j.id)).toEqual(['J-SHREE']);
    expect(localStorage.getItem(businessStorageKey('b-shree'))).toContain('J-SHREE');
    expect(localStorage.getItem(businessStorageKey('b-demo'))).not.toContain('J-SHREE');
    store.close(); // signing out forgets the business: nothing more is saved against it
    store.update((s) => { s.jobs.push({ id: 'J-AFTER' }); });
    expect(localStorage.getItem(businessStorageKey('b-shree'))).not.toContain('J-AFTER');
  });
});
