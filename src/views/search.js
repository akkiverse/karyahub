// The search box in the top bar (CR-0015): bills, estimates, items and jobs on this device, only what this person may open.
import { icon } from '../ui/icons.js';
import { escapeHtml as e, rupees } from '../format.js';
import { W } from '../words.js';
import { canOpen } from '../domain/access.js';
import { billList, numberText, totalOf } from '../domain/bills.js';
import { listItems, qtyText, stockOf } from '../domain/inventory.js';
import { billHref } from './bills.js';

const MAX_EACH = 5;
const isMac = () => /mac|iphone|ipad/i.test(globalThis.navigator?.platform || '');

export function searchBox(ui) {
  return `<div class="gs" role="search">
    <label class="gs-field"><span class="sr-only">${W.searchEverything}</span>${icon('search', { size: 16 })}<input type="search" data-global-search autocomplete="off" placeholder="${W.searchEverything}" value="${e((ui && ui.gs) || '')}"><kbd class="gs-key" aria-hidden="true">${isMac() ? '⌘K' : 'Ctrl K'}</kbd></label>
    <div class="gs-panel" data-slot="gs-results" hidden></div>
  </div>`;
}

const group = (title, rows) => (rows.length ? `<p class="gs-title">${title}</p><ul>${rows.join('')}</ul>` : '');
const row = (href, main, side) => `<li><a class="gs-row" href="${href}" data-testid="gs-result"><span>${main}</span><span class="gs-side">${side}</span></a></li>`;

export function searchResults(state, me, q, today) {
  const text = String(q || '').trim();
  if (!text) return '';
  const docRows = (kind) => billList(state.documents, { kind, q: text }, today).rows.slice(0, MAX_EACH).map((d) => {
    const total = totalOf(d);
    return row(billHref(d), `<strong class="mono">${e(numberText(d))}</strong> ${e((d.customer || {}).name || '')}`, total === null ? '' : rupees(total / 100));
  });
  const parts = [];
  if (canOpen(me, 'bills')) parts.push(group(W.bills, docRows('invoice')), group(W.estimates, docRows('quote')));
  if (canOpen(me, 'inventory')) {
    parts.push(group('Items', listItems(state, { filter: 'all', q: text, f: {} }).slice(0, MAX_EACH)
      .map((i) => row(`#/inventory/item/${encodeURIComponent(i.id)}`, `<strong>${e(i.name)}</strong> <span class="mono muted">${e(i.code || '')}</span>`, i.service ? '' : e(qtyText(stockOf(state, i), i.unit))))));
  }
  if (canOpen(me, 'jobs')) {
    const words = text.toLowerCase().split(/\s+/);
    const jobs = (state.jobs || []).filter((j) => { const hay = `${j.id} ${j.customer_name || ''} ${j.equipment || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); }).slice(0, MAX_EACH);
    parts.push(group('Jobs', jobs.map((j) => row(`#/jobs/${encodeURIComponent(j.id)}`, `<strong>${e(j.customer_name || j.id)}</strong> ${e(j.equipment || '')}`, ''))));
  }
  const html = parts.join('');
  return html || `<p class="gs-none" data-testid="gs-none">${W.searchNothing}</p>`;
}
