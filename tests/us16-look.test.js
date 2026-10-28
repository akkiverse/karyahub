import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-16 Business look', () => {
  it('AC-16.1: Home shows a "Today at" row with jobs, waiting checks, renewals in 30 days with money, and paperwork, from the data', async () => {
    t = setup();
    const kpi = (k) => t.$(`[data-kpi="${k}"]`).textContent;
    expect(t.$('[data-testid="today-kpis"]').textContent).toContain('Good to see you, Akash. Today at CoolCare AC Services');
    expect([kpi('jobs'), kpi('waiting'), kpi('due30'), kpi('docs')]).toEqual(['0', '0', '3', '0']);
    expect(t.$('[data-testid="today-kpis"]').textContent).toContain('₹17,900 at stake');
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    t.go('#/');
    expect([kpi('jobs'), kpi('waiting')]).toEqual(['1', '1']);
  });

  it('AC-16.2: every signed-in screen shows the business and who is signed in, with Sign out', () => {
    t = setup({ signedInAs: 'st-coord', hash: '#/jobs' });
    for (const h of ['#/', '#/chat', '#/jobs', '#/renewals']) {
      t.go(h);
      expect(t.$('.topbar-biz').textContent).toContain('CoolCare AC Services');
      expect(t.$('.nav-user').textContent).toContain('Priya Nair');
      expect(t.$('.nav-user').textContent).toContain('Office coordinator');
      expect(t.$('.nav-user [data-action="sign-out"]')).toBeTruthy();
    }
  });
});
