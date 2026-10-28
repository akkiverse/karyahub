import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { fakeApi } from './fake-api.js';

let t;
afterEach(() => t?.app.unmount());
const tick = () => new Promise((r) => setTimeout(r, 0));

async function approvedJob(opts) {
  t = setup(opts);
  await sendSample(t, 's-ramesh');
  t.click('[data-action="approve"]');
  const id = t.app.store.get().jobs[0].id;
  t.go(`#/jobs/${id}`);
  return id;
}

describe('US-9 Proof of work', () => {
  it('AC-9.1: an approved job starts as "Work done, waiting for customer check" with who reported it, and the Jobs list shows its status', async () => {
    const id = await approvedJob();
    const job = t.app.store.get().jobs[0];
    expect(job.state).toBe('WORK_DONE');
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Work done, waiting for customer check');
    expect(t.$('[data-testid="job-timeline"]').textContent).toContain('Reported done by Santosh on WhatsApp');
    t.go('#/jobs');
    expect(t.$(`[data-job="${id}"]`).textContent).toContain('Work done');
  });

  it('AC-9.2: Send code, enter the customer\'s code, then Close moves the job to Verified and Closed through the server', async () => {
    const id = await approvedJob();
    t.click('[data-wf="request_otp"]');
    await tick();
    expect(t.$('[data-testid="demo-code"]').textContent).toContain('123456');
    const req = t.api.calls.find((c) => c.name === 'transition').args[1];
    expect(req).toMatchObject({ state: 'WORK_DONE', action: 'request_otp', channel: 'web' });
    expect(req.payload.phone).toBe('9876543210');
    t.$('[data-form="verify-otp"] input[name="code"]').value = '123 456';
    t.$('[data-form="verify-otp"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(t.app.store.get().jobs[0].state).toBe('VERIFIED');
    expect(t.$('[data-testid="job-state"]').textContent).toBe('Verified by customer');
    t.click('[data-wf="close"]');
    await tick();
    const job = t.app.store.get().jobs.find((j) => j.id === id);
    expect(job.state).toBe('CLOSED');
    expect(job.events.map((e) => e.action)).toEqual(['report_done', 'request_otp', 'verify_otp', 'close']);
    expect(new Set(t.api.calls.filter((c) => c.name === 'transition').map((c) => c.args[1].client_op_id)).size).toBe(3);
  });

  it('AC-9.3: a wrong code shows "That code doesn\'t match or has expired. Send a new code." and the job stays unverified', async () => {
    await approvedJob();
    t.click('[data-wf="request_otp"]');
    await tick();
    t.$('[data-form="verify-otp"] input[name="code"]').value = '000000';
    t.$('[data-form="verify-otp"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(t.$('[data-testid="wf-note"]').textContent).toBe("That code doesn't match or has expired. Send a new code.");
    expect(t.app.store.get().jobs[0].state).toBe('WORK_DONE');
  });

  it('AC-9.6: if the server cannot be reached, proof-of-work steps explain it and nothing changes', async () => {
    t = setup({ api: fakeApi() });
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    const id = t.app.store.get().jobs[0].id;
    t.app.unmount();
    const saved = JSON.parse(localStorage.getItem('karyahub.demo.v1'));
    t = setup({ api: fakeApi({ unreachable: true }), saved, hash: `#/jobs/${id}` });
    t.click('[data-wf="request_otp"]');
    await tick();
    expect(t.$('[data-testid="wf-note"]').textContent).toContain("Couldn't reach the KaryaHub server");
    expect(t.app.store.get().jobs[0].state).toBe('WORK_DONE');
    expect(t.app.store.get().jobs[0].events).toHaveLength(1);
  });
});
