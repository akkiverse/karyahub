// The History screen (CR-0016): everything that changed in the business, with who and when.
import { icon } from '../ui/icons.js';
import { escapeHtml as e, localDay, localClock } from '../format.js';
import { W } from '../words.js';
import { initials } from '../domain/access.js';
import { joinAddedLines } from '../domain/history.js';

export function historyRows(h, { demo, today }) {
  const entries = joinAddedLines(h.entries || []);
  if (h.error && !entries.length) return `<div class="empty" data-testid="history-error"><p>${e(h.error)}</p><button type="button" class="btn btn-secondary" data-action="hist-reload">${W.tryAgain}</button></div>`;
  if (h.loading && !entries.length) return `<p class="muted" role="status"><span class="spinner" aria-hidden="true"></span> ${W.historyLoading}</p>`;
  if (!entries.length) return `<div class="empty" data-testid="history-empty">${icon('clock', { size: 28 })}<p>${h.q || h.group || h.who ? W.historyNoMatch : W.historyEmpty}</p></div>`;
  let day = '';
  const rows = entries.map((x) => {
    const d = localDay(x.at, demo, today);
    const head = d !== day ? `<li class="hist-day">${e(d)}</li>` : '';
    day = d;
    return `${head}<li class="hist-row" data-testid="history-row"><span class="avatar" aria-hidden="true">${e(initials(x.who || '?'))}</span><span class="hist-main"><strong data-testid="history-who">${e(x.who)}</strong><span class="hist-text">${e(x.text ? x.text.charAt(0).toUpperCase() + x.text.slice(1) : x.action)}</span></span><time class="hist-when mono" datetime="${e(x.at)}">${e(localClock(x.at, demo))}</time></li>`;
  }).join('');
  return `<ol class="hist-list" data-testid="history-list">${rows}</ol>${h.more ? `<button type="button" class="btn btn-ghost" data-action="hist-more" data-testid="history-more" ${h.loading ? 'disabled' : ''}>${W.historyMore}</button>` : ''}`;
}

export function history({ ui, state, today }) {
  const h = ui.history || {};
  const demo = Boolean(state.settings.is_demo);
  const chip = (key, label) => `<button type="button" class="chip ${(h.group || '') === key ? 'is-on' : ''}" aria-pressed="${(h.group || '') === key}" data-action="hist-group" data-group="${key}">${label}</button>`;
  return `<section class="page page-wide history-page" aria-labelledby="page-title">
    <header class="page-head"><h1 id="page-title" tabindex="-1">${W.historyTitle}</h1><p class="muted">${demo ? W.historyLeadDemo : W.historyLead}</p></header>
    <div class="panel history-tools">
      <div class="history-tools-top">
        <label class="search"><span class="sr-only">${W.historySearch}</span>${icon('search', { size: 18 })}<input type="search" data-hist-search placeholder="${W.historySearch}" value="${e(h.q || '')}" autocomplete="off"></label>
        <label class="inv-filter"><span class="sr-only">${W.historyPerson}</span><select data-hist-who aria-label="${W.historyPerson}"><option value="">${W.historyEveryone}</option>${(h.people || []).map((p) => `<option value="${e(p)}" ${h.who === p ? 'selected' : ''}>${e(p)}</option>`).join('')}</select></label>
      </div>
      <div class="chips chips-scroll" role="group" aria-label="${W.historyTitle}">${chip('', W.historyAll)}${chip('stock', W.historyStock)}${chip('bills', W.historyBills)}${chip('jobs', W.historyJobs)}${chip('team', W.historyTeam)}${chip('settings', W.historySettings)}</div>
    </div>
    <div class="panel" data-slot="hist-results">${historyRows(h, { demo, today })}</div>
  </section>`;
}
