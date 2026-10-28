import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-10 AMC visit plan', () => {
  it('AC-10.3: the job screen shows the AMC service visits from the server, with the next visit and its status', async () => {
    t = setup();
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    const id = t.app.store.get().jobs[0].id;
    t.go(`#/jobs/${id}`);
    await new Promise((r) => setTimeout(r, 0));
    const call = t.api.calls.find((c) => c.name === 'amcPlan');
    expect(call.args[0]).toMatchObject({ ends_on: '2027-03-15', every_days: 90, lead_days: 7 });
    expect(call.args[1]).toBe('2027-01-01');
    expect(t.$('[data-testid="plan-next"]').textContent).toContain('Overdue: tell the owner');
    expect(t.$$('[data-testid="visit-list"] li')).toHaveLength(3);
  });
});
