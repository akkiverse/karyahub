import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';
import { roleName, initials } from '../domain/access.js';

/** The signed-in person's own page: who they are, what they can do, and a way to change their PIN. */
export function account({ ui, me, permissionLabels }) {
  const f = ui.account || {};
  const mine = permissionLabels.filter((p) => me.permissions.includes(p.id));
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">My account</h1></header>
    <section class="panel">
      <div class="member" style="grid-template-columns:auto 1fr">
        <span class="avatar avatar-${me.role}" aria-hidden="true">${escapeHtml(initials(me.name))}</span>
        <span class="member-main"><strong>${escapeHtml(me.name)}</strong><span class="muted small">${escapeHtml(prettyPhone(me.phone))} · ${escapeHtml(roleName(me.role))}${me.business ? ` · ${escapeHtml(me.business.name)}` : ''}</span></span>
      </div>
      ${mine.length ? `<h2 class="section-title">What you can do</h2><ul class="role-notes" data-testid="my-permissions">${mine.map((p) => `<li>${escapeHtml(p.label)}</li>`).join('')}</ul>` : '<p class="muted">Your business owner hasn\'t given you access to anything yet. Ask them to set it up in Admin.</p>'}
    </section>
    <section class="panel" aria-labelledby="pin-title">
      <div class="panel-head"><h2 class="panel-title" id="pin-title">Change your PIN</h2></div>
      ${f.notice ? `<p class="notice ${f.notice.error ? 'notice-error' : ''}" role="${f.notice.error ? 'alert' : 'status'}" data-testid="account-notice">${escapeHtml(f.notice.text)}</p>` : ''}
      <form data-form="account-pin" class="stack" novalidate>
        <label class="field"><span>Current PIN</span><input name="current" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></label>
        <label class="field"><span>New PIN (4 to 6 digits)</span><input name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
        <label class="field"><span>New PIN again</span><input name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
        <button type="submit" class="btn btn-primary">${icon('key', { size: 18 })} Change PIN</button>
      </form>
    </section>
  </section>`;
}
