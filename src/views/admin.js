import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';
import { roleName, initials } from '../domain/access.js';

const when = (stamp) => {
  if (!stamp) return 'Never';
  const [d, t] = String(stamp).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
  return `${day} ${month} ${y}${t ? `, ${t.slice(0, 5)}` : ''}`;
};

export const CSV_TEMPLATE = 'name,phone,role,pin\nAsha Menon,9876500001,technician,\nBala Iyer,9876500002,coordinator,\n';
const OVERRIDE_LABELS = { default: 'Role default', allow: 'Allow', deny: 'Block' };

function field(name, label, type, value, extra = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value || '')}" ${extra}></label>`;
}

function memberRow(m, data, me, locked) {
  const self = m.id === me.id;
  const roles = data.roles;
  const permRows = data.permissions.map((p) => {
    const current = m.overrides[p.id] || 'default';
    const off = locked || (m.role === 'owner' && p.locked_for_owner);
    return `<label class="override"><span>${escapeHtml(p.label)}</span><select data-action="member-permission" data-staff="${m.id}" data-permission="${p.id}" ${off ? 'disabled' : ''}>${Object.entries(OVERRIDE_LABELS).map(([v, l]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  }).join('');
  return `<li class="member ${m.active ? '' : 'is-off'}" data-staff="${m.id}">
    <span class="avatar avatar-${m.role}" aria-hidden="true">${escapeHtml(initials(m.name))}</span>
    <span class="member-main"><strong>${escapeHtml(m.name)}${self ? ' <span class="tag tag-upcoming">You</span>' : ''}${m.must_change_pin ? ' <span class="tag">New PIN pending</span>' : ''}</strong><span class="muted small">${escapeHtml(prettyPhone(m.phone))} · last sign-in ${escapeHtml(when(m.last_sign_in))}</span></span>
    <span class="member-role"><label class="field field-inline"><span class="sr-only">Role for ${escapeHtml(m.name)}</span>
      <select data-action="set-role" data-staff="${m.id}" ${self || locked ? 'disabled' : ''}>${roles.map((r) => `<option value="${r.id}" ${r.id === m.role ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select></label></span>
    <span class="member-status"><span class="status ${m.active ? 'status-live' : 'status-missing'}" data-testid="member-status">${m.active ? 'Active' : 'Access off'}</span></span>
    <span class="member-actions">
      <button type="button" class="btn btn-ghost btn-small" data-action="reset-pin" data-staff="${m.id}" ${locked ? 'disabled' : ''}>${icon('key', { size: 16 })} Reset PIN</button>
      ${self ? '' : `<button type="button" class="btn btn-ghost btn-small ${m.active ? 'btn-danger' : ''}" data-action="toggle-access" data-staff="${m.id}" data-active="${m.active ? 'false' : 'true'}" ${locked ? 'disabled' : ''}>${m.active ? 'Turn off access' : 'Turn on access'}</button>`}
    </span>
    <details class="member-access"><summary>Access for ${escapeHtml(m.name.split(' ')[0])}</summary>
      <p class="muted small">Start from the role, then allow or block single things for this person only.</p>
      <div class="overrides">${permRows}</div></details>
  </li>`;
}

export function admin({ ui, me }) {
  const a = ui.admin || {};
  const data = a.data;
  if (!data) {
    return `<section class="page page-wide"><header class="page-head"><h1 id="page-title" tabindex="-1">Admin</h1></header>
      ${a.error ? `<p class="notice notice-error" role="alert" data-testid="admin-error">${escapeHtml(a.error)}</p><button type="button" class="btn btn-secondary" data-action="reload-admin">Try again</button>` : '<p class="muted" role="status">Loading your team…</p>'}</section>`;
  }
  const locked = !data.editable;
  const members = data.members;
  const form = a.form || {};
  const errs = a.errors || {};
  const active = members.filter((m) => m.active);
  const counts = data.roles.map((r) => [r, active.filter((m) => m.role === r.id).length]);
  const business = (me.business && me.business.name) || 'your business';
  const imp = a.importResult;
  return `<section class="page page-wide">
    <header class="page-head page-head-row">
      <div><h1 id="page-title" tabindex="-1">Admin</h1><p class="muted">People, roles and access for ${escapeHtml(business)}.</p></div>
      <button type="button" class="btn btn-secondary" data-action="goto-add-person" data-testid="add-person-top">${icon('user', { size: 18 })} Add a person</button>
    </header>
    ${locked ? `<p class="notice" role="status" data-testid="demo-locked">This is the demo business, so its team can't be changed. A business of your own has full control of its team.</p>` : ''}

    <ul class="kpis" data-testid="admin-kpis">
      <li class="kpi"><span class="kpi-label">Active people</span><span class="kpi-value">${active.length}</span><span class="kpi-sub muted">${members.length - active.length} turned off</span></li>
      ${counts.map(([r, n]) => `<li class="kpi"><span class="kpi-label">${escapeHtml(r.name)}</span><span class="kpi-value">${n}</span><span class="kpi-sub muted">active</span></li>`).join('')}
    </ul>

    ${a.notice ? `<p class="notice ${a.notice.error ? 'notice-error' : ''}" role="${a.notice.error ? 'alert' : 'status'}" data-testid="admin-notice">${escapeHtml(a.notice.text)}</p>` : ''}
    ${a.credentials && a.credentials.length ? `<section class="panel panel-credentials" data-testid="admin-credentials" aria-labelledby="cred-title">
      <div class="panel-head"><h2 class="panel-title" id="cred-title">Share these PINs now</h2><button type="button" class="btn btn-ghost btn-small" data-action="dismiss-credentials">Done</button></div>
      <p class="muted small">PINs are shown once and can't be looked up later. Tell each person in private; they choose their own at first sign-in.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Name</th><th scope="col">Mobile</th><th scope="col">Role</th><th scope="col">PIN</th></tr></thead>
      <tbody>${a.credentials.map((c) => `<tr><th scope="row">${escapeHtml(c.name)}</th><td>${escapeHtml(prettyPhone(c.phone))}</td><td>${escapeHtml(c.role ? roleName(c.role) : '')}</td><td><code data-testid="issued-pin">${escapeHtml(c.pin)}</code></td></tr>`).join('')}</tbody></table></div>
      <a class="btn btn-secondary btn-small" download="karyahub-new-pins.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(`name,phone,role,pin\n${a.credentials.map((c) => [c.name, c.phone, c.role || '', c.pin].join(',')).join('\n')}\n`)}">${icon('download', { size: 16 })} Download as CSV</a>
    </section>` : ''}

    <section class="panel" aria-labelledby="team-title">
      <div class="panel-head"><h2 class="panel-title" id="team-title">Team</h2><span class="muted small">${members.length} people</span></div>
      <ul class="team" data-testid="team-list">${members.map((m) => memberRow(m, data, me, locked)).join('')}</ul>
    </section>

    <div class="admin-grid">
      <section class="panel" id="admin-add" aria-labelledby="add-title">
        <div class="panel-head"><h2 class="panel-title" id="add-title">Add a person</h2></div>
        <form data-form="add-staff" class="stack" novalidate>
          ${field('name', 'Full name', 'text', form.name, 'autocomplete="off"')}
          ${field('phone', 'Mobile number', 'tel', form.phone, 'inputmode="numeric" autocomplete="off"')}
          <label class="field"><span>Role</span><select name="role">${data.roles.map((r) => `<option value="${r.id}" ${(form.role || 'technician') === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select></label>
          ${field('pin', 'First PIN (optional, 4 to 6 digits)', 'text', form.pin, 'inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Leave empty to make one"')}
          ${errs.message ? `<p class="field-error" role="alert" tabindex="-1" data-testid="add-error">${escapeHtml(errs.message)}</p>` : ''}
          <p class="muted small">They sign in with their mobile number and this PIN, then choose their own PIN.</p>
          <button type="submit" class="btn btn-primary" ${locked ? 'disabled' : ''}>${icon('check', { size: 18 })} Add to team</button>
        </form>
      </section>

      <section class="panel" id="admin-import" aria-labelledby="import-title">
        <div class="panel-head"><h2 class="panel-title" id="import-title">Add many people from a file</h2></div>
        <form data-form="import-staff" class="stack" novalidate>
          <p class="muted small">A CSV with the columns <code>name, phone, role, pin</code>. Role is owner, coordinator or technician; leave pin empty to have one made. Up to 200 rows. <a download="karyahub-team-template.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}">Download a template</a>.</p>
          <label class="field"><span>Choose a CSV file</span><input type="file" name="file" accept=".csv,text/csv" data-action="pick-csv" ${locked ? 'disabled' : ''}></label>
          <label class="field"><span>Or paste the rows here</span><textarea name="csv" rows="5" ${locked ? 'disabled' : ''} placeholder="name,phone,role,pin">${escapeHtml(a.csv || '')}</textarea></label>
          <button type="submit" class="btn btn-secondary" ${locked ? 'disabled' : ''}>${icon('upload', { size: 18 })} Import people</button>
        </form>
        ${imp && imp.errors && imp.errors.length ? `<div class="import-errors" data-testid="import-errors"><h3 class="section-title">Rows we couldn't add</h3><ul>${imp.errors.map((e) => `<li>Row ${e.row}: ${escapeHtml(e.message)}</li>`).join('')}</ul></div>` : ''}
      </section>
    </div>

    <section class="panel" aria-labelledby="roles-title">
      <div class="panel-head"><h2 class="panel-title" id="roles-title">What each role can do</h2></div>
      <p class="muted small">Tick or untick to change what everyone with that role can do, straight away. Owners always keep everything. You can also change one person under their name above.</p>
      <div class="matrix-wrap"><table class="matrix" data-testid="role-matrix">
        <thead><tr><th scope="col">What they can do</th>${data.roles.map((r) => `<th scope="col">${escapeHtml(r.short)}</th>`).join('')}</tr></thead>
        <tbody>${data.permissions.map((p) => `<tr data-permission="${p.id}"><th scope="row">${escapeHtml(p.label)}</th>${data.roles.map((r) => {
          const on = data.role_permissions[r.id][p.id];
          const fixed = r.id === 'owner' || locked;
          return `<td><label class="check"><input type="checkbox" data-action="role-permission" data-role="${r.id}" data-permission="${p.id}" ${on ? 'checked' : ''} ${fixed ? 'disabled' : ''} aria-label="${escapeHtml(r.short)}: ${escapeHtml(p.label)}"><span class="check-mark ${on ? 'yes' : 'no'}" aria-hidden="true">${on ? icon('check', { size: 16 }) : '–'}</span></label></td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <ul class="role-notes">${data.roles.map((r) => `<li><strong>${escapeHtml(r.name)}:</strong> ${escapeHtml(r.summary)}</li>`).join('')}</ul>
    </section>

    <section class="panel" aria-labelledby="log-title">
      <div class="panel-head"><h2 class="panel-title" id="log-title">Activity log</h2><span class="muted small">Latest 15</span></div>
      ${(a.audit || []).length ? `<ol class="log" data-testid="access-log">${a.audit.slice(0, 15).map((l) => `<li><span class="log-when muted small">${escapeHtml(when(l.at))}</span><span><strong>${escapeHtml(l.who)}</strong> ${escapeHtml(l.text ? l.text.charAt(0).toLowerCase() + l.text.slice(1) : l.action)}</span></li>`).join('')}</ol>` : '<p class="muted">No sign-ins or team changes yet.</p>'}
    </section>
  </section>`;
}

export function denied({ me, routeName }) {
  return `<section class="page"><div class="empty" data-testid="access-denied">${icon('shield', { size: 32 })}
    <h1 id="page-title" tabindex="-1">You don't have access to ${escapeHtml(routeName)}</h1>
    <p>You're signed in as ${escapeHtml(me.name)} (${escapeHtml(roleName(me.role))}). Ask your business owner to change your access in Admin if you need this.</p>
    <a class="btn btn-primary" href="#/account">Go to my account</a></div></section>`;
}
