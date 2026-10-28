import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';
import { DEMO_PINS, roleName, initials } from '../domain/access.js';

const POINTS = [
  ['mic', 'Job reports straight from WhatsApp', 'Technicians send a voice note or a photo of the job sheet. KaryaHub types it up for the office.'],
  ['file', 'GST quotes and invoices in one tap', 'Made from the job record, with CGST and SGST worked out for you.'],
  ['renewals', 'Every AMC renewal followed up', 'See the money at stake and remind customers before contracts lapse.'],
];

export function signIn({ state, ui }) {
  const f = ui.signin || {};
  const demo = (state.staff || []).filter((s) => DEMO_PINS[s.id] && s.active);
  return `
  <div class="auth">
    <section class="auth-brand" aria-label="About KaryaHub">
      <a class="brand brand-light" href="#/" aria-label="KaryaHub"><span class="logo" aria-hidden="true">${logo()}</span><span class="brand-name">KaryaHub</span></a>
      <div class="auth-pitch">
        <p class="auth-kicker">Operations for AMC service firms</p>
        <p class="auth-title">Your field team on WhatsApp. Your office on KaryaHub.</p>
        <ul class="auth-points">${POINTS.map(([ic, t, d]) => `<li><span class="auth-point-icon">${icon(ic, { size: 20 })}</span><span><strong>${t}</strong><span>${d}</span></span></li>`).join('')}</ul>
      </div>
      <p class="auth-foot">Demo workspace for ${escapeHtml(state.settings.business_name)}. All names, numbers and amounts are sample data.</p>
    </section>

    <section class="auth-panel">
      <div class="auth-card">
        <h1 id="page-title" tabindex="-1">Sign in</h1>
        <p class="muted">to ${escapeHtml(state.settings.business_name)} <span class="tag tag-upcoming">Demo</span></p>
        ${f.notice ? `<p class="notice" role="status" data-testid="signin-notice">${escapeHtml(f.notice)}</p>` : ''}
        ${f.error ? `<p class="notice notice-error" role="alert" data-testid="signin-error">${escapeHtml(f.error)}</p>` : ''}
        <form data-form="signin" class="auth-form" novalidate>
          <label class="field"><span>Mobile number</span><input name="phone" type="tel" inputmode="numeric" autocomplete="username" placeholder="10-digit mobile" value="${escapeHtml(f.phone || '')}" required ${f.error ? 'aria-invalid="true"' : ''}></label>
          <label class="field"><span>PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="4 to 6 digits" value="${escapeHtml(f.pin || '')}" required ${f.error ? 'aria-invalid="true"' : ''}></label>
          <button type="submit" class="btn btn-primary btn-block" ${f.busy ? 'disabled' : ''}>${f.busy ? '<span class="spinner" aria-hidden="true"></span> Signing in…' : `Sign in ${icon('arrowRight', { size: 18 })}`}</button>
        </form>
        <p class="muted small">Forgot your PIN? Ask the owner to reset it in Admin.</p>
      </div>

      ${demo.length ? `<div class="demo-accounts" data-testid="demo-accounts">
        <h2 class="demo-accounts-title">Try a demo account</h2>
        <p class="muted small">Each role sees a different KaryaHub. PINs are shown because this is sample data.</p>
        <ul>${demo.map((s) => `<li><button type="button" class="demo-account" data-action="use-demo" data-staff="${s.id}">
          <span class="avatar avatar-${s.role}" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
          <span class="demo-account-main"><strong>${escapeHtml(s.name)}</strong><span class="muted small">${escapeHtml(roleName(s.role))} · ${escapeHtml(prettyPhone(s.phone))} · PIN ${DEMO_PINS[s.id]}</span></span>
          ${icon('arrowRight', { size: 18 })}</button></li>`).join('')}</ul>
      </div>` : ''}
    </section>
  </div>`;
}

export function logo() {
  return '<svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 8v16M9 16l9-8M12.5 13l7.5 11" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
