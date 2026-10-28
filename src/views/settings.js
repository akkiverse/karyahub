import { icon } from '../ui/icons.js';
import { escapeHtml } from '../format.js';
import { SERVICES, configuredKeys } from '../config.js';

export function settings({ state, ui }) {
  const s = state.settings;
  const live = s.mode === 'live';
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">Settings</h1></header>
    <div class="mode-banner ${live ? 'is-live' : ''}" data-testid="mode-banner">${icon('plug')}<div><strong>${live ? 'Live mode: real services (keys needed)' : 'Demo mode: mock responses'}</strong><p>${live ? 'Every service below needs a key before it works. Screens show a clear error instead of crashing.' : 'Every outside service answers with bundled demo data. Nothing leaves this browser.'}</p></div></div>
    <h2 class="section-title">Services</h2>
    <ul class="services" data-testid="services">${SERVICES.map((sv) => {
      const has = Boolean(configuredKeys[sv.key]);
      const status = live ? (has ? 'Live' : 'Missing key') : 'Mock';
      return `<li class="service" data-service="${sv.id}"><div><strong>${sv.label}</strong><span class="muted">${sv.purpose}</span><span class="key">Needs <code>${sv.key}</code></span></div><span class="status ${status === 'Mock' ? 'status-mock' : status === 'Live' ? 'status-live' : 'status-missing'}" data-testid="service-status">${status}</span></li>`;
    }).join('')}</ul>
    <fieldset class="setting">
      <legend>Adapter mode</legend>
      <label class="radio"><input type="radio" name="mode" value="mock" data-action="set-mode" ${!live ? 'checked' : ''}> Demo (mock responses)</label>
      <label class="radio"><input type="radio" name="mode" value="live" data-action="set-mode" ${live ? 'checked' : ''}> Live (needs keys)</label>
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
