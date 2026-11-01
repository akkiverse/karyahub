// Staff roles and what each one may do (CR-0003, US-13 to US-15; changed by CR-0005).
// This is the STARTING table. Since CR-0005 the server works out each person's real permissions
// (a business owner can switch single permissions on or off for a role or a person) and sends them
// as `permissions` with who is signed in. Screens ask `can(me, permission)`. The same starting table
// lives on the server (backend/karyahub/access.py, GET /api/v1/access/roles); a test keeps them identical.

export const ROLES = [
  { id: 'owner', name: 'Owner (admin)', short: 'Owner', summary: 'Everything, including Admin (team and access) and Settings.' },
  { id: 'coordinator', name: 'Office coordinator', short: 'Coordinator', summary: 'Runs the day: chat, jobs, quotes and invoices, renewals and closing jobs. No Admin or Settings.' },
  { id: 'technician', name: 'Technician', short: 'Technician', summary: 'Sends job reports and confirms finished work with the customer. No money totals, paperwork, renewals or settings.' },
];
export const PLATFORM_ROLE = { id: 'platform_admin', name: 'Platform admin', short: 'Platform', summary: 'Runs KaryaHub itself: creates businesses and their owners. Sees no business data.' };

export const PERMISSIONS = [
  { id: 'view_dashboard', label: 'See the overview and money at stake', roles: ['owner', 'coordinator'] },
  { id: 'use_chat', label: 'Send and review job reports in Chat', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'view_jobs', label: 'See jobs', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'verify_work', label: 'Send the customer code and verify work', roles: ['owner', 'coordinator', 'technician'] },
  { id: 'close_jobs', label: 'Close jobs', roles: ['owner', 'coordinator'] },
  { id: 'create_documents', label: 'Create quotes and invoices', roles: ['owner', 'coordinator'] },
  { id: 'manage_renewals', label: 'See renewals and send reminders', roles: ['owner', 'coordinator'] },
  { id: 'manage_settings', label: 'Change settings and business details', roles: ['owner'] },
  { id: 'manage_team', label: 'Add staff, change roles and PINs (Admin)', roles: ['owner'] },
  // Inventory (CR-0011). Technicians work on WhatsApp, so they have none of these unless the owner allows it.
  { id: 'view_inventory', label: 'See inventory (parts and stock)', roles: ['owner', 'coordinator'] },
  { id: 'manage_inventory', label: 'Add items, import, stock in and out, counts (Inventory)', roles: ['owner', 'coordinator'] },
  { id: 'use_parts', label: 'Take parts from inventory for a job', roles: ['owner', 'coordinator'] },
];

/** The starting permissions for a role (before an owner's switches). Used by tests and the demo. */
export const defaultPermissions = (role) => PERMISSIONS.filter((p) => p.roles.includes(role)).map((p) => p.id);

/** Does this signed-in person (the server's `me` answer) have the permission? */
export const can = (me, permission) => Boolean(me && Array.isArray(me.permissions) && me.permissions.includes(permission));

export const roleName = (role) => (role === PLATFORM_ROLE.id ? PLATFORM_ROLE.name : (ROLES.find((r) => r.id === role) || { name: 'Unknown role' }).name);
export const roleShort = (role) => (role === PLATFORM_ROLE.id ? PLATFORM_ROLE.short : (ROLES.find((r) => r.id === role) || { short: role }).short);

// Which permission opens each screen. Screens not listed are open to every signed-in person.
export const ROUTE_PERMISSION = {
  home: 'view_dashboard', chat: 'use_chat', jobs: 'view_jobs', job: 'view_jobs', doc: 'create_documents',
  renewals: 'manage_renewals', settings: 'manage_settings', admin: 'manage_team', businesses: 'manage_businesses',
  inventory: 'view_inventory', item: 'view_inventory', 'item-form': 'manage_inventory', 'inventory-import': 'manage_inventory',
};
export const canOpen = (me, routeName) => !ROUTE_PERMISSION[routeName] || can(me, ROUTE_PERMISSION[routeName]);
export const landingFor = (me) => {
  if (can(me, 'manage_businesses')) return '#/businesses';
  if (can(me, 'view_dashboard')) return '#/';
  if (can(me, 'use_chat')) return '#/chat';
  if (can(me, 'view_jobs')) return '#/jobs';
  return '#/account';
};

// Job workflow action -> permission (the server uses the same mapping).
export const ACTION_PERMISSION = {
  assign: 'close_jobs', start: 'verify_work', report_done: 'verify_work', request_otp: 'verify_work', verify_otp: 'verify_work',
  supervisor_verify: 'close_jobs', close: 'close_jobs', cancel: 'close_jobs', reopen: 'close_jobs',
};

export const normalisePhone = (v) => String(v || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
