// Staff roles and what each one may do (CR-0003, US-13 to US-15).
// The same table lives on the KaryaHub server (backend/karyahub/access.py, GET /api/v1/access/roles);
// a test keeps the two identical. In this demo, staff accounts and PINs live on this device only
// (ADR-0010): real sign-in needs the server with a database before real staff use it.

export const ROLES = [
  { id: 'owner', name: 'Owner (admin)', short: 'Owner', summary: 'Everything, including Admin (team and access) and Settings.' },
  { id: 'coordinator', name: 'Office coordinator', short: 'Coordinator', summary: 'Runs the day: chat, jobs, quotes and invoices, renewals and closing jobs. No Admin or Settings.' },
  { id: 'technician', name: 'Technician', short: 'Technician', summary: 'Sends job reports and confirms finished work with the customer. No money totals, paperwork, renewals or settings.' },
];

export const PERMISSIONS = [
  { id: 'view_dashboard', label: 'See the overview and money at stake', roles: ['owner', 'coordinator'] },
  { id: 'use_chat', label: 'Send and review job reports in Chat', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'view_jobs', label: 'See jobs', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'verify_work', label: 'Send the customer code and verify work', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'close_jobs', label: 'Close jobs', roles: ['owner', 'coordinator'] },
  { id: 'create_documents', label: 'Create quotes and invoices', roles: ['owner', 'coordinator'] },
  { id: 'manage_renewals', label: 'See renewals and send reminders', roles: ['owner', 'coordinator'] },
  { id: 'manage_settings', label: 'Change settings and reset the demo', roles: ['owner'] },
  { id: 'manage_team', label: 'Add staff, change roles and PINs (Admin)', roles: ['owner'] },
];

const BY_ID = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p]));

export function can(role, permission) {
  const p = BY_ID[permission];
  return Boolean(p && p.roles.includes(role));
}
export const roleName = (role) => (ROLES.find((r) => r.id === role) || { name: 'Unknown role' }).name;
export const roleShort = (role) => (ROLES.find((r) => r.id === role) || { short: role }).short;

// Which permission opens each screen. Screens not listed are open to every signed-in person.
export const ROUTE_PERMISSION = {
  home: 'view_dashboard', chat: 'use_chat', jobs: 'view_jobs', job: 'view_jobs', doc: 'create_documents',
  renewals: 'manage_renewals', settings: 'manage_settings', admin: 'manage_team',
};
export const canOpen = (role, routeName) => !ROUTE_PERMISSION[routeName] || can(role, ROUTE_PERMISSION[routeName]);
export const landingFor = (role) => (can(role, 'view_dashboard') ? '#/' : '#/chat');

// Job workflow action -> permission (the server uses the same mapping).
export const ACTION_PERMISSION = {
  assign: 'close_jobs', start: 'verify_work', report_done: 'verify_work', request_otp: 'verify_work', verify_otp: 'verify_work',
  supervisor_verify: 'close_jobs', close: 'close_jobs', cancel: 'close_jobs', reopen: 'close_jobs',
};

// Demo staff. PINs are shown on the sign-in screen on purpose: this is sample data.
export const DEMO_PINS = { 'st-owner': '2468', 'st-coord': '1357', 'st-santosh': '8642', 'st-imran': '9753' };
export const DEMO_STAFF = [
  { id: 'st-owner', name: 'Akash Mehta', phone: '9900000201', role: 'owner', active: true, pin_hash: '95d91de10c8544ea469519de2c1e036bf8011c843495c80d4372a4ccec3f02f6', created_at: '2026-12-01T10:00:00', last_sign_in: null },
  { id: 'st-coord', name: 'Priya Nair', phone: '9900000202', role: 'coordinator', active: true, pin_hash: 'f2bfb357144257c83e4dca86e49a330a6af58317ca454c5591439ee6720726cf', created_at: '2026-12-01T10:00:00', last_sign_in: null },
  { id: 'st-santosh', name: 'Santosh Pawar', phone: '9900000203', role: 'technician', active: true, pin_hash: 'a348e2c32292ac30a3feb02cbc140ab2e9ac6ac3cd5cdc2122192a6c8fbb8ea3', created_at: '2026-12-01T10:00:00', last_sign_in: null },
  { id: 'st-imran', name: 'Imran Khan', phone: '9900000204', role: 'technician', active: true, pin_hash: '811a12c208c748599d417814fa3f7fbbf926565e4f9139ec8de53db0d992e55d', created_at: '2026-12-01T10:00:00', last_sign_in: null },
];
export const demoStaff = () => DEMO_STAFF.map((s) => ({ ...s }));

/** SHA-256 of the PIN, salted with the staff id. Never store the PIN itself. */
export async function hashPin(staffId, pin) {
  const bytes = new TextEncoder().encode(`karyahub:${staffId}:${pin}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const normalisePhone = (v) => String(v || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');

/** Checks a new or edited staff member. Returns {field: message} or null. */
export function validateStaff({ name, phone, role, pin }, staff, { editingId = null, needPin = true } = {}) {
  const errors = {};
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 60) errors.name = 'Enter the person\'s name (2 to 60 letters).';
  const p = normalisePhone(phone);
  if (!/^[6-9]\d{9}$/.test(p)) errors.phone = 'Use a 10-digit mobile number.';
  else if (staff.some((s) => s.phone === p && s.id !== editingId)) errors.phone = 'Someone on the team already uses this number.';
  if (!ROLES.some((r) => r.id === role)) errors.role = 'Pick a role.';
  if (needPin && !/^\d{4,6}$/.test(String(pin || ''))) errors.pin = 'Use a PIN of 4 to 6 digits.';
  return Object.keys(errors).length ? errors : null;
}

/** Guards for changes an owner makes in Admin. Returns a plain-English reason, or '' when allowed. */
export function changeBlocked(staff, actorId, targetId, change) {
  const target = staff.find((s) => s.id === targetId);
  if (!target) return 'That person is no longer on the team.';
  const activeOwners = staff.filter((s) => s.active && s.role === 'owner');
  const losesOwner = target.role === 'owner' && target.active
    && ((change.role && change.role !== 'owner') || change.active === false);
  if (targetId === actorId && (change.active === false || (change.role && change.role !== target.role))) {
    return "You can't change your own role or turn off your own access. Ask another owner.";
  }
  if (losesOwner && activeOwners.length <= 1) return 'KaryaHub needs at least one active owner. Make someone else an owner first.';
  return '';
}

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
