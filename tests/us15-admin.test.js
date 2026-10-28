import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup } from './helpers.js';

let t;
afterEach(() => t?.app.unmount());
const tick = () => new Promise((r) => setTimeout(r, 0));
const waitFor = (fn) => vi.waitFor(fn, { timeout: 2000, interval: 5 });

async function addStaff(t, { name, phone, role, pin }) {
  const f = t.$('form[data-form="add-staff"]');
  f.elements.name.value = name; f.elements.phone.value = phone; f.elements.role.value = role; f.elements.pin.value = pin;
  f.requestSubmit();
  await waitFor(() => { if (!t.$('[data-testid="admin-notice"]') && !t.$('[data-form="add-staff"] [aria-invalid="true"]')) throw new Error('waiting'); });
}
async function trySignIn(t, phone, pin) {
  const res = await t.app.team.signIn(phone, pin);
  return res;
}

describe('US-15 Admin panel', () => {
  it('AC-15.1: Admin shows staff counts by role, the team, Add staff, the roles table and the access log', () => {
    t = setup({ hash: '#/admin' });
    const kpis = t.$('[data-testid="admin-kpis"]').textContent;
    expect(kpis).toContain('Active staff');
    expect(t.$$('[data-testid="admin-kpis"] .kpi-value').map((e) => e.textContent)).toEqual(['4', '1', '1', '2']);
    const rows = t.$$('[data-testid="team-list"] .member');
    expect(rows).toHaveLength(4);
    expect(rows[1].textContent).toContain('Priya Nair');
    expect(rows[1].textContent).toContain('99000 00202');
    expect(rows[1].querySelector('select').value).toBe('coordinator');
    expect(rows[1].querySelector('[data-testid="member-status"]').textContent).toBe('Active');
    expect(t.$('form[data-form="add-staff"]')).toBeTruthy();
    expect(t.$$('[data-testid="role-matrix"] tbody tr')).toHaveLength(9);
    expect(t.root.textContent).toContain('Access log');
  });

  it('AC-15.2: a new technician is added, logged, and can sign in with technician access', async () => {
    t = setup({ hash: '#/admin' });
    await addStaff(t, { name: 'Neha Kulkarni', phone: '9900000299', role: 'technician', pin: '4321' });
    expect(t.$('[data-testid="admin-notice"]').textContent).toContain('Neha Kulkarni was added as Technician');
    expect(t.$('[data-testid="team-list"]').textContent).toContain('Neha Kulkarni');
    expect(t.app.store.get().access_log[0].text).toBe('Added Neha Kulkarni as Technician');
    t.click('.account-menu [data-action="sign-out"]');
    const res = await trySignIn(t, '9900000299', '4321');
    expect(res.user).toMatchObject({ name: 'Neha Kulkarni', role: 'technician' });
    t.app.navigate('#/chat');
    expect(t.$$('nav.tabs .tab span').map((s) => s.textContent)).toEqual(['Chat', 'Jobs']);
  });

  it('AC-15.3: bad name, number or PIN each show their own message and nobody is added', async () => {
    t = setup({ hash: '#/admin' });
    await addStaff(t, { name: 'N', phone: '12345', role: 'technician', pin: '12' });
    const errs = t.$$('[data-form="add-staff"] .field-error').map((e) => e.textContent);
    expect(errs).toEqual(["Enter the person's name (2 to 60 letters).", 'Use a 10-digit mobile number.', 'Use a PIN of 4 to 6 digits.']);
    await addStaff(t, { name: 'Copy Cat', phone: '9900000202', role: 'technician', pin: '1234' });
    expect(t.$('[data-form="add-staff"] .field-error').textContent).toBe('Someone on the team already uses this number.');
    expect(t.app.store.get().staff).toHaveLength(4);
  });

  it("AC-15.4: changing Priya's role to Technician changes what she can open and is logged", async () => {
    t = setup({ hash: '#/admin' });
    const sel = t.$('select[data-action="set-role"][data-staff="st-coord"]');
    sel.value = 'technician';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.app.store.get().staff.find((s) => s.id === 'st-coord').role).toBe('technician');
    expect(t.app.store.get().access_log[0].text).toBe("Changed Priya Nair's role from Office coordinator to Technician");
    t.app.session.start('st-coord', '2027-01-01T10:00:00');
    t.go('#/renewals');
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
  });

  it("AC-15.5: turning off access blocks sign-in and ends that person's open session; turning it on restores it", async () => {
    t = setup({ hash: '#/admin' });
    t.click('[data-action="toggle-access"][data-staff="st-santosh"]');
    expect(t.$('[data-staff="st-santosh"] [data-testid="member-status"]').textContent).toBe('Access off');
    expect((await trySignIn(t, '9900000203', '8642')).error).toContain("don't match an active staff account");
    t.app.session.start('st-santosh', '2027-01-01T10:00:00');
    t.app.render();
    expect(t.$('[data-testid="signin-notice"]').textContent).toBe('Your access has been turned off. Ask the owner if you think this is a mistake.');
    t.app.session.start('st-owner', '2027-01-01T10:00:00');
    t.go('#/admin');
    t.click('[data-action="toggle-access"][data-staff="st-santosh"]');
    expect((await trySignIn(t, '9900000203', '8642')).user.name).toBe('Santosh Pawar');
  });

  it('AC-15.6: Reset PIN shows a new 4-digit PIN once; the old PIN stops working and the new one works', async () => {
    t = setup({ hash: '#/admin', random: () => 0.5 });
    t.click('[data-action="reset-pin"][data-staff="st-imran"]');
    await waitFor(() => { if (!t.$('[data-testid="admin-notice"]')) throw new Error('waiting'); });
    expect(t.$('[data-testid="admin-notice"]').textContent).toBe('New PIN for Imran Khan: 5500. Share it with them in person; the old PIN no longer works.');
    expect(JSON.stringify(t.app.store.get())).not.toContain('5500');
    expect((await trySignIn(t, '9900000204', '9753')).error).toBeTruthy();
    expect((await trySignIn(t, '9900000204', '5500')).user.name).toBe('Imran Khan');
  });

  it('AC-15.7: owners cannot change their own role, turn off their own access, or remove the last active owner', async () => {
    t = setup({ hash: '#/admin' });
    expect(t.$('select[data-action="set-role"][data-staff="st-owner"]').disabled).toBe(true);
    expect(t.$('[data-action="toggle-access"][data-staff="st-owner"]')).toBeNull();
    expect(t.app.team.updateStaff('st-owner', { role: 'technician' }).error).toBe("You can't change your own role or turn off your own access. Ask another owner.");
    // A second owner may not demote the only other owner either.
    t.app.store.update((s) => { s.staff.find((x) => x.id === 'st-coord').role = 'owner'; });
    t.app.session.start('st-coord', '2027-01-01T10:00:00');
    expect(t.app.team.updateStaff('st-owner', { active: false }).text).toBe('Turned off access for Akash Mehta');
    t.app.store.update((s) => { s.staff.find((x) => x.id === 'st-owner').active = true; s.staff.find((x) => x.id === 'st-owner').role = 'technician'; });
    expect(t.app.team.updateStaff('st-coord', { role: 'technician' }).error).toBe("You can't change your own role or turn off your own access. Ask another owner.");
    const { changeBlocked } = await import('../src/domain/access.js');
    expect(changeBlocked(t.app.store.get().staff, 'st-x', 'st-coord', { active: false })).toBe('KaryaHub needs at least one active owner. Make someone else an owner first.');
    await tick();
  });
});
