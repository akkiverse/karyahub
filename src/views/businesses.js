import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';

function field(name, label, value, extra = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" value="${escapeHtml(value || '')}" ${extra}></label>`;
}

/** The platform admin's screen: every business on KaryaHub, and a form to add one with its first owner. */
export function businesses({ ui }) {
  const b = ui.businesses || {};
  const list = b.list;
  const form = b.form || {};
  return `<section class="page page-wide">
    <header class="page-head page-head-row">
      <div><h1 id="page-title" tabindex="-1">Businesses</h1><p class="muted">Each business has its own people, jobs and stock. You create it and its first owner; the owner runs the rest.</p></div>
      <a class="btn btn-secondary" href="#biz-add">${icon('building', { size: 18 })} Add a business</a>
    </header>
    ${b.notice ? `<p class="notice ${b.notice.error ? 'notice-error' : ''}" role="${b.notice.error ? 'alert' : 'status'}" data-testid="biz-notice">${escapeHtml(b.notice.text)}</p>` : ''}
    ${b.issued ? `<section class="panel panel-credentials" data-testid="biz-credentials" aria-labelledby="biz-cred">
      <div class="panel-head"><h2 class="panel-title" id="biz-cred">Give ${escapeHtml(b.issued.name)} their PIN</h2><button type="button" class="btn btn-ghost btn-small" data-action="dismiss-issued">Done</button></div>
      <p class="muted small">The temporary PIN is shown once. ${escapeHtml(b.issued.name)} signs in with <strong>${escapeHtml(prettyPhone(b.issued.phone))}</strong> and this PIN, then chooses their own.</p>
      <p class="pin-big"><code data-testid="issued-pin">${escapeHtml(b.issued.pin)}</code></p>
    </section>` : ''}
    <section class="panel" aria-labelledby="biz-list-title">
      <div class="panel-head"><h2 class="panel-title" id="biz-list-title">All businesses</h2><span class="muted small">${list ? list.length : 0}</span></div>
      ${!list ? (b.error ? `<p class="notice notice-error" role="alert">${escapeHtml(b.error)}</p>` : '<p class="muted" role="status">Loading businesses…</p>') : `
      <ul class="team" data-testid="business-list">${list.map((x) => `<li class="member ${x.active ? '' : 'is-off'}" data-business="${x.id}">
        <span class="avatar" aria-hidden="true">${icon('building', { size: 18 })}</span>
        <span class="member-main"><strong>${escapeHtml(x.name)}${x.is_demo ? ' <span class="tag tag-upcoming">Demo</span>' : ''}</strong>
          <span class="muted small">${x.people} ${x.people === 1 ? 'person' : 'people'} · ${x.owners.length ? `owner ${x.owners.map((o) => `${escapeHtml(o.name)} (${escapeHtml(prettyPhone(o.phone))})`).join(', ')}` : 'no owner yet'}</span></span>
        <span class="member-status"><span class="status ${x.active ? 'status-live' : 'status-missing'}" data-testid="business-status">${x.active ? 'Active' : 'Turned off'}</span></span>
        <span class="member-actions">
          ${x.is_demo ? '' : x.owners.map((o) => `<button type="button" class="btn btn-ghost btn-small" data-action="reset-owner-pin" data-owner="${o.id}">${icon('key', { size: 16 })} Reset ${escapeHtml(o.name.split(' ')[0])}'s PIN</button>`).join('')}
          ${x.is_demo ? '' : `<button type="button" class="btn btn-ghost btn-small ${x.active ? 'btn-danger' : ''}" data-action="toggle-business" data-business="${x.id}" data-active="${x.active ? 'false' : 'true'}">${x.active ? 'Turn off' : 'Turn on'}</button>`}
        </span>
      </li>`).join('')}</ul>`}
    </section>
    <section class="panel" id="biz-add" aria-labelledby="biz-add-title">
      <div class="panel-head"><h2 class="panel-title" id="biz-add-title">Add a business</h2></div>
      <form data-form="add-business" class="stack" novalidate>
        <div class="form-grid">
          ${field('name', 'Business name', form.name, 'autocomplete="off"')}
          ${field('address', 'Address (optional)', form.address, 'autocomplete="off"')}
          ${field('gstin', 'GSTIN (optional)', form.gstin, 'autocomplete="off" maxlength="15"')}
          ${field('state_code', 'State code', form.state_code || '27', 'inputmode="numeric" maxlength="2"')}
        </div>
        <h3 class="section-title">First owner</h3>
        <div class="form-grid">
          ${field('owner_name', "Owner's name", form.owner_name, 'autocomplete="off"')}
          ${field('owner_phone', "Owner's mobile number", form.owner_phone, 'inputmode="numeric" autocomplete="off"')}
          ${field('owner_pin', 'First PIN (optional)', form.owner_pin, 'inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Leave empty to make one"')}
        </div>
        ${b.formError ? `<p class="field-error" role="alert" tabindex="-1" data-testid="biz-error">${escapeHtml(b.formError)}</p>` : ''}
        <button type="submit" class="btn btn-primary">${icon('check', { size: 18 })} Create business</button>
      </form>
    </section>
  </section>`;
}
