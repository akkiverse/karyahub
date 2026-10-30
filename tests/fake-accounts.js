// A stand-in for the accounts part of the KaryaHub API in UI tests (the real rules are tested with pytest).
// It keeps people, businesses and the activity log in memory and answers in the server's shapes.
import { ApiError } from '../src/api/client.js';
import { ROLES, PERMISSIONS, defaultPermissions } from '../src/domain/access.js';

const locked = ['manage_team', 'manage_settings'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const fail = (message, code, status = 400) => { throw new ApiError(message, { code, status }); };

export const DEMO_BUSINESS = { id: 'b-demo', name: 'CoolCare AC Services', address: 'Shop 4, Demo Lane, Kothrud, Pune 411038', gstin: '27AAAAA0000A1Z5', is_demo: true, active: true };
export const REAL_BUSINESS = { id: 'b-shree', name: 'Shree Cool AC', address: 'Nashik', gstin: '', is_demo: false, active: true };

export function meFor(person, business = DEMO_BUSINESS, extra = {}) {
  const permissions = person.role === 'platform_admin' ? ['manage_businesses'] : defaultPermissions(person.role);
  return { signed_in: true, user: { must_change_pin: false, ...person }, business: person.role === 'platform_admin' ? null : business, permissions, ...extra };
}

export const PEOPLE = {
  'st-owner': { id: 'u-owner', name: 'Akash Mehta', phone: '9900000201', role: 'owner' },
  'st-coord': { id: 'u-coord', name: 'Priya Nair', phone: '9900000202', role: 'coordinator' },
  'st-santosh': { id: 'u-santosh', name: 'Santosh Pawar', phone: '9900000203', role: 'technician' },
  platform: { id: 'u-platform', name: 'Abhishek', phone: '9800000001', role: 'platform_admin' },
};

export function fakeAccounts({ editable = true, accounts = [], needsSetup = false, business = DEMO_BUSINESS } = {}) {
  const calls = [];
  let n = 100;
  const members = [
    { id: 'u-owner', name: 'Akash Mehta', phone: '9900000201', role: 'owner', active: true, must_change_pin: false, last_sign_in: '2027-01-01T09:00:00', overrides: {} },
    { id: 'u-coord', name: 'Priya Nair', phone: '9900000202', role: 'coordinator', active: true, must_change_pin: false, last_sign_in: null, overrides: {} },
    { id: 'u-santosh', name: 'Santosh Pawar', phone: '9900000203', role: 'technician', active: true, must_change_pin: false, last_sign_in: null, overrides: {} },
  ];
  const matrix = Object.fromEntries(['owner', 'coordinator', 'technician'].map((r) => [r, Object.fromEntries(PERMISSIONS.map((p) => [p.id, r === 'owner' || p.roles.includes(r)]))]));
  const log = [{ id: 1, who: 'Akash Mehta', action: 'sign_in', text: 'Signed in as owner', at: '2027-01-01T09:00:00' }];
  const businesses = [
    { ...DEMO_BUSINESS, people: 4, owners: [{ id: 'u-demo-owner', name: 'Akash Mehta', phone: '9900000201', active: true }] },
    { ...REAL_BUSINESS, people: 2, owners: [{ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', active: true }] },
  ];
  const rec = (name, args) => calls.push({ name, args });
  const audit = (who, text) => log.unshift({ id: ++n, who, action: 'x', text, at: '2027-01-01T10:00:00' });
  const find = (id) => members.find((m) => m.id === id) || fail('That person isn\'t on your team.', 'not_found', 404);

  return {
    calls,
    members,
    state: { needsSetup },
    authState: async () => ({ needs_setup: needsSetup, demo_accounts: [
      { name: 'Akash Mehta', phone: '9900000201', role: 'owner', pin: '2468' },
      { name: 'Priya Nair', phone: '9900000202', role: 'coordinator', pin: '1357' },
      { name: 'Santosh Pawar', phone: '9900000203', role: 'technician', pin: '8642' },
      { name: 'Imran Khan', phone: '9900000204', role: 'technician', pin: '9753' },
    ] }),
    me: async () => ({ signed_in: false }),
    signIn: async (phone, pin) => {
      rec('signIn', [phone, pin]);
      const hit = accounts.find((a) => a.phone === String(phone).replace(/\D/g, '').slice(-10) && a.pin === pin);
      if (!hit) fail("That mobile number and PIN don't match an active account. Check them, or use Forgot PIN.", 'sign_in_failed', 401);
      return clone(hit.me);
    },
    signOut: async () => { rec('signOut', []); return { signed_in: false }; },
    bootstrap: async (form) => {
      rec('bootstrap', [form]);
      if (form.token !== 'setup-token') fail("That setup token isn't right.", 'forbidden', 403);
      needsSetup = false;
      return { created: true, name: form.name };
    },
    changePin: async (current, next) => {
      rec('changePin', [current, next]);
      if (current === '0000') fail("Your current PIN isn't right.", 'wrong_pin');
      return { changed: true };
    },
    forgotPin: async (phone) => { rec('forgotPin', [phone]); return { sent: true, message: 'If that number has an active account, a 6-digit code is on its way.', demo_code: '482913' }; },
    resetPin: async (phone, code, pin) => {
      rec('resetPin', [phone, code, pin]);
      if (code !== '482913') fail("That code isn't right or has expired. Ask for a new one.", 'bad_code');
      return { reset: true };
    },

    team: async () => ({ members: clone(members), roles: clone(ROLES), permissions: PERMISSIONS.map((p) => ({ id: p.id, label: p.label, locked_for_owner: locked.includes(p.id) })), role_permissions: clone(matrix), editable }),
    audit: async () => ({ entries: clone(log) }),
    addMember: async (form) => {
      rec('addMember', [form]);
      if (members.some((m) => m.phone === String(form.phone).replace(/\D/g, ''))) fail('That mobile number already has a KaryaHub account (in this or another business).', 'phone_in_use', 409);
      const m = { id: `u-${++n}`, name: form.name, phone: String(form.phone).replace(/\D/g, ''), role: form.role, active: true, must_change_pin: true, last_sign_in: null, overrides: {} };
      members.push(m);
      audit('Akash Mehta', `Added ${m.name} as ${m.role}`);
      return { member: clone(m), pin: form.pin || '482913' };
    },
    importMembers: async (csv) => {
      rec('importMembers', [csv]);
      const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
      const created = []; const errors = [];
      rows.forEach(([name, phone, role, pin], i) => {
        if (!/^[6-9]\d{9}$/.test(phone)) { errors.push({ row: i + 2, message: 'Use a 10-digit mobile number.' }); return; }
        const m = { id: `u-${++n}`, name, phone, role, active: true, must_change_pin: true, last_sign_in: null, overrides: {} };
        members.push(m);
        created.push({ name, phone, role, pin: pin || '739105' });
      });
      return { created, errors };
    },
    updateMember: async (id, change) => {
      rec('updateMember', [id, change]);
      const m = find(id);
      if (change.role) m.role = change.role;
      if (typeof change.active === 'boolean') m.active = change.active;
      audit('Akash Mehta', `Changed ${m.name}`);
      return clone(m);
    },
    resetMemberPin: async (id) => { rec('resetMemberPin', [id]); return { name: find(id).name, pin: '739105' }; },
    memberPermissions: async (id, overrides) => {
      rec('memberPermissions', [id, overrides]);
      const m = find(id);
      for (const [k, v] of Object.entries(overrides)) { if (v === 'default') delete m.overrides[k]; else m.overrides[k] = v; }
      return clone(m);
    },
    rolePermissions: async (role, permissions) => {
      rec('rolePermissions', [role, permissions]);
      Object.assign(matrix[role], permissions);
      return {};
    },
    saveBusinessProfile: async (fields) => { rec('saveBusinessProfile', [fields]); return { ...business, ...fields }; },

    businesses: async () => ({ businesses: clone(businesses) }),
    createBusiness: async (form) => {
      rec('createBusiness', [form]);
      if (businesses.some((b) => b.owners.some((o) => o.phone === String(form.owner_phone).replace(/\D/g, '')))) fail('That mobile number already has a KaryaHub account (in this or another business).', 'phone_in_use', 409);
      const b = { id: `b-${++n}`, name: form.name, address: form.address || '', gstin: form.gstin || '', is_demo: false, active: true, people: 1, owners: [{ id: `u-${++n}`, name: form.owner_name, phone: String(form.owner_phone).replace(/\D/g, ''), active: true }] };
      businesses.push(b);
      return { business: clone(b), owner: clone(b.owners[0]), pin: form.owner_pin || '305917' };
    },
    setBusinessActive: async (id, active) => { rec('setBusinessActive', [id, active]); const b = businesses.find((x) => x.id === id); b.active = active; return clone(b); },
    resetOwnerPin: async (id) => { rec('resetOwnerPin', [id]); const o = businesses.flatMap((b) => b.owners).find((x) => x.id === id); return { name: o.name, pin: '628140' }; },
  };
}
