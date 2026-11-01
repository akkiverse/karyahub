import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample } from './helpers.js';
import { PERMISSIONS, ROLES, can, defaultPermissions, ACTION_PERMISSION, landingFor } from '../src/domain/access.js';
import { PEOPLE, meFor } from './fake-accounts.js';

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
    for (const [hash, name, leak] of [['#/renewals', 'Renewals', 'Send reminder'], ['#/settings', 'Settings', 'Reset demo'], ['#/admin', 'Admin', 'Activity log'], ['#/', 'Home', 'Money at stake'], ['#/doc/QT-2027-0001', 'Document', 'GSTIN']]) {
      t.go(hash);
      const d = t.$('[data-testid="access-denied"]');
      expect(d, hash).toBeTruthy();
      expect(d.textContent).toContain(`You don't have access to ${name}`);
      expect(d.textContent).toContain('Santosh Pawar (Technician)');
      expect(d.textContent).toContain('Ask your business owner to change your access in Admin');
      expect(t.$('main').textContent).not.toContain(leak);
    }
  });

  it('AC-14.3: an office coordinator works with Home, Chat, Jobs, Inventory and Renewals, can make quotes and close jobs, but not Admin or Settings', async () => {
    t = setup({ signedInAs: 'st-coord' });
    expect(navLabels(t)).toEqual(['Home', 'Chat', 'Jobs', 'Inventory', 'Renewals']); // Inventory added by CR-0011
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

  it("AC-14.4: a technician's proof-of-work step names them in the history, sends no role (the server knows it), and a step their access doesn't cover is refused here too", async () => {
    t = setup({ signedInAs: 'st-santosh' });
    const id = await approvedJob(t);
    const res = await t.app.actions.transition(id, 'request_otp');
    expect(res.error).toBeUndefined();
    const call = t.api.calls.find((c) => c.name === 'transition');
    expect(call.args[1].actor).toBe('Santosh Pawar (Technician)');
    expect(call.args[1]).not.toHaveProperty('actor_role');
    const refused = await t.app.actions.transition(id, 'close');
    expect(refused.error).toBe("Your access doesn't include this. Ask your business owner.");
    expect(t.api.calls.filter((c) => c.name === 'transition')).toHaveLength(1);
  });

  it('AC-14.5 (web side): the starting role table matches the server rules for every job action', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['owner', 'coordinator', 'technician']);
    expect(PERMISSIONS.find((p) => p.id === 'manage_team').roles).toEqual(['owner']);
    const tech = { permissions: defaultPermissions('technician') };
    const coord = { permissions: defaultPermissions('coordinator') };
    expect(can(tech, ACTION_PERMISSION.close)).toBe(false);
    expect(can(tech, ACTION_PERMISSION.verify_otp)).toBe(true);
    expect(can(coord, ACTION_PERMISSION.close)).toBe(true);
    expect(can(null, 'use_chat')).toBe(false);
  });

  it("AC-19.4 and AC-22.3 (screen): the server's permissions decide what opens, so an owner's switches change the screens", async () => {
    const tech = PEOPLE['st-santosh'];
    // A technician the owner allowed to close jobs and see renewals, and blocked from Chat
    const custom = meFor(tech, undefined, { permissions: [...defaultPermissions('technician').filter((p) => p !== 'use_chat'), 'close_jobs', 'manage_renewals'] });
    t = setup({ me: custom, hash: '#/chat' });
    expect(navLabels(t)).toEqual(['Jobs', 'Renewals']);
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy(); // Chat was switched off for this person
    t.go('#/renewals');
    expect(t.$('[data-testid="renewals-total"]')).toBeTruthy();
    t.app.unmount();
    // Nothing switched on at all: lands on My account with a plain explanation
    const none = meFor(tech, undefined, { permissions: [] });
    expect(landingFor(none)).toBe('#/account');
    t = setup({ me: none, hash: '#/account' });
    expect(t.root.textContent).toContain("hasn't given you access to anything yet");
  });

  it('AC-22.9: a platform admin sees only the Businesses screen and no business screens', () => {
    t = setup({ signedInAs: 'platform', hash: '#/chat' });
    expect(navLabels(t)).toEqual(['Businesses']);
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    expect(landingFor(meFor(PEOPLE.platform))).toBe('#/businesses');
    expect(t.$('.topbar-biz').textContent).toContain('KaryaHub platform');
    expect(t.$('.site-foot').textContent).not.toContain('Sample data');
    expect(t.$('.demo-pill')).toBeNull();
    expect(document.title).toBe('Chat · KaryaHub'); // no "demo" suffix outside the demo business
  });

  it('AC-22.2: real businesses show no demo wording, watermark or sample chips; the demo business does', async () => {
    const real = meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, { id: 'b-shree', name: 'Shree Cool AC', address: 'Nashik', gstin: '27AAAAA0000A1Z5', is_demo: false, active: true });
    t = setup({ me: real, hash: '#/' });
    expect(t.$('[data-testid="get-started"]').textContent).toContain('Add your team');
    expect(t.$('[data-testid="problem-cards"]')).toBeNull(); // no sales page for a firm that already signed up
    expect(t.$('h1').textContent).toBe('Home');
    expect(t.$('[data-testid="today-kpis"]').textContent).not.toContain('Sample data');
    t.go('#/chat');
    expect(t.$('.demo-pill')).toBeNull();
    expect(t.$('[data-testid="sample-picker"]')).toBeNull();
    expect(t.$('.site-foot').textContent).not.toContain('Sample data');
    expect(t.$('.nav-biz').textContent).toContain('Business workspace');
    t.go('#/settings');
    expect(t.$('[data-action="reset"]')).toBeNull(); // Reset demo is for the demo business only
    expect(t.$('[data-testid="mode-banner"]')).toBeNull();
    expect(t.$('form[data-form="business-profile"] input[name="name"]').value).toBe('Shree Cool AC');
    t.app.unmount();
    t = setup({ hash: '#/chat' });
    expect(t.$('.demo-pill')).toBeTruthy();
    expect(t.$('[data-testid="sample-picker"]')).toBeTruthy();
  });
});
