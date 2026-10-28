import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { PERMISSIONS, ROLES, can, ACTION_PERMISSION } from '../src/domain/access.js';

let t;
afterEach(() => t?.app.unmount());

const navLabels = (t) => t.$$('nav.tabs .tab span').map((s) => s.textContent);

async function approvedJob(t) {
  await sendSample(t, 's-ramesh');
  t.click('[data-action="approve"]');
  return t.app.store.get().jobs[0].id;
}

describe('US-14 Roles and limited access', () => {
  it('AC-14.1: a technician lands on Chat, sees only Chat and Jobs, and job screens hide paperwork and closing', async () => {
    t = setup({ signedInAs: 'st-santosh', hash: '#/chat' });
    expect(navLabels(t)).toEqual(['Chat', 'Jobs']);
    expect(t.$$('nav.bottom-tabs .tab span').map((s) => s.textContent)).toEqual(['Chat', 'Jobs']);
    const id = await approvedJob(t);
    t.go(`#/jobs/${id}`);
    expect(t.$('[data-action="create-doc"]')).toBeNull();
    expect(t.$('[data-testid="docs-hidden"]').textContent).toBe('Quotes and invoices are made by the office.');
    t.app.store.update((s) => { s.jobs[0].state = 'VERIFIED'; });
    expect(t.$('[data-wf="close"]')).toBeNull();
    expect(t.$('[data-testid="close-hidden"]').textContent).toBe('Verified. The office closes the job.');
  });

  it("AC-14.2: a technician opening Home, Renewals, Settings, Admin or a document gets a plain no-access page and none of that screen's content", () => {
    t = setup({ signedInAs: 'st-santosh', hash: '#/renewals' });
    for (const [hash, name, leak] of [['#/renewals', 'Renewals', 'Send reminder'], ['#/settings', 'Settings', 'Reset demo'], ['#/admin', 'Admin', 'Access log'], ['#/', 'Home', 'Money at stake'], ['#/doc/QT-2027-0001', 'Document', 'GSTIN']]) {
      t.go(hash);
      const d = t.$('[data-testid="access-denied"]');
      expect(d, hash).toBeTruthy();
      expect(d.textContent).toContain(`You don't have access to ${name}`);
      expect(d.textContent).toContain('Santosh Pawar (Technician)');
      expect(d.textContent).toContain('Ask the owner to change your role in Admin');
      expect(t.$('main').textContent).not.toContain(leak);
    }
  });

  it('AC-14.3: an office coordinator works with Home, Chat, Jobs and Renewals, can make quotes and close jobs, but not Admin or Settings', async () => {
    t = setup({ signedInAs: 'st-coord' });
    expect(navLabels(t)).toEqual(['Home', 'Chat', 'Jobs', 'Renewals']);
    expect(t.$('.account-menu').textContent).not.toContain('Settings');
    const id = await approvedJob(t);
    t.go(`#/jobs/${id}`);
    expect(t.$('[data-action="create-doc"][data-type="quote"]')).toBeTruthy();
    t.app.store.update((s) => { s.jobs[0].state = 'VERIFIED'; });
    expect(t.$('[data-wf="close"]')).toBeTruthy();
    t.go('#/admin');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    t.go('#/settings');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
  });

  it("AC-14.4: a technician's proof-of-work step tells the server who they are and their role, and the history names them", async () => {
    t = setup({ signedInAs: 'st-santosh' });
    const id = await approvedJob(t);
    const res = await t.app.actions.transition(id, 'request_otp');
    expect(res.error).toBeUndefined();
    const call = t.api.calls.find((c) => c.name === 'transition');
    expect(call.args[1]).toMatchObject({ actor: 'Santosh Pawar (Technician)', actor_role: 'technician' });
    const refused = await t.app.actions.transition(id, 'close');
    expect(refused.error).toBe("Your role (Technician) can't do this. Ask the owner or the office coordinator.");
    expect(t.api.calls.filter((c) => c.name === 'transition')).toHaveLength(1);
  });

  it('AC-14.5 (web side): the role table matches the server rules for every job action', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['owner', 'coordinator', 'technician']);
    expect(PERMISSIONS.find((p) => p.id === 'manage_team').roles).toEqual(['owner']);
    expect(can('technician', ACTION_PERMISSION.close)).toBe(false);
    expect(can('technician', ACTION_PERMISSION.verify_otp)).toBe(true);
    expect(can('coordinator', ACTION_PERMISSION.close)).toBe(true);
  });
});
