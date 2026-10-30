import { describe, it, expect, afterEach } from 'vitest';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { REAL_BUSINESS, PEOPLE, meFor } from './fake-accounts.js';

let t;
afterEach(() => t?.app.unmount());

const shree = meFor({ id: 'u-owner', name: 'Akash Mehta', phone: '9900000201', role: 'owner' }, REAL_BUSINESS);
const open = async (opts = {}) => {
  t = setup({ me: shree, hash: '#/admin', api: fakeApi({ accounts: opts.accounts }) });
  await until(() => t.$('[data-testid="team-list"]'));
};
const notice = () => t.$('[data-testid="admin-notice"]')?.textContent || '';
const calls = (name) => t.api.accountCalls.filter((c) => c.name === name);

describe('US-19 Admin: team and access (screens, CR-0005)', () => {
  it('AC-19.1 and AC-22.5 (screen): Admin shows counts by role, the team, add and import forms, the role table and the activity log', async () => {
    await open();
    expect(t.$('[data-testid="admin-kpis"]').textContent).toContain('Active people');
    expect(t.$$('[data-testid="admin-kpis"] .kpi-value').map((e) => e.textContent)).toEqual(['3', '1', '1', '1']);
    const rows = t.$$('[data-testid="team-list"] .member');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Priya Nair');
    expect(rows[1].textContent).toContain('99000 00202');
    expect(rows[1].querySelector('select[data-action="set-role"]').value).toBe('coordinator');
    expect(rows[1].querySelector('[data-testid="member-status"]').textContent).toBe('Active');
    expect(t.$('form[data-form="add-staff"]')).toBeTruthy();
    expect(t.$('form[data-form="import-staff"]')).toBeTruthy();
    expect(t.$$('[data-testid="role-matrix"] tbody tr')).toHaveLength(9);
    expect(t.$('[data-testid="access-log"]').textContent).toContain('Akash Mehta signed in as owner');
    expect(t.$('[data-testid="demo-locked"]')).toBeNull();
  });

  it('AC-19.1 and AC-22.5 (screen): adding a person shows their PIN once, in a panel that can be dismissed or downloaded', async () => {
    await open();
    const f = t.$('form[data-form="add-staff"]');
    f.elements.name.value = 'Neha Kulkarni'; f.elements.phone.value = '9900000299'; f.elements.role.value = 'technician';
    f.requestSubmit();
    await until(() => t.$('[data-testid="admin-credentials"]'));
    expect(notice()).toContain('Neha Kulkarni was added as Technician');
    expect(t.$('[data-testid="issued-pin"]').textContent).toBe('482913');
    expect(t.$('[data-testid="admin-credentials"] a[download]').href).toContain('data:text/csv');
    expect(t.$$('[data-testid="team-list"] .member')).toHaveLength(4);
    expect(calls('addMember')[0].args[0]).toMatchObject({ name: 'Neha Kulkarni', phone: '9900000299', role: 'technician', must_change_pin: true });
    expect(calls('addMember')[0].args[0]).not.toHaveProperty('pin'); // empty means "make one"
    t.click('[data-action="dismiss-credentials"]');
    expect(t.$('[data-testid="admin-credentials"]')).toBeNull();
  });

  it('AC-19.1 and AC-22.5 (screen): a number that already has an account is explained and the form keeps what was typed', async () => {
    await open();
    const f = t.$('form[data-form="add-staff"]');
    f.elements.name.value = 'Someone Else'; f.elements.phone.value = '9900000202'; f.elements.role.value = 'coordinator'; f.elements.pin.value = '6402';
    f.requestSubmit();
    await until(() => t.$('[data-testid="add-error"]'));
    expect(t.$('[data-testid="add-error"]').textContent).toContain('already has a KaryaHub account');
    const again = t.$('form[data-form="add-staff"]');
    expect(again.elements.name.value).toBe('Someone Else');
    expect(again.elements.pin.value).toBe(''); // the PIN is never put back
    expect(t.$$('[data-testid="team-list"] .member')).toHaveLength(3);
  });

  it('AC-19.2 and AC-22.5 (screen): importing a file adds good rows, lists bad ones with the row number, and shows the PINs once', async () => {
    await open();
    const f = t.$('form[data-form="import-staff"]');
    f.elements.csv.value = 'name,phone,role,pin\nAsha Menon,9833300011,technician,\nBala Iyer,12,coordinator,\n';
    f.requestSubmit();
    await until(() => t.$('[data-testid="import-errors"]'));
    expect(notice()).toBe('1 person added, 1 row needs fixing.');
    expect(t.$('[data-testid="import-errors"]').textContent).toContain('Row 3: Use a 10-digit mobile number.');
    expect(t.$('[data-testid="admin-credentials"]').textContent).toContain('Asha Menon');
    expect(t.$('[data-testid="issued-pin"]').textContent).toBe('739105');
    expect(t.$$('[data-testid="team-list"] .member')).toHaveLength(4);
    expect(t.$('a[download="karyahub-team-template.csv"]')).toBeTruthy();
  });

  it('AC-19.3 and AC-22.5 (screen): changing a role, turning access off and on, and resetting a PIN each say what happened', async () => {
    await open();
    const priya = () => t.$$('[data-testid="team-list"] .member')[1];
    const sel = priya().querySelector('select[data-action="set-role"]');
    sel.value = 'technician';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => notice().includes('Priya Nair is now Technician'));
    expect(calls('updateMember')[0].args).toEqual(['u-coord', { role: 'technician' }]);
    t.click(priya().querySelector('[data-action="toggle-access"]'));
    await until(() => notice().includes('access turned off'));
    expect(priya().querySelector('[data-testid="member-status"]').textContent).toBe('Access off');
    t.click(priya().querySelector('[data-action="toggle-access"]'));
    await until(() => notice().includes('access turned on'));
    t.click(priya().querySelector('[data-action="reset-pin"]'));
    await until(() => t.$('[data-testid="admin-credentials"]'));
    expect(t.$('[data-testid="issued-pin"]').textContent).toBe('739105');
    expect(notice()).toContain('New PIN made for Priya Nair');
  });

  it('AC-19.3 and AC-22.5 (screen): owners cannot change or switch off themselves', async () => {
    await open();
    const me = t.$$('[data-testid="team-list"] .member')[0];
    expect(me.textContent).toContain('You');
    expect(me.querySelector('select[data-action="set-role"]').disabled).toBe(true);
    expect(me.querySelector('[data-action="toggle-access"]')).toBeNull();
  });

  it('AC-19.4 and AC-22.5 (screen): the role table has switches that save at once; owners are locked on', async () => {
    await open();
    const cell = (perm, role) => t.$(`input[data-action="role-permission"][data-permission="${perm}"][data-role="${role}"]`);
    expect(cell('close_jobs', 'technician').checked).toBe(false);
    expect(cell('close_jobs', 'owner').disabled).toBe(true);
    expect(cell('close_jobs', 'owner').checked).toBe(true);
    cell('close_jobs', 'technician').checked = true;
    cell('close_jobs', 'technician').dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => notice().includes('everyone with the Technician role'));
    expect(calls('rolePermissions')[0].args).toEqual(['technician', { close_jobs: true }]);
    expect(cell('close_jobs', 'technician').checked).toBe(true);
  });

  it('AC-19.4 and AC-22.5 (screen): one person can be given or refused a single permission, then put back to the role default', async () => {
    await open();
    const select = () => t.$('select[data-action="member-permission"][data-staff="u-santosh"][data-permission="close_jobs"]');
    expect(select().value).toBe('default');
    expect([...select().options].map((o) => o.textContent)).toEqual(['Role default', 'Allow', 'Block']);
    select().value = 'allow';
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => notice().includes('Access updated for Santosh Pawar'));
    expect(calls('memberPermissions')[0].args).toEqual(['u-santosh', { close_jobs: 'allow' }]);
    expect(select().value).toBe('allow');
    select().value = 'default';
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => calls('memberPermissions').length === 2);
  });

  it('AC-19.7 and AC-22.5 (screen): the demo business shows its team but every control is switched off, with a plain note', async () => {
    t = setup({ hash: '#/admin', api: fakeApi({ accounts: { editable: false } }) });
    await until(() => t.$('[data-testid="team-list"]'));
    expect(t.$('[data-testid="demo-locked"]').textContent).toContain("demo business");
    for (const sel of ['form[data-form="add-staff"] button[type="submit"]', 'form[data-form="import-staff"] button[type="submit"]', '[data-action="reset-pin"]', 'select[data-action="set-role"]', 'input[data-action="role-permission"]']) {
      expect(t.$(sel).disabled, sel).toBe(true);
    }
  });

  it('AC-19.4 and AC-22.5 (screen): people without "manage team" get the no-access page for Admin', () => {
    t = setup({ signedInAs: 'st-coord', hash: '#/admin' });
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    expect(t.api.accountCalls.some((c) => c.name === 'addMember')).toBe(false);
  });

  it('AC-19.8 and AC-22.5 (screen): the owner saves business details in Settings and the whole app uses them', async () => {
    t = setup({ me: shree, hash: '#/settings', api: fakeApi() });
    const f = t.$('form[data-form="business-profile"]');
    f.elements.name.value = 'Shree Cool Services'; f.elements.address.value = '12 MG Road, Nashik'; f.elements.gstin.value = '27aaaaa0000a1z5';
    f.requestSubmit();
    await until(() => t.$('[data-testid="profile-notice"]'));
    expect(t.$('[data-testid="profile-notice"]').textContent).toContain('Saved');
    expect(t.api.accountCalls.find((c) => c.name === 'saveBusinessProfile').args[0]).toEqual({ name: 'Shree Cool Services', address: '12 MG Road, Nashik', gstin: '27AAAAA0000A1Z5' });
    expect(t.app.store.get().settings.business_name).toBe('Shree Cool Services');
    expect(t.$('.topbar-biz').textContent).toBe('Shree Cool Services');
  });

  it('AC-22.6: My account shows the person, what they can do, and changes their PIN', async () => {
    t = setup({ signedInAs: 'st-santosh', hash: '#/account' });
    expect(t.$('[data-testid="my-permissions"]').textContent).toContain('Send and review job reports in Chat');
    expect(t.$('[data-testid="my-permissions"]').textContent).not.toContain('Close jobs');
    const f = t.$('form[data-form="account-pin"]');
    f.elements.current.value = '8642'; f.elements.pin.value = '6402'; f.elements.pin2.value = '6402';
    f.requestSubmit();
    await until(() => t.$('[data-testid="account-notice"]'));
    expect(t.$('[data-testid="account-notice"]').textContent).toBe('Your PIN is changed.');
    expect(PEOPLE['st-santosh'].name).toBe('Santosh Pawar');
  });
});
