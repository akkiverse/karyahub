import { icon } from '../ui/icons.js';
import { escapeHtml, prettyPhone } from '../format.js';
import { roleName, initials } from '../domain/access.js';

const POINTS = [
  ['mic', 'Job reports straight from WhatsApp', 'Technicians send a voice note or a photo of the job sheet. KaryaHub types it up for the office.'],
  ['file', 'GST quotes and invoices in one tap', 'Made from the job record, with CGST and SGST worked out for you.'],
  ['renewals', 'Every AMC renewal followed up', 'See the money at stake and remind customers before contracts lapse.'],
];

export function logo() {
  return '<svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 8v16M9 16l9-8M12.5 13l7.5 11" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function frame(inner, hubUrl, sideNote = '') {
  return `
  <div class="auth">
    <section class="auth-brand" aria-label="About KaryaHub">
      <a class="brand brand-light" href="#/" aria-label="KaryaHub"><span class="logo" aria-hidden="true">${logo()}</span><span class="brand-name">KaryaHub</span></a>
      <div class="auth-pitch">
        <p class="auth-kicker">Operations for AMC service firms</p>
        <p class="auth-title">Your field team on WhatsApp. Your office on KaryaHub.</p>
        <ul class="auth-points">${POINTS.map(([ic, t, d]) => `<li><span class="auth-point-icon">${icon(ic, { size: 20 })}</span><span><strong>${t}</strong><span>${d}</span></span></li>`).join('')}</ul>
      </div>
      <p class="auth-foot">${escapeHtml(sideNote || 'Made for service firms across India.')}</p>
    </section>
    <section class="auth-panel">
      ${inner}
      <footer class="site-foot auth-site-foot"><a href="${hubUrl}">Part of Idea Studio by AkkiVerse</a></footer>
    </section>
  </div>`;
}

const notices = (f) => `${f.notice ? `<p class="notice" role="status" data-testid="signin-notice">${escapeHtml(f.notice)}</p>` : ''}
  ${f.error ? `<p class="notice notice-error" role="alert" data-testid="signin-error">${escapeHtml(f.error)}</p>` : ''}`;

const field = (name, label, { type = 'text', value = '', extra = '', invalid = false } = {}) =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra} ${invalid ? 'aria-invalid="true"' : ''} required></label>`;

const submit = (label, busy, busyLabel) =>
  `<button type="submit" class="btn btn-primary btn-block" ${busy ? 'disabled' : ''}>${busy ? `<span class="spinner" aria-hidden="true"></span> ${busyLabel}` : `${label} ${icon('arrowRight', { size: 18 })}`}</button>`;

const link = (screen, text) => `<button type="button" class="link-btn" data-action="auth-screen" data-screen="${screen}">${text}</button>`;

export function loadingScreen() {
  return '<main id="main" class="auth-main"><div class="auth-card"><p class="muted" role="status"><span class="spinner" aria-hidden="true"></span> Opening KaryaHub…</p></div></main>';
}

export function unreachableScreen() {
  return `<main id="main" class="auth-main"><div class="auth-card" data-testid="server-unreachable">
    <h1 id="page-title" tabindex="-1">Can't reach KaryaHub</h1>
    <p class="muted">Check your internet connection, then try again. Nothing you did has been lost.</p>
    <button type="button" class="btn btn-primary" data-action="retry-boot">Try again</button></div></main>`;
}

export function signIn({ ui, hubUrl = '' }) {
  const f = ui.auth || {};
  const demo = (ui.authState && ui.authState.demo_accounts) || [];
  const setup = ui.authState && ui.authState.needs_setup;
  const body = `
    <div class="auth-card">
      <h1 id="page-title" tabindex="-1">Sign in to KaryaHub</h1>
      <p class="muted">Use your mobile number and PIN. Your business gave you these.</p>
      ${notices(f)}
      <form data-form="signin" class="auth-form" novalidate>
        ${field('phone', 'Mobile number', { type: 'tel', value: f.phone || '', extra: 'inputmode="numeric" autocomplete="username" placeholder="10-digit mobile"', invalid: Boolean(f.error) })}
        ${field('pin', 'PIN', { type: 'password', value: f.pin || '', extra: 'inputmode="numeric" autocomplete="current-password" maxlength="6" placeholder="4 to 6 digits"', invalid: Boolean(f.error) })}
        ${submit('Sign in', f.busy, 'Signing in…')}
      </form>
      <p class="muted small auth-links">${link('forgot', 'Forgot your PIN?')}${setup ? ` · ${link('setup', 'First-time setup')}` : ''}</p>
    </div>
    ${demo.length ? `<details class="demo-accounts" data-testid="demo-accounts">
      <summary class="demo-accounts-title">Explore a demo business</summary>
      <p class="muted small">A sample firm with made-up customers. Each role sees a different KaryaHub. The PINs are shown because this is sample data.</p>
      <ul>${demo.map((s) => `<li><button type="button" class="demo-account" data-action="use-demo" data-phone="${escapeHtml(s.phone)}" data-pin="${escapeHtml(s.pin)}">
        <span class="avatar avatar-${s.role}" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
        <span class="demo-account-main"><strong>${escapeHtml(s.name)}</strong><span class="muted small">${escapeHtml(roleName(s.role))} · ${escapeHtml(prettyPhone(s.phone))} · PIN ${escapeHtml(s.pin)}</span></span>
        ${icon('arrowRight', { size: 18 })}</button></li>`).join('')}</ul>
    </details>` : ''}`;
  return frame(body, hubUrl);
}

export function forgotPin({ ui, hubUrl = '' }) {
  const f = ui.auth || {};
  return frame(`<div class="auth-card">
    <h1 id="page-title" tabindex="-1">Forgot your PIN?</h1>
    <p class="muted">Enter your mobile number. We'll send a 6-digit code you can use to choose a new PIN.</p>
    ${notices(f)}
    <form data-form="forgot" class="auth-form" novalidate>
      ${field('phone', 'Mobile number', { type: 'tel', value: f.phone || '', extra: 'inputmode="numeric" autocomplete="username" placeholder="10-digit mobile"' })}
      ${submit('Send my code', f.busy, 'Sending…')}
    </form>
    <p class="muted small auth-links">${link('signin', 'Back to sign in')}</p>
  </div>`, hubUrl);
}

export function resetPin({ ui, hubUrl = '' }) {
  const f = ui.auth || {};
  return frame(`<div class="auth-card">
    <h1 id="page-title" tabindex="-1">Choose a new PIN</h1>
    <p class="muted">Enter the code sent to ${escapeHtml(prettyPhone(f.phone || ''))} and pick a new PIN of 4 to 6 digits.</p>
    ${f.demoCode ? `<p class="notice" data-testid="demo-code">Demo only: nothing is really sent. Your code is <strong>${escapeHtml(f.demoCode)}</strong>.</p>` : ''}
    ${notices(f)}
    <form data-form="reset" class="auth-form" novalidate>
      ${field('code', '6-digit code', { extra: 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"' })}
      ${field('pin', 'New PIN', { type: 'password', extra: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
      ${field('pin2', 'New PIN again', { type: 'password', extra: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
      ${submit('Save new PIN', f.busy, 'Saving…')}
    </form>
    <p class="muted small auth-links">${link('forgot', 'Send a new code')} · ${link('signin', 'Back to sign in')}</p>
  </div>`, hubUrl);
}

export function setupScreen({ ui, hubUrl = '' }) {
  const f = ui.auth || {};
  return frame(`<div class="auth-card">
    <h1 id="page-title" tabindex="-1">First-time setup</h1>
    <p class="muted">Create the platform admin who adds businesses. You need the setup token from your Vercel settings. If a platform admin already exists, use their mobile number to reset the PIN.</p>
    ${notices(f)}
    <form data-form="setup" class="auth-form" novalidate>
      ${field('token', 'Setup token', { type: 'password', extra: 'autocomplete="off"' })}
      ${field('name', 'Your name', { value: f.name || '', extra: 'autocomplete="name"' })}
      ${field('phone', 'Mobile number', { type: 'tel', value: f.phone || '', extra: 'inputmode="numeric" autocomplete="username"' })}
      ${field('pin', 'PIN (4 to 6 digits)', { type: 'password', extra: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
      ${submit('Create platform admin', f.busy, 'Creating…')}
    </form>
    <p class="muted small auth-links">${link('signin', 'Back to sign in')}</p>
  </div>`, hubUrl);
}

/** Shown to someone on a temporary PIN: nothing else opens until they choose their own. */
export function mustChangePin({ ui, me, hubUrl = '' }) {
  const f = ui.auth || {};
  return frame(`<div class="auth-card">
    <h1 id="page-title" tabindex="-1">Choose your own PIN</h1>
    <p class="muted">Hello ${escapeHtml((me.name || '').split(' ')[0])}. The PIN you were given is temporary. Pick one only you know, 4 to 6 digits.</p>
    ${notices(f)}
    <form data-form="change-pin" class="auth-form" novalidate>
      ${field('current', 'Temporary PIN', { type: 'password', extra: 'inputmode="numeric" autocomplete="current-password" maxlength="6"' })}
      ${field('pin', 'New PIN', { type: 'password', extra: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
      ${field('pin2', 'New PIN again', { type: 'password', extra: 'inputmode="numeric" autocomplete="new-password" maxlength="6"' })}
      ${submit('Save and continue', f.busy, 'Saving…')}
    </form>
    <p class="muted small auth-links"><button type="button" class="link-btn" data-action="sign-out">Sign out</button></p>
  </div>`, hubUrl);
}
