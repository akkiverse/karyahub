import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';
import { ROLES, PERMISSIONS, roleName, initials } from '../domain/access.js';

const when = (stamp) => {
  if (!stamp) return 'Never';
  const [d, t] = String(stamp).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
  return `${day} ${month} ${y}${t ? `, ${t.slice(0, 5)}` : ''}`;
};

function roleSelect(s, meId) {
  const self = s.id === meId;
  return `<label class="field field-inline"><span class="sr-only">Role for ${escapeHtml(s.name)}</span>
    <select data-action="set-role" data-staff="${s.id}" ${self ? 'disabled title="You can\'t change your own role"' : ''}>${ROLES.map((r) => `<option value="${r.id}" ${r.id === s.role ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select></label>`;
}

export function admin({ state, ui, me }) {
  const staff = state.staff || [];
  const a = ui.admin || {};
  const form = a.form || {};
  const errs = a.errors || {};
  const active = staff.filter((s) => s.active);
  const counts = ROLES.map((r) => [r, active.filter((s) => s.role === r.id).length]);
  return `<section class="page page-wide">
    <header class="page-head page-head-row">
      <div><h1 id="page-title" tabindex="-1">Admin</h1><p class="muted">Team, roles and access for ${escapeHtml(state.settings.business_name)}.</p></div>
      <a class="btn btn-secondary" href="#admin-add">${icon('user', { size: 18 })} Add staff</a>
    </header>

    <ul class="kpis" data-testid="admin-kpis">
      <li class="kpi"><span class="kpi-label">Active staff</span><span class="kpi-value">${active.length}</span><span class="kpi-sub muted">${staff.length - active.length} turned off</span></li>
      ${counts.map(([r, n]) => `<li class="kpi"><span class="kpi-label">${escapeHtml(r.name)}</span><span class="kpi-value">${n}</span><span class="kpi-sub muted">active</span></li>`).join('')}
    </ul>

    ${a.notice ? `<p class="notice ${a.notice.error ? 'notice-error' : ''}" role="${a.notice.error ? 'alert' : 'status'}" data-testid="admin-notice">${escapeHtml(a.notice.text)}</p>` : ''}

    <section class="panel" aria-labelledby="team-title">
      <div class="panel-head"><h2 class="panel-title" id="team-title">Team</h2><span class="muted small">${staff.length} people</span></div>
      <ul class="team" data-testid="team-list">${staff.map((s) => `<li class="member ${s.active ? '' : 'is-off'}" data-staff="${s.id}">
        <span class="avatar avatar-${s.role}" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
        <span class="member-main"><strong>${escapeHtml(s.name)}${s.id === me.id ? ' <span class="tag tag-upcoming">You</span>' : ''}</strong><span class="muted small">${escapeHtml(prettyPhone(s.phone))} · last sign-in ${escapeHtml(when(s.last_sign_in))}</span></span>
        <span class="member-role">${roleSelect(s, me.id)}</span>
        <span class="member-status"><span class="status ${s.active ? 'status-live' : 'status-missing'}" data-testid="member-status">${s.active ? 'Active' : 'Access off'}</span></span>
        <span class="member-actions">
          <button type="button" class="btn btn-ghost btn-small" data-action="reset-pin" data-staff="${s.id}">${icon('key', { size: 16 })} Reset PIN</button>
          ${s.id === me.id ? '' : `<button type="button" class="btn btn-ghost btn-small ${s.active ? 'btn-danger' : ''}" data-action="toggle-access" data-staff="${s.id}" data-active="${s.active ? 'false' : 'true'}">${s.active ? 'Turn off access' : 'Turn on access'}</button>`}
        </span>
      </li>`).join('')}</ul>
    </section>

    <div class="admin-grid">
      <section class="panel" id="admin-add" aria-labelledby="add-title">
        <div class="panel-head"><h2 class="panel-title" id="add-title">Add staff</h2></div>
        <form data-form="add-staff" class="stack" novalidate>
          ${field('name', 'Full name', 'text', form.name, errs.name, 'autocomplete="off"')}
          ${field('phone', 'Mobile number', 'tel', form.phone, errs.phone, 'inputmode="numeric" autocomplete="off"')}
          <label class="field"><span>Role</span><select name="role" ${errs.role ? 'aria-invalid="true"' : ''}>${ROLES.map((r) => `<option value="${r.id}" ${(form.role || 'technician') === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select>${errs.role ? `<span class="field-error">${escapeHtml(errs.role)}</span>` : ''}</label>
          ${field('pin', 'First PIN (4 to 6 digits)', 'text', form.pin, errs.pin, 'inputmode="numeric" maxlength="6" autocomplete="off"')}
          <p class="muted small">Share the PIN with them in person. They sign in with their mobile number and this PIN.</p>
          <button type="submit" class="btn btn-primary">${icon('check', { size: 18 })} Add to team</button>
        </form>
      </section>

      <section class="panel" aria-labelledby="roles-title">
        <div class="panel-head"><h2 class="panel-title" id="roles-title">Roles and access</h2></div>
        <div class="matrix-wrap"><table class="matrix" data-testid="role-matrix">
          <thead><tr><th scope="col">What they can do</th>${ROLES.map((r) => `<th scope="col">${escapeHtml(r.short)}</th>`).join('')}</tr></thead>
          <tbody>${PERMISSIONS.map((p) => `<tr data-permission="${p.id}"><th scope="row">${escapeHtml(p.label)}</th>${ROLES.map((r) => `<td>${p.roles.includes(r.id) ? `<span class="yes">${icon('check', { size: 18, label: 'Yes' })}</span>` : '<span class="no" aria-label="No">–</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <ul class="role-notes">${ROLES.map((r) => `<li><strong>${escapeHtml(r.name)}:</strong> ${escapeHtml(r.summary)}</li>`).join('')}</ul>
      </section>
    </div>

    <section class="panel" aria-labelledby="log-title">
      <div class="panel-head"><h2 class="panel-title" id="log-title">Access log</h2><span class="muted small">Latest 15</span></div>
      ${(state.access_log || []).length ? `<ol class="log" data-testid="access-log">${state.access_log.slice(0, 15).map((l) => `<li><span class="log-when muted small">${escapeHtml(when(l.at))}</span><span><strong>${escapeHtml(l.who)}</strong> ${escapeHtml(l.text.charAt(0).toLowerCase() + l.text.slice(1))}</span></li>`).join('')}</ol>` : '<p class="muted">No sign-ins or team changes yet.</p>'}
    </section>
    <p class="muted small">Demo: staff accounts and PINs are kept on this device only. ${escapeHtml(roleName('owner'))} accounts manage everyone else.</p>
  </section>`;
}

function field(name, label, type, value, error, extra = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value || '')}" ${extra} ${error ? 'aria-invalid="true"' : ''}>${error ? `<span class="field-error">${escapeHtml(error)}</span>` : ''}</label>`;
}

export function denied({ me, routeName }) {
  return `<section class="page"><div class="empty" data-testid="access-denied">${icon('shield', { size: 32 })}
    <h1 id="page-title" tabindex="-1">You don't have access to ${escapeHtml(routeName)}</h1>
    <p>You're signed in as ${escapeHtml(me.name)} (${escapeHtml(roleName(me.role))}). Ask the owner to change your role in Admin if you need this.</p>
    <a class="btn btn-primary" href="${me.role === 'technician' ? '#/chat' : '#/'}">Go to my start page</a></div></section>`;
}
