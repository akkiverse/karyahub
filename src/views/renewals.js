import { icon } from '../ui/icons.js';
import { escapeHtml, rupees, prettyDate, daysBetween } from '../format.js';
import { dueWithin, lapsed, moneyAtStake } from '../domain/renewals.js';
import { today } from '../clock.js';

const FILTERS = [
  ['30', 'Next 30 days'],
  ['60', '60 days'],
  ['90', '90 days'],
  ['lapsed', 'Lapsed'],
];

export function renewals({ state, ui }) {
  const t = today();
  const f = ui.renewalsFilter || '30';
  const list = f === 'lapsed' ? lapsed(state.customers, t) : dueWithin(state.customers, t, Number(f));
  const total = moneyAtStake(list);
  const card = (c) => {
    const d = daysBetween(t, c.amc_expiry);
    const isLapsed = d < 0;
    const when = isLapsed ? `Lapsed ${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Ends today' : `Ends in ${d} day${d === 1 ? '' : 's'}`;
    return `<li class="renewal ${isLapsed ? 'is-lapsed' : ''}" data-customer="${c.id}">
      <div class="renewal-main">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="muted">${escapeHtml(c.equipment)}${c.area ? ` · ${escapeHtml(c.area)}` : ''}</span>
        <span class="when ${isLapsed ? 'label-lapsed' : d <= 14 ? 'label-soon' : ''}" ${isLapsed ? 'data-testid="lapsed-label"' : ''}>${when} · ${prettyDate(c.amc_expiry)}</span>
      </div>
      <div class="renewal-side">
        <strong class="amount">${rupees(c.amc_value)}</strong>
        ${c.reminded_at ? `<span class="badge badge-ok" data-testid="reminded">${icon('check', { size: 14 })} Reminded${state.settings.is_demo ? ' (demo)' : ''}</span>` : ''}
        <button type="button" class="btn btn-small ${c.reminded_at ? 'btn-ghost' : 'btn-primary'}" data-action="remind" data-id="${c.id}">${icon('bell', { size: 16 })} ${c.reminded_at ? 'Preview again' : 'Send reminder'}</button>
      </div>
    </li>`;
  };
  const sheet = ui.sheet ? sheetHtml(ui.sheet, state) : '';
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">Renewals</h1><p class="muted">AMC contracts by end date. Demo date: ${prettyDate(t)}.</p></header>
    <div class="chips" role="group" aria-label="Filter renewals">${FILTERS.map(([k, label]) => `<button type="button" class="chip ${f === k ? 'is-on' : ''}" aria-pressed="${f === k}" data-action="filter" data-filter="${k}">${label}</button>`).join('')}</div>
    <div class="stake-strip" data-testid="renewals-total"><span>${f === 'lapsed' ? 'Money already slipping' : 'Money at stake'}</span><strong data-amount="${total}">${rupees(total)}</strong><span class="muted">${list.length} contract${list.length === 1 ? '' : 's'}</span></div>
    ${list.length ? `<ul class="renewals" data-testid="renewals-list">${list.map(card).join('')}</ul>` : `<div class="empty" data-testid="renewals-empty">${icon('renewals', { size: 32 })}<p><strong>No contracts</strong> in this range.</p></div>`}
    ${sheet}
  </section>`;
}

function sheetHtml(sh, state) {
  const c = state.customers.find((x) => x.id === sh.customerId);
  if (!c) return '';
  return `<div class="sheet-backdrop" data-action="close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-testid="reminder-sheet">
    <div class="sheet-head"><h2 id="sheet-title">What ${escapeHtml(c.name.split(' ')[0])} would see</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">${icon('x')}</button></div>
    ${sh.error ? `<p class="notice notice-error" role="alert">${escapeHtml(sh.error)}</p>` : `<p class="notice" role="status">${icon('check', { size: 16 })} Preview only. No message was sent. Marked "Reminded${state.settings.is_demo ? ' (demo)' : ''}".</p>`}
    <div class="mini-phone">
      <div class="phone-bar small"><span class="avatar" aria-hidden="true">C</span><span class="who"><strong>${escapeHtml(state.settings.business_name)}</strong><small>Customer's WhatsApp, simulated</small></span></div>
      <div class="mini-thread"><p class="bubble in-bubble" data-testid="reminder-text">${escapeHtml(sh.text)}</p>
      <div class="quick-replies" aria-hidden="true"><span>YES, renew</span><span>Call me</span></div></div>
    </div>
  </div>`;
}
