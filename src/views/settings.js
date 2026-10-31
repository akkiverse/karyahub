import { icon } from '../ui/icons.js';
import { escapeHtml } from '../format.js';
import { SERVICES, SERVER_KEYS, configuredKeys } from '../config.js';

const BANNERS = {
  server: ['Server mode: KaryaHub API', 'Messages are read by the KaryaHub server (Python). It holds the outside services and their keys; today it answers them with demo data, so nothing real is sent.'],
  mock: ['Demo mode: mock responses', 'Every outside service answers with bundled demo data. Nothing leaves this browser.'],
  live: ['Live mode: real services (keys needed)', 'Every service below needs a key before it works. Screens show a clear error instead of crashing.'],
};

function serviceRows(mode, meta) {
  return SERVICES.map((sv) => {
    let status;
    let key = sv.key;
    if (mode === 'server') {
      const m = meta && meta.data && meta.data.services ? meta.data.services.find((x) => x.id === sv.id) : null;
      key = (m && m.key) || SERVER_KEYS[sv.id];
      status = meta && meta.error ? 'Unreachable' : m ? m.status : 'Checking';
    } else if (mode === 'live') status = configuredKeys[sv.key] ? 'Live' : 'Missing key';
    else status = 'Mock';
    const cls = status === 'Mock' ? 'status-mock' : status === 'Live' || status === 'Studio AI' ? 'status-live' : status === 'Checking' ? 'status-mock' : 'status-missing';
    return `<li class="service" data-service="${sv.id}"><div><strong>${sv.label}</strong><span class="muted">${sv.purpose}</span><span class="key">Needs <code>${key}</code>${mode === 'server' ? ' on the server' : ''}</span></div><span class="status ${cls}" data-testid="service-status">${status}</span></li>`;
  }).join('');
}

function logoBlock(me) {
  const version = me && me.business && me.business.logo_version;
  return `<div class="logo-field" data-testid="logo-field">
    <span class="logo-label">Logo</span>
    ${version ? `<img class="logo-preview" data-testid="logo-preview" alt="Your logo" src="/api/v1/business/logo?v=${escapeHtml(version)}">` : '<span class="muted small">No logo yet. It shows on your quotes and invoices.</span>'}
    <div class="logo-actions"><label class="btn btn-secondary btn-small">${icon('file', { size: 16 })} ${version ? 'Replace logo' : 'Add a logo'}<input class="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp" data-action="pick-logo"></label>${version ? `<button type="button" class="btn btn-ghost btn-small" data-action="remove-logo">Remove logo</button>` : ''}</div>
  </div>`;
}

function profileForm(s, ui, locked, me) {
  const f = ui.profile || {};
  return `<section class="panel" aria-labelledby="profile-title">
    <div class="panel-head"><h2 class="panel-title" id="profile-title">Business details</h2></div>
    <p class="muted small">These appear on your quotes, invoices and reminders.</p>
    ${f.notice ? `<p class="notice ${f.notice.error ? 'notice-error' : ''}" role="${f.notice.error ? 'alert' : 'status'}" data-testid="profile-notice">${escapeHtml(f.notice.text)}</p>` : ''}
    <form data-form="business-profile" class="stack" novalidate>
      <label class="field"><span>Business name</span><input name="name" value="${escapeHtml(f.name ?? s.business_name)}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span>Address</span><input name="address" value="${escapeHtml(f.address ?? s.address)}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span>GSTIN</span><input name="gstin" maxlength="15" value="${escapeHtml(f.gstin ?? s.gstin)}" ${locked ? 'disabled' : ''}></label>
      ${locked ? '<p class="muted small">The demo business\'s details can\'t be changed.</p>' : `<button type="submit" class="btn btn-primary">${icon('check', { size: 18 })} Save details</button>`}
    </form>
    ${locked ? '' : logoBlock(me)}
  </section>`;
}

export function settings({ state, ui, me }) {
  const s = state.settings;
  const demo = Boolean(s.is_demo);
  const mode = ['server', 'mock', 'live'].includes(s.mode) ? s.mode : 'server';
  const [title, text] = BANNERS[mode];
  const meta = ui.meta;
  const serverLine = mode === 'server'
    ? `<p class="server-line" data-testid="server-line">${icon('server', { size: 16 })} ${meta && meta.data ? `Connected to KaryaHub API v${escapeHtml(meta.data.version)} for ${escapeHtml(meta.data.tenant.business_name)}` : meta && meta.error ? "Can't reach the KaryaHub server. Chat falls back to the in-browser demo; proof of work and visit plans wait for the server." : 'Checking the KaryaHub server…'}</p>`
    : '';
  const themeBlock = `<fieldset class="setting">
      <legend>Theme</legend>
      ${['system', 'light', 'dark'].map((t) => `<label class="radio"><input type="radio" name="theme" value="${t}" data-action="set-theme" ${s.theme === t ? 'checked' : ''}> ${t === 'system' ? 'Follow system' : t[0].toUpperCase() + t.slice(1)}</label>`).join('')}
    </fieldset>`;
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">Settings</h1></header>
    ${profileForm(s, ui, demo, me)}
    ${demo ? `<div class="mode-banner ${mode === 'live' ? 'is-live' : ''}" data-testid="mode-banner">${icon(mode === 'server' ? 'server' : 'plug')}<div><strong>${title}</strong><p>${text}</p></div></div>` : ''}
    ${serverLine}
    <h2 class="section-title">Services</h2>
    <ul class="services" data-testid="services">${serviceRows(mode, meta)}</ul>
    ${demo ? `<fieldset class="setting">
      <legend>Where messages are processed</legend>
      <label class="radio"><input type="radio" name="mode" value="server" data-action="set-mode" ${mode === 'server' ? 'checked' : ''}> KaryaHub server (recommended)</label>
      <label class="radio"><input type="radio" name="mode" value="mock" data-action="set-mode" ${mode === 'mock' ? 'checked' : ''}> In this browser (offline demo)</label>
      <label class="radio"><input type="radio" name="mode" value="live" data-action="set-mode" ${mode === 'live' ? 'checked' : ''}> Live keys in the browser (shows the missing-key error)</label>
    </fieldset>
    <label class="switch setting">
      <input type="checkbox" role="switch" data-action="toggle-failure" ${s.simulate_failure ? 'checked' : ''}>
      <span><strong>Simulate failure</strong><span class="muted">Make the next message fail to read, to show how errors look.</span></span>
    </label>` : ''}
    ${themeBlock}
    ${demo ? `<div class="setting danger">
      <div><strong>Reset demo</strong><span class="muted">Clear jobs, documents, chat and reminder marks, and reload the bundled demo data.</span></div>
      <button type="button" class="btn btn-secondary" data-action="reset">${icon('rotate', { size: 18 })} Reset demo</button>
    </div>` : ''}
    ${ui.toast && ui.toast.where === 'settings' ? `<p class="notice" role="status">${escapeHtml(ui.toast.text)}</p>` : ''}
    ${demo ? `<p class="muted small">Demo business: ${escapeHtml(s.business_name)}, GSTIN ${escapeHtml(s.gstin)} (dummy). All customer data is invented.</p>` : ''}
  </section>`;
}
