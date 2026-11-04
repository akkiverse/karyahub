import { W } from '../words.js';
// Inventory screens (CR-0011, US-25): the list, one item with its history, the add and edit form, the CSV import,
// and the sheets for stock in, stock out, count and taking a part for a job.
import { icon } from '../ui/icons.js';
import { escapeHtml, rupees, rupeesExact, localDmy } from '../format.js';
import { byTimeNewestFirst } from '../domain/history.js';
import { isSynced } from '../ids.js';
import { deviceToday, today } from '../clock.js';
import {
  UNITS, UNIT_NAMES, GST_RATES, MOVE_LABELS, qtyText, signedText, stockOf, markOf, markText, summary, listItems, historyOf,
  matches, nameOf, parseQty, dmy, r3, pickableUnits, unitsOf, unitMark, MAX_SELLS,
} from '../domain/inventory.js';
import { activeFields, pickable, detailsLine, detailOf } from '../domain/fields.js';

const e = escapeHtml;
const price = (paise) => (paise == null ? '—' : paise % 100 === 0 ? rupees(paise / 100) : rupeesExact(paise / 100));
const SAMPLE_NOTE = 'Sample stock for the demo. It stays on this device.';
export const CSV_COLUMNS = ['code', 'name', 'unit', 'sale_price', 'cost_price', 'hsn', 'gst_rate', 'low_stock_at', 'opening_stock', 'cut_from', 'cut_gives'];
/** The business's own template (CR-0013): code, name, then a column for each of its item details, then the rest. */
export function csvColumns(state) {
  return ['code', 'name', ...activeFields(state).map((f) => f.name), ...CSV_COLUMNS.slice(2)];
}
const csvCell = (t) => (/[",\n]/.test(t) ? `"${String(t).replace(/"/g, '""')}"` : String(t));
export function csvTemplate(state) {
  const fields = activeFields(state);
  const sample = fields.map((f) => (f.type === 'list' ? (pickable(state, f.id)[0] || { name: 'Example' }).name : f.type === 'number' ? '1' : 'Example'));
  const head = csvColumns(state).map(csvCell).join(',');
  const row = ['CAP-35', 'Capacitor 35 µF', ...sample.map(csvCell), 'nos', '380', '170', '8532', '18', '5', '10', '', ''].join(',');
  return `${head}\n${row}\n`;
}
export const CSV_TEMPLATE = csvTemplate({ item_fields: [] });

function markHtml(state, item, unit = item.unit) {
  if (item.service) return `<span class="mark mark-service" data-testid="mark">${W.service}</span>`; // CR-0012: never counted
  const q = stockOf(state, item, unit);
  const m = unitMark(state, item, unitsOf(item).find((u) => u.unit === unit));
  return m ? `<span class="mark mark-${m.kind}" data-testid="mark">${m.kind === 'low' ? icon('alert', { size: 12 }) : ''}${e(markText(m, q, unit))}</span>` : '';
}
function qtyHtml(state, item, unit = item.unit) {
  if (item.service) return '<span class="qty" data-testid="qty">–</span>';
  const q = stockOf(state, item, unit);
  const m = unitMark(state, item, unitsOf(item).find((u) => u.unit === unit));
  return `<span class="qty ${m ? `is-${m.kind}` : ''}" data-testid="qty">${e(qtyText(q, unit))}</span>`;
}
/** What an item holds in its other units, one small line each (CR-0014). */
function extrasHtml(state, item) {
  const more = unitsOf(item).filter((u) => !u.main);
  if (!more.length || item.service) return '';
  return `<span class="qty-extras small muted" data-testid="qty-extras">${more.map((u) => { const m = unitMark(state, item, u); return `${e(qtyText(stockOf(state, item, u.unit), u.unit))}${m ? ` · ${m.kind === 'low' ? 'Low' : 'Short'}` : ''}`; }).join(' · ')}</span>`;
}
const noticeHtml = (ui, key) => {
  const n = ui.inv && ui.inv.notice;
  return n && n.at === key ? `<p class="notice ${n.error ? 'notice-error' : ''}" role="${n.error ? 'alert' : 'status'}" data-testid="inv-notice">${icon(n.error ? 'alert' : 'check', { size: 18 })}<span>${e(n.text)}</span></p>` : '';
};
const fieldErr = (errors, k) => (errors[k] ? `<span class="field-error" id="err-${k}">${e(errors[k])}</span>` : '');
const inv = (errors, k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');

/** The stock cell of the table (CR-0015): − and + for one of the main unit, each one an ordinary stock move, and the low level under them. */
function stockCell(state, i, manage) {
  const extras = extrasHtml(state, i);
  if (i.service) return qtyHtml(state, i);
  const low = i.low == null ? '' : `<span class="cell-sub">Low at <span class="mono">${e(qtyText(i.low, i.unit))}</span></span>`;
  if (!manage || i.stopped) return `${qtyHtml(state, i)}${extras}${low}`;
  const q = stockOf(state, i);
  const step = (dir, sign, verb) => `<button type="button" class="step-btn" data-action="inv-step" data-dir="${dir}" data-item="${e(i.id)}" data-inv-step="${e(i.id)}:${dir}" aria-label="${verb} 1 ${e(UNITS[i.unit])}: ${e(i.name)}" ${dir === 'out' && q <= 0 ? 'disabled' : ''}>${icon(sign, { size: 16 })}</button>`;
  return `<span class="stepper">${step('out', 'minus', 'Take out')}${qtyHtml(state, i)}${step('in', 'plus', 'Add')}</span>${extras}${low}`;
}
/** Every stocked item gets a status word in the table: the existing mark, or In stock. */
function statusHtml(state, i) {
  if (i.stopped) return '<span class="mark mark-service">Stopped</span>';
  return markHtml(state, i) || '<span class="mark mark-ok">In stock</span>';
}

// ---------- the list ----------
export function chipsHtml(state, ui) {
  const c = summary(state);
  const f = (ui.inv && ui.inv.filter) || 'all';
  const chip = (k, label, n) => `<button type="button" class="chip ${f === k ? 'is-on' : ''}" aria-pressed="${f === k}" data-action="inv-filter" data-filter="${k}">${label} <span class="muted">${n}</span></button>`;
  return chip('all', 'All', c.all) + chip('low', 'Low', c.low) + chip('out', 'Out', c.out) + chip('stopped', 'Stopped', c.stopped);
}
/** A pick for each pick-list the owner marked as a filter (CR-0013). */
export function filtersHtml(state, ui) {
  const picked = (ui.inv && ui.inv.f) || {};
  return activeFields(state).filter((f) => f.type === 'list' && f.in_filter).map((f) => `<label class="inv-filter"><span class="sr-label">${e(f.name)}</span><select data-inv-filter="${e(f.id)}" aria-label="${e(f.name)}"><option value="">All ${e(f.name.toLowerCase())}s</option>${pickable(state, f.id).map((x) => `<option value="${e(x.id)}" ${picked[f.id] === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>`).join('');
}
export function resultsHtml(state, ui, allow) {
  const inv = ui.inv || {};
  const rows = listItems(state, { filter: inv.filter || 'all', q: inv.q || '', f: inv.f || {} });
  const category = activeFields(state).find((f) => /categor/i.test(f.name));
  const shown = activeFields(state).filter((f) => f.in_list);
  const shownAsColumns = shown.filter((f) => f !== category);
  const manage = allow('manage_inventory');
  if (!rows.length) {
    const q = String(inv.q || '').trim();
    const text = q ? `No items match “${q}”. Check the spelling, or add it as a new item.` : inv.filter === 'stopped' ? 'No stopped items. Items you stop using show here, with their history.' : (state.items || []).length ? 'Nothing here right now.' : 'No items yet.';
    return `<div class="empty" data-testid="inv-empty">${icon('search', { size: 28 })}<p>${e(text)}</p>${manage ? `<button type="button" class="btn btn-secondary" data-action="inv-add" data-name="${e(q)}">${icon('plus', { size: 18 })} Add ${q ? `“${e(q)}”` : 'an item'}</button>` : ''}</div>`;
  }
  const href = (i) => `#/inventory/item/${encodeURIComponent(i.id)}`;
  const cards = rows.map((i) => `<li class="row-card inv-card" data-item="${e(i.id)}"><a href="${href(i)}"><span class="row-main"><strong>${e(i.name)}</strong><span class="code">${e(i.code || 'No code')} · ${UNITS[i.unit]}${i.stopped ? ' · stopped' : ''}</span>${shown.length && detailsLine(state, i, 'in_list') ? `<span class="muted small" data-testid="card-details">${e(detailsLine(state, i, 'in_list'))}</span>` : ''}</span><span class="inv-card-side">${qtyHtml(state, i)}${extrasHtml(state, i)}${markHtml(state, i)}</span></a></li>`).join('');
  const table = `<div class="inv-table-wrap"><div class="table-wrap"><table class="table inv-table">
    <thead><tr><th scope="col">SKU</th><th scope="col">Item</th><th scope="col">${category ? `${e(category.name)} and ` : ''}HSN/SAC</th>${shownAsColumns.map((f) => `<th scope="col">${e(f.name)}</th>`).join('')}<th scope="col">In stock</th>${manage ? '<th scope="col" class="num">Cost price</th>' : ''}<th scope="col" class="num">Sale price</th><th scope="col" class="num">GST</th><th scope="col">Status</th></tr></thead>
    <tbody>${rows.map((i) => `<tr data-item="${e(i.id)}"><td><span class="sku">${e(i.code || '—')}</span></td><td><a class="row-name" href="${href(i)}">${e(i.name)}</a></td><td>${category && detailOf(state, i, category) ? `<span class="cell-main">${e(detailOf(state, i, category))}</span>` : ''}<span class="cell-sub mono">${i.hsn ? `HSN ${e(i.hsn)}` : '—'}</span></td>${shownAsColumns.map((f) => `<td>${e(detailOf(state, i, f) || '—')}</td>`).join('')}<td>${stockCell(state, i, manage)}</td>${manage ? `<td class="num mono">${price(i.cost)}</td>` : ''}<td class="num"><span class="mono">${price(i.sale)}</span><span class="muted small"> /${UNITS[i.unit]}</span></td><td class="num mono">${i.service && i.gst == null ? '—' : `${e(i.gst)}%`}</td><td>${statusHtml(state, i)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
  return `<ul class="inv-cards" data-testid="inv-list">${cards}</ul>${table}<p class="muted small">${rows.length} item${rows.length === 1 ? '' : 's'} shown. Search works on this phone's copy, with or without signal.</p>`;
}

export function inventory({ state, ui, allow }) {
  const c = summary(state);
  const manage = allow('manage_inventory');
  const demo = !isSynced(state);
  return `<section class="page page-wide" aria-labelledby="page-title">
    ${noticeHtml(ui, 'inventory')}
    <div class="page-head-row">
      <header class="page-head"><h1 id="page-title" tabindex="-1">Inventory</h1><p class="muted">${demo ? SAMPLE_NOTE : "Parts in your store. Parts for a job are taken on the job's screen."}</p></header>
      ${manage ? `<div class="actions"><a class="btn btn-ghost" href="#/inventory/fields">${icon('settings', { size: 18 })} Item details</a>${demo ? '' : `<a class="btn btn-secondary" href="#/inventory/import">${icon('upload', { size: 18 })} Import CSV</a>`}<a class="btn btn-primary" href="#/inventory/new">${icon('plus', { size: 18 })} Add item</a></div>` : ''}
    </div>
    <ul class="kpis inv-kpis" data-testid="inv-kpis">
      <li class="kpi"><span class="kpi-label">${icon('box', { size: 16 })} Items</span><span class="kpi-value" data-testid="kpi-items">${c.all}</span><span class="kpi-sub muted">in use</span></li>
      <li class="kpi"><span class="kpi-label">${icon('alert', { size: 16 })} Low stock</span><span class="kpi-value ${c.low ? 'is-low' : ''}" data-testid="kpi-low">${c.low}</span><span class="kpi-sub muted">at or below their level</span></li>
      <li class="kpi"><span class="kpi-label">${icon('x', { size: 16 })} Out or short</span><span class="kpi-value ${c.out ? 'is-out' : ''}" data-testid="kpi-out">${c.out}</span><span class="kpi-sub muted">count or reorder</span></li>
      ${manage ? `<li class="kpi"><span class="kpi-label">${icon('file', { size: 16 })} Stock value</span><span class="kpi-value money" data-testid="kpi-value">${price(c.value)}</span><span class="kpi-sub muted">at cost price</span></li>` : ''}
    </ul>
    ${manage ? '' : `<p class="notice" data-testid="inv-readonly">${icon('shield', { size: 18 })}<span>You can see inventory. Ask the office to add or correct stock.</span></p>`}
    <div class="panel inv-tools">
      <div class="inv-search">${icon('search', { size: 18 })}<label class="sr-label" for="inv-q">Search inventory by name or code</label><input id="inv-q" type="search" placeholder="Search name or code, e.g. cap 45" value="${e((ui.inv && ui.inv.q) || '')}" autocomplete="off" data-inv-search></div>
      <div class="chips" role="group" aria-label="Show" data-slot="inv-chips">${chipsHtml(state, ui)}</div>
      <div class="inv-filters" data-slot="inv-filters">${filtersHtml(state, ui)}</div>
    </div>
    <div data-slot="inv-results">${resultsHtml(state, ui, allow)}</div>
  </section>`;
}

// ---------- one item ----------
export function itemPage({ state, ui, params, allow }) {
  const it = (state.items || []).find((i) => i.id === params.id);
  if (!it) return `<section class="page"><a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a><h1 id="page-title" tabindex="-1">Item not found</h1><div class="empty"><p>This item isn't in your inventory.</p></div></section>`;
  const manage = allow('manage_inventory');
  const q = stockOf(state, it);
  const mark = markOf(q, it.low);
  const units = unitsOf(it);
  const histUnit = units.some((u) => u.unit === (ui.inv && ui.inv.histUnit)) ? ui.inv.histUnit : it.unit;
  const history = historyOf(state, it, histUnit);
  // Stock moves and the item's own changes, in one list, newest first (CR-0016).
  const timeline = [...(it.history || []).map((h) => ({ ...h, item_line: true })).reverse(), ...history].sort(byTimeNewestFirst);
  const canSee = allow('view_inventory');
  return `<section class="page" aria-labelledby="page-title">
    <a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a>
    ${noticeHtml(ui, `item:${it.id}`)}
    <div class="page-head-row">
      <div class="item-head"><h1 id="page-title" tabindex="-1">${e(it.name)} ${markHtml(state, it)}</h1>
        <p class="muted">${e(it.code || 'No code')} · ${UNIT_NAMES[it.unit]} · HSN ${e(it.hsn || '—')} · GST ${it.gst} %${it.stopped ? ' · <strong>Stopped</strong>' : ''}</p>
        ${detailsLine(state, it) ? `<p class="muted" data-testid="item-details">${e(detailsLine(state, it))}</p>` : ''}</div>
      ${manage ? `<div class="actions">
        ${it.stopped ? '' : `<button type="button" class="btn btn-primary" data-action="inv-sheet" data-type="in">${icon('plus', { size: 18 })} Stock in</button>
        <button type="button" class="btn btn-secondary" data-action="inv-sheet" data-type="out">${icon('minus', { size: 18 })} Stock out</button>
        <button type="button" class="btn btn-ghost" data-action="inv-sheet" data-type="count">${icon('count', { size: 18 })} Count</button>
        ${units.length > 1 ? `<button type="button" class="btn btn-secondary" data-action="inv-sheet" data-type="cut" data-testid="cut-button">${icon('minus', { size: 18 })} Cut</button>` : ''}`}
        <a class="btn btn-ghost" href="#/inventory/item/${encodeURIComponent(it.id)}/edit">${icon('pencil', { size: 18 })} Edit</a>
        <button type="button" class="btn ${it.stopped ? 'btn-secondary' : 'btn-danger-ghost'}" data-action="inv-stop" data-stopped="${it.stopped ? 'false' : 'true'}">${icon(it.stopped ? 'rotate' : 'archive', { size: 18 })} ${it.stopped ? 'Use again' : 'Stop using'}</button>
      </div>` : ''}
    </div>
    ${mark && mark.kind === 'short' ? `<p class="notice notice-error" data-testid="short-note">${icon('alert', { size: 18 })}<span>The records say ${e(qtyText(q, it.unit))}: more was used than was in stock, perhaps on two phones without signal. ${manage ? 'Count what is on the shelf and press Count.' : 'Tell the office so they can count it.'}</span></p>` : ''}
    ${manage ? '' : `<p class="notice">${icon('shield', { size: 18 })}<span>Ask the office to add or correct stock.</span></p>`}
    <ul class="kpis inv-kpis">
      <li class="kpi"><span class="kpi-label">${icon('box', { size: 16 })} In stock</span><span class="kpi-value">${qtyHtml(state, it)}</span><span class="kpi-sub muted">${it.low == null ? 'No low-stock level' : `Low at ${e(qtyText(it.low, it.unit))}`}</span></li>
      <li class="kpi"><span class="kpi-label">Sale price</span><span class="kpi-value">${price(it.sale)}</span><span class="kpi-sub muted">per ${UNITS[it.unit]}, on quotes and invoices</span></li>
      ${manage ? `<li class="kpi"><span class="kpi-label">Cost price</span><span class="kpi-value">${price(it.cost)}</span><span class="kpi-sub muted">Value in stock ${price(Math.round(Math.max(q, 0) * (it.cost || 0)))}</span></li>` : ''}
      ${units.slice(1).map((u) => `<li class="kpi" data-unit-kpi="${e(u.unit)}"><span class="kpi-label">${icon('box', { size: 16 })} ${e(UNITS[u.unit])}</span><span class="kpi-value">${qtyHtml(state, it, u.unit)}</span><span class="kpi-sub muted">${price(u.sale)} per ${e(UNITS[u.unit])}${u.low == null ? '' : ` · Low at ${e(qtyText(u.low, u.unit))}`}${manage && u.cost != null ? ` · cost ${price(u.cost)}` : ''}${u.cut_from ? ` · 1 ${e(UNITS[u.cut_from] || '')} gives ${e(qtyText(u.cut_gives, u.unit))}` : ''}</span></li>`).join('')}
    </ul>
    ${canSee ? `<div class="panel">
      <div class="panel-head"><h2 class="panel-title">History</h2><span class="muted small">Who did what. Moves can't be changed: a mistake is fixed with a new move.</span></div>
      ${units.length > 1 ? `<div class="chips" role="group" aria-label="History of" data-testid="hist-units">${units.map((u) => `<button type="button" class="chip ${u.unit === histUnit ? 'is-on' : ''}" aria-pressed="${u.unit === histUnit}" data-action="inv-hist-unit" data-unit="${e(u.unit)}">${e(UNITS[u.unit])}</button>`).join('')}</div>` : ''}
      ${timeline.length ? `<ol class="moves" data-testid="inv-history">${timeline.map((m) => (m.item_line ? `<li class="move move-item" data-kind="item" data-testid="item-line">
        <span class="move-date">${e(localDmy(m.at, !isSynced(state)))}</span>
        <span class="move-what"><strong>${e(m.what)}</strong><span class="muted small" data-testid="move-who">${e(m.who)}</span></span>
        <span class="move-qty"></span>
      </li>` : `<li class="move" data-kind="${m.kind}">
        <span class="move-date">${e(dmy(m.date))}</span>
        <span class="move-what"><strong>${MOVE_LABELS[m.kind] || m.kind}${m.kind === 'cut' ? (m.unit === histUnit ? ` into ${e(qtyText(m.gave, m.to_unit))}` : ` from ${e(UNITS[m.unit])}`) : ''}${m.job_id ? ` · <a href="#/jobs/${encodeURIComponent(m.job_id)}">job</a>` : ''}${m.after === undefined ? ' <span class="tag tag-soon">Waiting to send</span>' : ''}</strong><span class="muted small">${e(m.who || '')}${m.note ? ` · ${e(m.note)}` : ''}</span></span>
        <span class="move-qty"><strong class="${m.qty > 0 ? 'is-in' : ''}">${e(signedText(m.qty, histUnit))}</strong><span class="muted small">then ${e(qtyText(m.shown_after, histUnit))}</span></span>
      </li>`)).join('')}</ol>` : '<p class="muted">No moves yet.</p>'}
    </div>` : ''}
    ${stockSheet({ state, ui })}
  </section>`;
}

// ---------- the add and edit form ----------
/** An item's other units as the form's rows (CR-0014). */
function sellValues(it) {
  const out = {};
  (it.sells || []).forEach((x, i) => {
    Object.assign(out, { [`sell_unit_${i}`]: x.unit, [`sell_sale_${i}`]: x.sale / 100, [`sell_cost_${i}`]: x.cost == null ? '' : x.cost / 100, [`sell_low_${i}`]: x.low ?? '', [`sell_cut_from_${i}`]: x.cut_from || '', [`sell_cut_gives_${i}`]: x.cut_gives ?? '' });
  });
  return out;
}
/** The rows of "Also sold as": one per other unit, each with its own price, level and cut. */
function sellRows(state, v, errors, manage, isNew) {
  const rows = [];
  for (let i = 0; Object.prototype.hasOwnProperty.call(v, `sell_unit_${i}`); i += 1) rows.push(i);
  const k = (n, i) => `sell_${n}_${i}`;
  const unitName = (id) => (id === '__new__' ? v.new_unit || 'the new unit' : UNITS[id] || '');
  const field = (label, name, i, hint = '', extra = '') => `<label class="field">${label}${hint ? ` <span class="field-hint">${hint}</span>` : ''}<input name="${k(name, i)}" value="${e(v[k(name, i)] ?? '')}" ${inv(errors, k(name, i))} autocomplete="off" ${extra}>${fieldErr(errors, k(name, i))}</label>`;
  const items = rows.map((i) => {
    const mine = v[k('unit', i)];
    const from = [v.unit, ...rows.map((j) => v[k('unit', j)])].filter((u, at, all) => u && u !== mine && all.indexOf(u) === at);
    const cut = v[k('cut_from', i)];
    return `<li class="sell-row" data-sell="${i}">
      <div class="sell-head"><strong>${mine ? e((pickableUnits(state, mine).find((u) => u.id === mine) || { name: UNITS[mine] }).name) : `Unit ${i + 2}`}</strong><button type="button" class="btn btn-ghost btn-small" data-action="inv-remove-unit" data-i="${i}">Take this unit off</button></div>
      <div class="sell-grid">
        <label class="field">Unit<select name="${k('unit', i)}" ${inv(errors, k('unit', i))}><option value="">Choose a unit</option>${pickableUnits(state, mine).map((u) => `<option value="${e(u.id)}" ${mine === u.id ? 'selected' : ''}>${e(u.name)}</option>`).join('')}</select>${fieldErr(errors, k('unit', i))}</label>
        ${field('Sale price (₹)', 'sale', i, '', 'inputmode="decimal"')}
        ${manage ? field('Cost price (₹)', 'cost', i, 'optional', 'inputmode="decimal"') : ''}
        ${field('Low-stock level', 'low', i, 'optional', 'inputmode="decimal"')}
        <label class="field">Made by cutting <span class="field-hint">optional</span><select name="${k('cut_from', i)}" ${inv(errors, k('cut_from', i))}><option value="">Not cut from another unit</option>${from.map((u) => `<option value="${e(u)}" ${cut === u ? 'selected' : ''}>Cut from ${e(unitName(u))}</option>`).join('')}</select>${fieldErr(errors, k('cut_from', i))}</label>
        ${cut ? field(`One ${e(unitName(cut))} gives`, 'cut_gives', i, 'the usual amount', 'inputmode="decimal"') : ''}
        ${isNew ? field('Opening stock', 'opening', i, 'optional', 'inputmode="decimal"') : ''}
      </div>
    </li>`;
  }).join('');
  return `<fieldset class="sells" data-testid="sells"><legend>Also sold as</legend>
    <p class="muted small">Sold in another unit too, for example loose metres as well as coils? Each unit has its own price and its own stock.</p>
    ${rows.length ? `<ul class="sell-rows">${items}</ul>` : ''}${fieldErr(errors, 'sells')}
    ${rows.length < MAX_SELLS ? `<button type="button" class="btn btn-secondary btn-small" data-action="inv-add-unit" data-testid="add-unit">${icon('plus', { size: 16 })} Add a unit</button>` : ''}
  </fieldset>`;
}
/** One of the business's own details on the item form: text, a number, or a list to pick from (or type a new one). */
function detailInput(state, f, v, errors, manage) {
  const k = `attr:${f.id}`;
  const label = `${e(f.name)}${f.required ? '' : ' <span class="field-hint">optional</span>'}`;
  if (f.type === 'list') {
    return `<label class="field">${label}<input name="${k}" list="dl-${e(f.id)}" value="${e(v[k] ?? '')}" ${inv(errors, k)} autocomplete="off" data-testid="detail-${e(f.id)}"><datalist id="dl-${e(f.id)}">${pickable(state, f.id).map((x) => `<option value="${e(x.name)}"></option>`).join('')}</datalist><span class="field-hint">${manage ? 'Pick one, or type a new one to add it to the list' : 'Pick one from the list'}</span>${fieldErr(errors, k)}</label>`;
  }
  return `<label class="field">${label}<input name="${k}" value="${e(v[k] ?? '')}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} ${inv(errors, k)} autocomplete="off" data-testid="detail-${e(f.id)}">${fieldErr(errors, k)}</label>`;
}
export function itemForm({ state, ui, params, allow }) {
  const manage = allow ? allow('manage_inventory') : true;
  const it = params.id ? (state.items || []).find((i) => i.id === params.id) : null;
  if (params.id && !it) return `<section class="page"><a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a><h1 id="page-title" tabindex="-1">Item not found</h1><div class="empty"><p>This item isn't in your inventory.</p></div></section>`;
  const key = params.id || 'new';
  const f = ui.inv && ui.inv.form && ui.inv.form.key === key ? ui.inv.form : null;
  const v = (f && f.values) || (it
    ? { name: it.name, code: it.code || '', unit: it.unit, sale: it.sale / 100, cost: it.cost == null ? '' : it.cost / 100, hsn: it.hsn || '', gst: String(it.gst), low: it.low ?? '', price_includes_gst: Boolean(it.price_includes_gst), service: Boolean(it.service), ...Object.fromEntries(activeFields(state).map((x) => [`attr:${x.id}`, detailOf(state, it, x)])), ...sellValues(it) }
    : { unit: 'nos', gst: '18', name: (ui.inv && ui.inv.prefill) || '' });
  const errors = (f && f.errors) || {};
  const input = (k, label, hint = '', extra = '') => `<label class="field">${label}${hint ? ` <span class="field-hint">${hint}</span>` : ''}<input name="${k}" value="${e(v[k] ?? '')}" ${inv(errors, k)} ${extra} autocomplete="off">${fieldErr(errors, k)}</label>`;
  const back = it ? `#/inventory/item/${encodeURIComponent(it.id)}` : '#/inventory';
  return `<section class="page" aria-labelledby="page-title">
    <a class="back" href="${back}">${icon('arrowLeft', { size: 18 })} ${it ? e(it.name) : 'Inventory'}</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">${it ? 'Edit item' : 'Add an item'}</h1><p class="muted">${it ? 'The quantity changes only through Stock in, Stock out, Count and parts used on jobs.' : 'One part or material you keep in the store.'}</p></header>
    <form class="panel item-form" data-form="inv-item" data-item="${e(params.id || '')}" novalidate>
      <section class="form-section" aria-labelledby="fs-item">
        <h2 class="form-section-title" id="fs-item">The item</h2>
        <div class="form-grid">
        ${input('name', 'Name', '', 'data-autofocus placeholder="for example Capacitor 35 µF"')}
        ${input('code', 'Code', 'optional, unique in your business', 'placeholder="for example CAP-35"')}
        <label class="field">Unit<select name="unit" data-unit-select ${inv(errors, 'unit')}>${pickableUnits(state, it && it.unit).map((u) => `<option value="${e(u.id)}" ${v.unit === u.id ? 'selected' : ''}>${e(u.name)}</option>`).join('')}${manage ? `<option value="__new__" ${v.unit === '__new__' ? 'selected' : ''}>New unit…</option>` : ''}</select>${fieldErr(errors, 'unit')}</label>
        <div class="field new-unit" data-slot="new-unit" ${v.unit === '__new__' ? '' : 'hidden'}>${input('new_unit', 'Name of the new unit', 'up to 12 letters, for example Coil', 'maxlength="12"')}<label class="check-line"><input type="checkbox" name="new_unit_whole" ${v.new_unit_whole ? 'checked' : ''}> Whole numbers only</label></div>
        ${activeFields(state).map((x) => detailInput(state, x, v, errors, manage)).join('')}
        </div>
      </section>
      <section class="form-section" aria-labelledby="fs-price">
        <h2 class="form-section-title" id="fs-price">Prices and tax</h2>
        <div class="form-grid">
        ${input('sale', 'Sale price (₹)', 'per unit, used on estimates and bills', 'inputmode="decimal"')}
        ${input('cost', 'Cost price (₹)', 'optional; only people who manage inventory see it', 'inputmode="decimal"')}
        <label class="field">GST rate<select name="gst" ${inv(errors, 'gst')}>${GST_RATES.map((g) => `<option value="${g}" ${String(v.gst) === String(g) ? 'selected' : ''}>${g} %</option>`).join('')}</select>${fieldErr(errors, 'gst')}</label>
        ${input('hsn', 'HSN code', 'optional, 4, 6 or 8 digits', 'inputmode="numeric"')}
        </div>
        <div class="check-row"><label class="check-line"><input type="checkbox" name="price_includes_gst" ${v.price_includes_gst ? 'checked' : ''}><span>${W.priceIncludesGst} <span class="muted small">(MRP)</span></span></label><label class="check-line"><input type="checkbox" name="service" ${v.service ? 'checked' : ''}><span>${W.service} <span class="muted small">(for example Gas refill)</span></span></label></div>
      </section>
      <section class="form-section" aria-labelledby="fs-stock">
        <h2 class="form-section-title" id="fs-stock">Stock</h2>
        <div class="form-grid">
        ${input('low', 'Low-stock level', 'optional; marked Low at or below this', 'inputmode="decimal"')}
        ${it ? '' : input('opening', 'Opening stock', 'optional; what is on the shelf today', 'inputmode="decimal"')}
        </div>
      </section>
      ${v.service === true || v.service === 'on' ? '' : sellRows(state, v, errors, manage, !it)}
      <div class="actions"><a class="btn btn-ghost" href="${back}">Cancel</a><button type="submit" class="btn btn-primary">${it ? 'Save changes' : 'Add item'}</button></div>
    </form>
  </section>`;
}

// ---------- the CSV import ----------
/** What this file will add to the lists, columns nobody asked for, and names that may be typos. */
function addsHtml(c) {
  const adds = c.adds || {};
  const lists = adds.lists || [];
  const units = adds.units || [];
  const unknown = c.unknown || [];
  const typos = (c.rows || []).filter((r) => r.status !== 'problem').flatMap((r) => r.notes.filter((x) => /did you mean/.test(x)).map((x) => `Row ${r.row}: ${x}`));
  const bits = [];
  if (units.length || lists.length) {
    bits.push(`<p class="notice" data-testid="csv-adds">${icon('plus', { size: 18 })}<span><strong>Will be added to your lists:</strong> ${[...units.length ? [`units: ${units.map(e).join(', ')}`] : [], ...lists.map((l) => `${e(l.field)}: ${l.values.map(e).join(', ')}`)].join('; ')}.</span></p>`);
  }
  if (typos.length) bits.push(`<div class="notice notice-error" role="alert" style="display:block" data-testid="csv-typos"><strong>Check these spellings before you import</strong><ul>${typos.map((x) => `<li>${e(x)}.</li>`).join('')}</ul></div>`);
  if (unknown.length) bits.push(`<p class="notice" data-testid="csv-unknown">${icon('alert', { size: 18 })}<span><strong>Not imported:</strong> ${unknown.map((x) => `<code>${e(x)}</code>`).join(', ')}. To keep a column, add it as a detail in <a href="#/inventory/fields">Item details</a> and check the file again.</span></p>`);
  return bits.join('');
}
export function inventoryImport({ state, ui }) {
  const c = ui.inv && ui.inv.csv;
  const rows = c && c.rows;
  const n = (s) => (c && c.counts ? c.counts[s] || 0 : 0);
  const good = n('new') + n('update') + n('unit');
  const tag = { unit: '<span class="tag tag-soon">Another unit</span>', new: '<span class="tag">New</span>', update: '<span class="tag tag-soon">Update</span>', same: '<span class="tag tag-past">No change</span>', problem: '<span class="tag tag-lapsed">Problem</span>' };
  const result = ui.inv && ui.inv.csvResult;
  return `<section class="page page-wide" aria-labelledby="page-title">
    <a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">Import items from a CSV file</h1><p class="muted">Make the file in Excel or Google Sheets and save it as CSV. A big file is checked and imported in parts of 500 rows.</p></header>
    ${result ? `<p class="notice" role="status" data-testid="csv-result">${icon('check', { size: 18 })}<span>${result}</span></p>` : ''}
    <p class="notice">${icon('server', { size: 18 })}<span>Importing needs a signal, because each code is checked against your whole business.</span></p>
    <div class="panel">
      <ol class="start-steps">
        <li class="start-step"><span class="step-num">1</span><div><h3>Download the template</h3><p class="muted">Columns: ${csvColumns(state).map((x) => `<code>${e(x)}</code>`).join(', ')}. Only <code>name</code> is needed; prices are in rupees. An item sold in several units has one row for each, with the same code: the first row is its main unit, and a later row can say <code>cut_from</code> (for example Coil) and <code>cut_gives</code> (90). ${activeFields(state).length ? 'Your own details are columns too, named as in <a href="#/inventory/fields">Item details</a>.' : 'Add your own columns, such as Brand, in <a href="#/inventory/fields">Item details</a> first.'}</p><button type="button" class="btn btn-ghost btn-small" data-action="inv-template">${icon('download', { size: 18 })} Download template</button></div></li>
        <li class="start-step"><span class="step-num">2</span><div><h3>Choose your file</h3><p class="muted">KaryaHub checks every row before anything is saved.</p>
          <div class="actions"><label class="btn btn-secondary file-pick">${icon('upload', { size: 18 })} Choose a CSV file<input type="file" accept=".csv,text/csv" data-action="pick-inv-csv"></label></div></div></li>
        <li class="start-step"><span class="step-num">3</span><div><h3>Check, then import</h3><p class="muted">Rows with a problem are skipped; fix them in the file and import it again. A code that is already in your inventory updates that item. Importing the same file twice changes nothing.</p></div></li>
      </ol>
    </div>
    ${c && c.checking ? `<p class="muted" role="status" data-testid="csv-checking"><span class="spinner" aria-hidden="true"></span> Checking ${e(c.file)}…</p>` : ''}
    ${c && c.error ? `<p class="notice notice-error" role="alert" data-testid="csv-error">${icon('alert', { size: 18 })}<span>${e(c.error)}</span></p>${c.text ? '<button type="button" class="btn btn-secondary btn-small" data-action="inv-check-again">Try again</button>' : ''}` : ''}
    ${rows ? `
    <div class="panel" aria-labelledby="h-check">
      <div class="panel-head"><h2 class="panel-title" id="h-check">Check: ${e(c.file)}</h2><span class="muted small">${rows.length} rows</span></div>
      <ul class="kpis inv-kpis">
        <li class="kpi"><span class="kpi-label">New items</span><span class="kpi-value" data-testid="csv-new">${n('new')}</span></li>
        ${n('unit') ? `<li class="kpi"><span class="kpi-label">Unit rows</span><span class="kpi-value" data-testid="csv-unit">${n('unit')}</span><span class="kpi-sub muted">other units of an item</span></li>` : ''}<li class="kpi"><span class="kpi-label">Updates</span><span class="kpi-value" data-testid="csv-update">${n('update')}</span>${n('same') ? `<span class="kpi-sub muted">${n('same')} already up to date</span>` : ''}</li>
        <li class="kpi"><span class="kpi-label">Problems</span><span class="kpi-value ${n('problem') ? 'is-out' : ''}" data-testid="csv-problem">${n('problem')}</span><span class="kpi-sub muted">skipped</span></li>
      </ul>
      ${addsHtml(c)}
      ${n('problem') ? `<div class="import-errors notice notice-error" role="alert" style="display:block" data-testid="csv-problems"><strong>Rows with a problem</strong><ul>${rows.filter((r) => r.status === 'problem').map((r) => `<li>Row ${r.row}: ${e(r.problems.join('; '))}.</li>`).join('')}</ul></div>` : ''}
      <div class="table-wrap"><table class="table import-table">
        <thead><tr><th scope="col">Row</th><th scope="col">Result</th><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Unit</th>${rows.some((r) => r.details) ? '<th scope="col">Details</th>' : ''}<th scope="col" class="num">Sale ₹</th><th scope="col" class="num">Opening</th><th scope="col">Why</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="num">${r.row}</td><td>${tag[r.status]}</td><td class="code">${e(r.code || '—')}</td><td>${e(r.name || '—')}</td><td>${e(r.unit)}</td>${rows.some((x) => x.details) ? `<td class="small">${e(r.details || '')}</td>` : ''}<td class="num">${e(r.sale_price)}</td><td class="num">${e(r.opening_stock)}</td><td class="why ${r.problems.length ? '' : 'is-note'}">${e((r.problems.length ? r.problems : r.notes).join('; '))}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="actions"><button type="button" class="btn btn-primary" data-action="inv-do-import" ${good && !c.saving ? '' : 'disabled'}>${c.saving ? 'Importing…' : good ? `Import ${good} good row${good === 1 ? '' : 's'}` : 'Nothing to import'}</button><button type="button" class="btn btn-ghost" data-action="inv-clear-csv">Choose another file</button></div>
    </div>` : ''}
  </section>`;
}

// ---------- sheets: stock in, stock out, count, and taking a part for a job ----------
function pickRows(state, q) {
  const list = (state.items || []).filter((i) => !i.stopped && (!q || matches(i, q))).sort(nameOf);
  if (!list.length) return '<li class="muted" style="padding:12px">No items match. Ask the office to add it.</li>';
  return list.map((i) => `<li><button type="button" data-action="inv-pick-item" data-item="${e(i.id)}"><span class="row-main"><strong>${e(i.name)}</strong><span class="code">${e(i.code || 'No code')}</span></span><span class="inv-card-side">${qtyHtml(state, i)}${markHtml(state, i)}</span></button></li>`).join('');
}
export { pickRows };

export function stockSheet({ state, ui }) {
  const sh = ui.inv && ui.inv.sheet;
  if (!sh) return '';
  const it = sh.item ? (state.items || []).find((i) => i.id === sh.item) : null;
  const errors = sh.errors || {};
  const v = sh.values || {};
  const units = it ? unitsOf(it) : [];
  const su = it && units.some((u) => u.unit === sh.unit) ? sh.unit : it && it.unit; // the unit this move is in (CR-0014)
  const unitPick = () => (units.length > 1 && sh.type !== 'pick' ? `<label class="field">Unit<select name="unit" data-sheet-unit>${units.map((u) => `<option value="${e(u.unit)}" ${u.unit === su ? 'selected' : ''}>${e(UNITS[u.unit])}</option>`).join('')}</select></label>` : '');
  const qtyField = (label) => `<label class="field">${label}<span class="unit-field"><input name="qty" inputmode="decimal" autocomplete="off" value="${e(v.qty ?? '')}" ${inv(errors, 'qty')} data-autofocus data-qty><span>${UNITS[su]}</span></span>${fieldErr(errors, 'qty')}</label>`;
  let title = '';
  let body = '';
  let save = '';
  if (sh.type === 'in') {
    save = 'Save stock in';
    title = `Stock in: ${it.name}`;
    body = `<p class="muted">In stock now: ${qtyHtml(state, it, su)}</p>
      ${unitPick()}
      <div class="form-grid">${qtyField('Quantity received')}
        <label class="field">Date <span class="field-hint">dd-mm-yyyy</span><input name="date" inputmode="numeric" value="${e(v.date ?? dmy(isSynced(state) ? deviceToday() : today()))}" ${inv(errors, 'date')}>${fieldErr(errors, 'date')}</label>
        <label class="field">Supplier <span class="field-hint">optional</span><input name="supplier" value="${e(v.supplier ?? '')}" autocomplete="off"></label>
        <label class="field">Bill number <span class="field-hint">optional</span><input name="bill" value="${e(v.bill ?? '')}" autocomplete="off"></label>
        <label class="field">Cost per ${UNITS[su]} (₹) <span class="field-hint">optional</span><input name="cost" inputmode="decimal" value="${e(v.cost ?? '')}" ${inv(errors, 'cost')}>${fieldErr(errors, 'cost')}</label></div>`;
  } else if (sh.type === 'out') {
    save = 'Save stock out';
    title = `Stock out: ${it.name}`;
    const reasons = [['supplier', 'Returned to supplier'], ['lost', 'Damaged or lost'], ['other', 'Used without a job']];
    body = `<p class="muted">In stock now: ${qtyHtml(state, it, su)}</p>
      ${unitPick()}
      <p class="warn-note">${icon('wrench', { size: 16 })}<span>Taking a part for a job? Do it on the job's screen, so it goes on that job's invoice.</span></p>
      ${qtyField('Quantity going out')}
      <fieldset class="reason-list"><legend>Reason</legend>${reasons.map(([k, l]) => `<label class="radio"><input type="radio" name="reason" value="${k}" ${v.reason === k ? 'checked' : ''}> ${l}</label>`).join('')}${fieldErr(errors, 'reason')}</fieldset>
      <label class="field">Note <span class="field-hint">${v.reason === 'other' ? 'needed: what was it used for?' : 'optional'}</span><textarea name="note" ${inv(errors, 'note')}>${e(v.note ?? '')}</textarea>${fieldErr(errors, 'note')}</label>`;
  } else if (sh.type === 'count') {
    save = 'Save count';
    title = `Count: ${it.name}`;
    const counted = parseQty(v.qty ?? '', su);
    const diff = counted.ok ? r3(counted.value - stockOf(state, it, su)) : null;
    body = `<p class="muted">The records say ${qtyHtml(state, it, su)}. Count what is on the shelf and type it here.</p>
      ${unitPick()}
      ${qtyField('Counted on the shelf')}
      <p class="diff-line" data-slot="inv-diff" aria-live="polite">${diff == null ? '' : diff === 0 ? 'Count matches. Nothing to change.' : e(`This records ${signedText(diff, su)} as a count correction.`)}</p>
      <label class="field">Reason <span class="field-hint">optional</span><input name="note" value="${e(v.note ?? '')}" placeholder="for example: monthly count" autocomplete="off"></label>`;
  } else if (sh.type === 'cut') {
    save = 'Cut';
    title = `Cut: ${it.name}`;
    const from = units.some((u) => u.unit === v.from) ? v.from : units[0].unit;
    const others = units.filter((u) => u.unit !== from);
    const to = others.some((u) => u.unit === v.to) ? v.to : (others.find((u) => u.cut_from === from) || others[0]).unit;
    const toUnit = units.find((u) => u.unit === to);
    const usual = toUnit && toUnit.cut_from === from ? toUnit.cut_gives : '';
    const gives = v.gives !== undefined && v.gives !== '' ? v.gives : (usual ?? '');
    body = `<p class="muted">Cut one unit into another, for example a coil into loose metres. Only the person at the shelf can say how much it gives.</p>
      <div class="form-grid">
        <label class="field">Cut this unit<select name="from" data-cut-pick>${units.map((u) => `<option value="${e(u.unit)}" ${u.unit === from ? 'selected' : ''}>${e(UNITS[u.unit])} (${e(qtyText(stockOf(state, it, u.unit), u.unit))} in stock)</option>`).join('')}</select>${fieldErr(errors, 'from')}</label>
        <label class="field">How many do you cut?<span class="unit-field"><input name="count" inputmode="decimal" autocomplete="off" value="${e(v.count ?? '1')}" ${inv(errors, 'count')} data-autofocus><span>${e(UNITS[from])}</span></span>${fieldErr(errors, 'count')}</label>
        <label class="field">Into<select name="to" data-cut-pick>${others.map((u) => `<option value="${e(u.unit)}" ${u.unit === to ? 'selected' : ''}>${e(UNITS[u.unit])} (${e(qtyText(stockOf(state, it, u.unit), u.unit))} in stock)</option>`).join('')}</select>${fieldErr(errors, 'to')}</label>
        <label class="field">It gives${usual ? ` <span class="field-hint">usually ${e(qtyText(usual, to))}</span>` : ''}<span class="unit-field"><input name="gives" inputmode="decimal" autocomplete="off" value="${e(gives)}" ${inv(errors, 'gives')} data-testid="cut-gives"><span>${e(UNITS[to])}</span></span>${fieldErr(errors, 'gives')}</label>
      </div>
      <label class="field">Note <span class="field-hint">optional</span><input name="note" value="${e(v.note ?? '')}" autocomplete="off"></label>`;
  } else if (sh.type === 'pick' && !it) {
    title = 'Take a part from inventory';
    body = `<div class="inv-search">${icon('search', { size: 18 })}<label class="sr-label" for="pick-q">Search inventory</label><input id="pick-q" type="search" placeholder="Search by name or code" value="${e(sh.q || '')}" data-pick-search data-autofocus autocomplete="off"></div>
      <ul class="pick-list" data-slot="pick-results">${pickRows(state, sh.q || '')}</ul>`;
  } else if (sh.type === 'pick') {
    save = 'Take from inventory';
    title = `Take for the job: ${it.name}`;
    const want = parseQty(v.qty ?? '', it.unit);
    const have = stockOf(state, it);
    body = `<p class="muted">In stock: ${qtyHtml(state, it)} ${markHtml(state, it)}</p>${qtyField('Quantity used on this job')}
      <p class="warn-note" data-slot="pick-short" ${want.ok && want.value > have ? '' : 'hidden'}>${icon('alert', { size: 16 })}<span>Only ${e(qtyText(Math.max(have, 0), it.unit))} in stock. It will show as short until someone counts.</span></p>
      <button type="button" class="link-btn" data-action="inv-pick-again">Choose another part</button>`;
  }
  return `<div class="sheet-backdrop" data-action="inv-close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-testid="inv-sheet">
    <form class="stack" data-form="inv-sheet" novalidate>
      <div class="sheet-head"><h2 id="sheet-title">${e(title)}</h2><button type="button" class="icon-btn" aria-label="Close" data-action="inv-close-sheet">${icon('x')}</button></div>
      ${body}
      <div class="actions"><button type="button" class="btn btn-ghost" data-action="inv-close-sheet">Cancel</button>${save ? `<button type="submit" class="btn btn-primary">${save}</button>` : ''}</div>
    </form>
  </div>`;
}

