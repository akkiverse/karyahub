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
      key = SERVER_KEYS[sv.id];
      const m = meta && meta.data && meta.data.services ? meta.data.services.find((x) => x.id === sv.id) : null;
      status = meta && meta.error ? 'Unreachable' : m ? m.status : 'Checking';
    } else if (mode === 'live') status = configuredKeys[sv.key] ? 'Live' : 'Missing key';
    else status = 'Mock';
    const cls = status === 'Mock' ? 'status-mock' : status === 'Live' ? 'status-live' : status === 'Checking' ? 'status-mock' : 'status-missing';
    return `<li class="service" data-service="${sv.id}"><div><strong>${sv.label}</strong><span class="muted">${sv.purpose}</span><span class="key">Needs <code>${key}</code>${mode === 'server' ? ' on the server' : ''}</span></div><span class="status ${cls}" data-testid="service-status">${status}</span></li>`;
  }).join('');
}

export function settings({ state, ui }) {
  const s = state.settings;
  const mode = ['server', 'mock', 'live'].includes(s.mode) ? s.mode : 'server';
  const [title, text] = BANNERS[mode];
  const meta = ui.meta;
  const serverLine = mode === 'server'
    ? `<p class="server-line" data-testid="server-line">${icon('server', { size: 16 })} ${meta && meta.data ? `Connected to KaryaHub API v${escapeHtml(meta.data.version)} for ${escapeHtml(meta.data.tenant.business_name)}` : meta && meta.error ? "Can't reach the KaryaHub server. Chat falls back to the in-browser demo; proof of work and visit plans wait for the server." : 'Checking the KaryaHub server…'}</p>`
    : '';
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">Settings</h1></header>
    <div class="mode-banner ${mode === 'live' ? 'is-live' : ''}" data-testid="mode-banner">${icon(mode === 'server' ? 'server' : 'plug')}<div><strong>${title}</strong><p>${text}</p></div></div>
    ${serverLine}
    <h2 class="section-title">Services</h2>
    <ul class="services" data-testid="services">${serviceRows(mode, meta)}</ul>
    <fieldset class="setting">
      <legend>Where messages are processed</legend>
      <label class="radio"><input type="radio" name="mode" value="server" data-action="set-mode" ${mode === 'server' ? 'checked' : ''}> KaryaHub server (recommended)</label>
      <label class="radio"><input type="radio" name="mode" value="mock" data-action="set-mode" ${mode === 'mock' ? 'checked' : ''}> In this browser (offline demo)</label>
      <label class="radio"><input type="radio" name="mode" value="live" data-action="set-mode" ${mode === 'live' ? 'checked' : ''}> Live keys in the browser (shows the missing-key error)</label>
    </fieldset>
    <label class="switch setting">
      <input type="checkbox" role="switch" data-action="toggle-failure" ${s.simulate_failure ? 'checked' : ''}>
      <span><strong>Simulate failure</strong><span class="muted">Make the next message fail to read, to show how errors look.</span></span>
    </label>
    <fieldset class="setting">
      <legend>Theme</legend>
      ${['system', 'light', 'dark'].map((t) => `<label class="radio"><input type="radio" name="theme" value="${t}" data-action="set-theme" ${s.theme === t ? 'checked' : ''}> ${t === 'system' ? 'Follow system' : t[0].toUpperCase() + t.slice(1)}</label>`).join('')}
    </fieldset>
    <div class="setting danger">
      <div><strong>Reset demo</strong><span class="muted">Clear jobs, documents, chat and reminder marks, and reload the bundled demo data.</span></div>
      <button type="button" class="btn btn-secondary" data-action="reset">${icon('rotate', { size: 18 })} Reset demo</button>
    </div>
    ${ui.toast && ui.toast.where === 'settings' ? `<p class="notice" role="status">${escapeHtml(ui.toast.text)}</p>` : ''}
    <p class="muted small">Demo business: ${escapeHtml(s.business_name)}, GSTIN ${escapeHtml(s.gstin)} (dummy). All customer data is invented.</p>
  </section>`;
}
