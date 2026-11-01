// Inventory screens (CR-0011, US-25): the list, one item with its history, the add and edit form, the CSV import,
// and the sheets for stock in, stock out, count and taking a part for a job.
import { icon } from '../ui/icons.js';
import { escapeHtml, rupees, rupeesExact } from '../format.js';
import { isSynced } from '../ids.js';
import { deviceToday, today } from '../clock.js';
import {
  UNITS, UNIT_NAMES, GST_RATES, MOVE_LABELS, qtyText, signedText, stockOf, markOf, markText, summary, listItems, historyOf,
  matches, nameOf, parseQty, dmy, r3,
} from '../domain/inventory.js';

const e = escapeHtml;
const price = (paise) => (paise == null ? '—' : paise % 100 === 0 ? rupees(paise / 100) : rupeesExact(paise / 100));
const SAMPLE_NOTE = 'Sample stock for the demo. It stays on this device.';
export const CSV_COLUMNS = ['code', 'name', 'unit', 'sale_price', 'cost_price', 'hsn', 'gst_rate', 'low_stock_at', 'opening_stock'];
export const CSV_TEMPLATE = `${CSV_COLUMNS.join(',')}\nCAP-35,Capacitor 35 µF,nos,380,170,8532,18,5,10\n`;

function markHtml(state, item) {
  const q = stockOf(state, item);
  const m = markOf(q, item.low);
  return m ? `<span class="mark mark-${m.kind}" data-testid="mark">${m.kind === 'low' ? icon('alert', { size: 12 }) : ''}${e(markText(m, q, item.unit))}</span>` : '';
}
function qtyHtml(state, item) {
  const q = stockOf(state, item);
  const m = markOf(q, item.low);
  return `<span class="qty ${m ? `is-${m.kind}` : ''}" data-testid="qty">${e(qtyText(q, item.unit))}</span>`;
}
const noticeHtml = (ui, key) => {
  const n = ui.inv && ui.inv.notice;
  return n && n.at === key ? `<p class="notice ${n.error ? 'notice-error' : ''}" role="${n.error ? 'alert' : 'status'}" data-testid="inv-notice">${icon(n.error ? 'alert' : 'check', { size: 18 })}<span>${e(n.text)}</span></p>` : '';
};
const fieldErr = (errors, k) => (errors[k] ? `<span class="field-error" id="err-${k}">${e(errors[k])}</span>` : '');
const inv = (errors, k) => (errors[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');

// ---------- the list ----------
export function chipsHtml(state, ui) {
  const c = summary(state);
  const f = (ui.inv && ui.inv.filter) || 'all';
  const chip = (k, label, n) => `<button type="button" class="chip ${f === k ? 'is-on' : ''}" aria-pressed="${f === k}" data-action="inv-filter" data-filter="${k}">${label} <span class="muted">${n}</span></button>`;
  return chip('all', 'All', c.all) + chip('low', 'Low', c.low) + chip('out', 'Out', c.out) + chip('stopped', 'Stopped', c.stopped);
}
export function resultsHtml(state, ui, allow) {
  const inv = ui.inv || {};
  const rows = listItems(state, { filter: inv.filter || 'all', q: inv.q || '' });
  const manage = allow('manage_inventory');
  if (!rows.length) {
    const q = String(inv.q || '').trim();
    const text = q ? `No items match “${q}”. Check the spelling, or add it as a new item.` : inv.filter === 'stopped' ? 'No stopped items. Items you stop using show here, with their history.' : (state.items || []).length ? 'Nothing here right now.' : 'No items yet.';
    return `<div class="empty" data-testid="inv-empty">${icon('search', { size: 28 })}<p>${e(text)}</p>${manage ? `<button type="button" class="btn btn-secondary" data-action="inv-add" data-name="${e(q)}">${icon('plus', { size: 18 })} Add ${q ? `“${e(q)}”` : 'an item'}</button>` : ''}</div>`;
  }
  const href = (i) => `#/inventory/item/${encodeURIComponent(i.id)}`;
  const cards = rows.map((i) => `<li class="row-card inv-card" data-item="${e(i.id)}"><a href="${href(i)}"><span class="row-main"><strong>${e(i.name)}</strong><span class="code">${e(i.code || 'No code')} · ${UNITS[i.unit]}${i.stopped ? ' · stopped' : ''}</span></span><span class="inv-card-side">${qtyHtml(state, i)}${markHtml(state, i)}</span></a></li>`).join('');
  const table = `<div class="panel inv-table-wrap"><div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Item</th><th scope="col">Code</th><th scope="col" class="num">In stock</th><th scope="col" class="num">Low at</th><th scope="col" class="num">Sale price</th>${manage ? '<th scope="col" class="num">Cost price</th>' : ''}<th scope="col">Mark</th></tr></thead>
    <tbody>${rows.map((i) => `<tr data-href="${href(i)}" data-item="${e(i.id)}"><td><a class="row-name" href="${href(i)}">${e(i.name)}</a></td><td class="code">${e(i.code || '—')}</td><td class="num">${qtyHtml(state, i)}</td><td class="num">${i.low == null ? '—' : e(qtyText(i.low, i.unit))}</td><td class="num">${price(i.sale)}<span class="muted small"> /${UNITS[i.unit]}</span></td>${manage ? `<td class="num">${price(i.cost)}</td>` : ''}<td>${markHtml(state, i)}</td></tr>`).join('')}</tbody>
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
      ${manage ? `<div class="actions">${demo ? '' : `<a class="btn btn-ghost" href="#/inventory/import">${icon('upload', { size: 18 })} Import CSV</a>`}<a class="btn btn-primary" href="#/inventory/new">${icon('plus', { size: 18 })} Add item</a></div>` : ''}
    </div>
    <ul class="kpis inv-kpis" data-testid="inv-kpis">
      <li class="kpi"><span class="kpi-label">${icon('box', { size: 16 })} Items</span><span class="kpi-value" data-testid="kpi-items">${c.all}</span><span class="kpi-sub muted">in use</span></li>
      <li class="kpi"><span class="kpi-label">${icon('alert', { size: 16 })} Low stock</span><span class="kpi-value ${c.low ? 'is-low' : ''}" data-testid="kpi-low">${c.low}</span><span class="kpi-sub muted">at or below their level</span></li>
      <li class="kpi"><span class="kpi-label">${icon('x', { size: 16 })} Out or short</span><span class="kpi-value ${c.out ? 'is-out' : ''}" data-testid="kpi-out">${c.out}</span><span class="kpi-sub muted">count or reorder</span></li>
      ${manage ? `<li class="kpi"><span class="kpi-label">${icon('file', { size: 16 })} Stock value</span><span class="kpi-value money" data-testid="kpi-value">${price(c.value)}</span><span class="kpi-sub muted">at cost price</span></li>` : ''}
    </ul>
    ${manage ? '' : `<p class="notice" data-testid="inv-readonly">${icon('shield', { size: 18 })}<span>You can see inventory. Ask the office to add or correct stock.</span></p>`}
    <div class="inv-tools">
      <div class="inv-search">${icon('search', { size: 18 })}<label class="sr-label" for="inv-q">Search inventory by name or code</label><input id="inv-q" type="search" placeholder="Search name or code, e.g. cap 45" value="${e((ui.inv && ui.inv.q) || '')}" autocomplete="off" data-inv-search></div>
      <div class="chips" role="group" aria-label="Show" data-slot="inv-chips">${chipsHtml(state, ui)}</div>
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
  const history = historyOf(state, it);
  const canSee = allow('view_inventory');
  return `<section class="page" aria-labelledby="page-title">
    <a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a>
    ${noticeHtml(ui, `item:${it.id}`)}
    <div class="page-head-row">
      <div class="item-head"><h1 id="page-title" tabindex="-1">${e(it.name)} ${markHtml(state, it)}</h1>
        <p class="muted">${e(it.code || 'No code')} · ${UNIT_NAMES[it.unit]} · HSN ${e(it.hsn || '—')} · GST ${it.gst} %${it.stopped ? ' · <strong>Stopped</strong>' : ''}</p></div>
      ${manage ? `<div class="actions">
        ${it.stopped ? '' : `<button type="button" class="btn btn-primary" data-action="inv-sheet" data-type="in">${icon('plus', { size: 18 })} Stock in</button>
        <button type="button" class="btn btn-secondary" data-action="inv-sheet" data-type="out">${icon('minus', { size: 18 })} Stock out</button>
        <button type="button" class="btn btn-ghost" data-action="inv-sheet" data-type="count">${icon('count', { size: 18 })} Count</button>`}
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
    </ul>
    ${canSee ? `<div class="panel">
      <div class="panel-head"><h2 class="panel-title">History</h2><span class="muted small">Moves can't be changed. A mistake is fixed with a new move.</span></div>
      ${history.length ? `<ol class="moves" data-testid="inv-history">${history.map((m) => `<li class="move" data-kind="${m.kind}">
        <span class="move-date">${e(dmy(m.date))}</span>
        <span class="move-what"><strong>${MOVE_LABELS[m.kind] || m.kind}${m.job_id ? ` · <a href="#/jobs/${encodeURIComponent(m.job_id)}">job</a>` : ''}${m.after === undefined ? ' <span class="tag tag-soon">Waiting to send</span>' : ''}</strong><span class="muted small">${e(m.who || '')}${m.note ? ` · ${e(m.note)}` : ''}</span></span>
        <span class="move-qty"><strong class="${m.qty > 0 ? 'is-in' : ''}">${e(signedText(m.qty, it.unit))}</strong><span class="muted small">then ${e(qtyText(m.shown_after, it.unit))}</span></span>
      </li>`).join('')}</ol>` : '<p class="muted">No moves yet.</p>'}
    </div>` : ''}
    ${stockSheet({ state, ui })}
  </section>`;
}

// ---------- the add and edit form ----------
export function itemForm({ state, ui, params }) {
  const it = params.id ? (state.items || []).find((i) => i.id === params.id) : null;
  if (params.id && !it) return `<section class="page"><a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a><h1 id="page-title" tabindex="-1">Item not found</h1><div class="empty"><p>This item isn't in your inventory.</p></div></section>`;
  const key = params.id || 'new';
  const f = ui.inv && ui.inv.form && ui.inv.form.key === key ? ui.inv.form : null;
  const v = (f && f.values) || (it
    ? { name: it.name, code: it.code || '', unit: it.unit, sale: it.sale / 100, cost: it.cost == null ? '' : it.cost / 100, hsn: it.hsn || '', gst: String(it.gst), low: it.low ?? '' }
    : { unit: 'nos', gst: '18', name: (ui.inv && ui.inv.prefill) || '' });
  const errors = (f && f.errors) || {};
  const input = (k, label, hint = '', extra = '') => `<label class="field">${label}${hint ? ` <span class="field-hint">${hint}</span>` : ''}<input name="${k}" value="${e(v[k] ?? '')}" ${inv(errors, k)} ${extra} autocomplete="off">${fieldErr(errors, k)}</label>`;
  const back = it ? `#/inventory/item/${encodeURIComponent(it.id)}` : '#/inventory';
  return `<section class="page" aria-labelledby="page-title">
    <a class="back" href="${back}">${icon('arrowLeft', { size: 18 })} ${it ? e(it.name) : 'Inventory'}</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">${it ? 'Edit item' : 'Add an item'}</h1><p class="muted">${it ? 'The quantity changes only through Stock in, Stock out, Count and parts used on jobs.' : 'One part or material you keep in the store.'}</p></header>
    <form class="panel" data-form="inv-item" data-item="${e(params.id || '')}" novalidate>
      <div class="form-grid">
        ${input('name', 'Name', '', 'data-autofocus placeholder="for example Capacitor 35 µF"')}
        ${input('code', 'Code', 'optional, unique in your business', 'placeholder="for example CAP-35"')}
        <label class="field">Unit<select name="unit" ${inv(errors, 'unit')}>${Object.keys(UNITS).map((u) => `<option value="${u}" ${v.unit === u ? 'selected' : ''}>${UNIT_NAMES[u]}</option>`).join('')}</select>${fieldErr(errors, 'unit')}</label>
        ${input('sale', 'Sale price (₹)', 'per unit, used on quotes and invoices', 'inputmode="decimal"')}
        ${input('cost', 'Cost price (₹)', 'optional; only people who manage inventory see it', 'inputmode="decimal"')}
        ${input('hsn', 'HSN code', 'optional, 4, 6 or 8 digits', 'inputmode="numeric"')}
        <label class="field">GST rate<select name="gst" ${inv(errors, 'gst')}>${GST_RATES.map((g) => `<option value="${g}" ${String(v.gst) === String(g) ? 'selected' : ''}>${g} %</option>`).join('')}</select>${fieldErr(errors, 'gst')}</label>
        ${input('low', 'Low-stock level', 'optional; marked Low at or below this', 'inputmode="decimal"')}
        ${it ? '' : input('opening', 'Opening stock', 'optional; what is on the shelf today', 'inputmode="decimal"')}
      </div>
      <div class="actions"><a class="btn btn-ghost" href="${back}">Cancel</a><button type="submit" class="btn btn-primary">${it ? 'Save changes' : 'Add item'}</button></div>
    </form>
  </section>`;
}

// ---------- the CSV import ----------
export function inventoryImport({ state, ui }) {
  const c = ui.inv && ui.inv.csv;
  const rows = c && c.rows;
  const n = (s) => (c && c.counts ? c.counts[s] || 0 : 0);
  const good = n('new') + n('update');
  const tag = { new: '<span class="tag">New</span>', update: '<span class="tag tag-soon">Update</span>', same: '<span class="tag tag-past">No change</span>', problem: '<span class="tag tag-lapsed">Problem</span>' };
  const result = ui.inv && ui.inv.csvResult;
  return `<section class="page page-wide" aria-labelledby="page-title">
    <a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">Import items from a CSV file</h1><p class="muted">Make the file in Excel or Google Sheets and save it as CSV. Up to 500 rows at a time.</p></header>
    ${result ? `<p class="notice" role="status" data-testid="csv-result">${icon('check', { size: 18 })}<span>${result}</span></p>` : ''}
    <p class="notice">${icon('server', { size: 18 })}<span>Importing needs a signal, because each code is checked against your whole business.</span></p>
    <div class="panel">
      <ol class="start-steps">
        <li class="start-step"><span class="step-num">1</span><div><h3>Download the template</h3><p class="muted">Columns: ${CSV_COLUMNS.map((x) => `<code>${x}</code>`).join(', ')}. Only <code>name</code> is needed; prices are in rupees.</p><button type="button" class="btn btn-ghost btn-small" data-action="inv-template">${icon('download', { size: 18 })} Download template</button></div></li>
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
        <li class="kpi"><span class="kpi-label">Updates</span><span class="kpi-value" data-testid="csv-update">${n('update')}</span>${n('same') ? `<span class="kpi-sub muted">${n('same')} already up to date</span>` : ''}</li>
        <li class="kpi"><span class="kpi-label">Problems</span><span class="kpi-value ${n('problem') ? 'is-out' : ''}" data-testid="csv-problem">${n('problem')}</span><span class="kpi-sub muted">skipped</span></li>
      </ul>
      ${n('problem') ? `<div class="import-errors notice notice-error" role="alert" style="display:block" data-testid="csv-problems"><strong>Rows with a problem</strong><ul>${rows.filter((r) => r.status === 'problem').map((r) => `<li>Row ${r.row}: ${e(r.problems.join('; '))}.</li>`).join('')}</ul></div>` : ''}
      <div class="table-wrap"><table class="table import-table">
        <thead><tr><th scope="col">Row</th><th scope="col">Result</th><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Unit</th><th scope="col" class="num">Sale ₹</th><th scope="col" class="num">Opening</th><th scope="col">Why</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="num">${r.row}</td><td>${tag[r.status]}</td><td class="code">${e(r.code || '—')}</td><td>${e(r.name || '—')}</td><td>${e(r.unit)}</td><td class="num">${e(r.sale_price)}</td><td class="num">${e(r.opening_stock)}</td><td class="why ${r.problems.length ? '' : 'is-note'}">${e((r.problems.length ? r.problems : r.notes).join('; '))}</td></tr>`).join('')}</tbody>
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
  const qtyField = (label) => `<label class="field">${label}<span class="unit-field"><input name="qty" inputmode="decimal" autocomplete="off" value="${e(v.qty ?? '')}" ${inv(errors, 'qty')} data-autofocus data-qty><span>${UNITS[it.unit]}</span></span>${fieldErr(errors, 'qty')}</label>`;
  let title = '';
  let body = '';
  let save = '';
  if (sh.type === 'in') {
    save = 'Save stock in';
    title = `Stock in: ${it.name}`;
    body = `<p class="muted">In stock now: ${qtyHtml(state, it)}</p>
      <div class="form-grid">${qtyField('Quantity received')}
        <label class="field">Date <span class="field-hint">dd-mm-yyyy</span><input name="date" inputmode="numeric" value="${e(v.date ?? dmy(isSynced(state) ? deviceToday() : today()))}" ${inv(errors, 'date')}>${fieldErr(errors, 'date')}</label>
        <label class="field">Supplier <span class="field-hint">optional</span><input name="supplier" value="${e(v.supplier ?? '')}" autocomplete="off"></label>
        <label class="field">Bill number <span class="field-hint">optional</span><input name="bill" value="${e(v.bill ?? '')}" autocomplete="off"></label>
        <label class="field">Cost per ${UNITS[it.unit]} (₹) <span class="field-hint">optional</span><input name="cost" inputmode="decimal" value="${e(v.cost ?? '')}" ${inv(errors, 'cost')}>${fieldErr(errors, 'cost')}</label></div>`;
  } else if (sh.type === 'out') {
    save = 'Save stock out';
    title = `Stock out: ${it.name}`;
    const reasons = [['supplier', 'Returned to supplier'], ['lost', 'Damaged or lost'], ['other', 'Used without a job']];
    body = `<p class="muted">In stock now: ${qtyHtml(state, it)}</p>
      <p class="warn-note">${icon('wrench', { size: 16 })}<span>Taking a part for a job? Do it on the job's screen, so it goes on that job's invoice.</span></p>
      ${qtyField('Quantity going out')}
      <fieldset class="reason-list"><legend>Reason</legend>${reasons.map(([k, l]) => `<label class="radio"><input type="radio" name="reason" value="${k}" ${v.reason === k ? 'checked' : ''}> ${l}</label>`).join('')}${fieldErr(errors, 'reason')}</fieldset>
      <label class="field">Note <span class="field-hint">${v.reason === 'other' ? 'needed: what was it used for?' : 'optional'}</span><textarea name="note" ${inv(errors, 'note')}>${e(v.note ?? '')}</textarea>${fieldErr(errors, 'note')}</label>`;
  } else if (sh.type === 'count') {
    save = 'Save count';
    title = `Count: ${it.name}`;
    const counted = parseQty(v.qty ?? '', it.unit);
    const diff = counted.ok ? r3(counted.value - stockOf(state, it)) : null;
    body = `<p class="muted">The records say ${qtyHtml(state, it)}. Count what is on the shelf and type it here.</p>
      ${qtyField('Counted on the shelf')}
      <p class="diff-line" data-slot="inv-diff" aria-live="polite">${diff == null ? '' : diff === 0 ? 'Count matches. Nothing to change.' : e(`This records ${signedText(diff, it.unit)} as a count correction.`)}</p>
      <label class="field">Reason <span class="field-hint">optional</span><input name="note" value="${e(v.note ?? '')}" placeholder="for example: monthly count" autocomplete="off"></label>`;
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

