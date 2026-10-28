import { describe, it, expect, afterEach } from 'vitest';
import { setup } from './helpers.js';
import { demoState } from '../src/data/demo.js';

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
    expect(s.version).toBe(3); // v1 -> v2 (CR-0002) -> v3 (CR-0003)
    expect(s.staff.map((x) => x.role)).toEqual(['owner', 'coordinator', 'technician', 'technician']);
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

  it('AC-11.3: data saved by the 0.2.0 preview (version 2) loads with jobs and proof of work kept, and gains the demo team', () => {
    const v2 = savedByV010();
    v2.version = 2;
    v2.jobs[0].state = 'VERIFIED';
    v2.jobs[0].events = [{ id: 'ev-1', action: 'verify_otp', from_state: 'WORK_DONE', to_state: 'VERIFIED', client_op_id: 'op-1', actor: 'Owner', channel: 'web', detail: 'Customer confirmed with the code' }];
    t = setup({ saved: v2, hash: '#/jobs/J-0001' });
    const s = t.app.store.get();
    expect(s.version).toBe(3);
    expect(s.jobs[0].state).toBe('VERIFIED');
    expect(s.jobs[0].events).toHaveLength(1);
    expect(s.staff).toHaveLength(4);
    expect(s.access_log).toEqual([]);
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Verified by customer');
  });
});
