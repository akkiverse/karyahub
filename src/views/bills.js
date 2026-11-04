// Bills and estimates (CR-0012): the list, the editor, the bill view and the printed paper.
// Every screen word comes from words.js (rule 9). Money is paise until it is shown.
import { icon } from '../ui/icons.js';
import { escapeHtml as e, rupees, rupeesExact, localStamp } from '../format.js';
import { W } from '../words.js';
import { STATES, stateLabel, GST_RATES } from '../domain/tax.js';
import {
  billList, CHIPS, docWord, figuresOf, isBill, isV2, lookOf, numberText, saveProblem, sellerOf, statusOf, STATUS_WORDS, totalOf, LAYOUTS, COLOURS, unitText,
} from '../domain/bills.js';
import { unitsOf } from '../domain/inventory.js';
import { SAMPLES } from '../data/demo.js';

const rp = (paise) => (Number(paise) < 0 ? `−${rupeesExact(-Number(paise) / 100)}` : rupeesExact((Number(paise) || 0) / 100));
const rw = (paise) => rupees((Number(paise) || 0) / 100);
const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const can = (me, p) => Boolean(me && (me.permissions || []).includes(p));
const regOf = (doc, me) => (doc.seller ? doc.seller.registration : (me.business && me.business.gst_registration) || 'regular');
/** A money input shows rupees; what the person typed stays as typed until it is a real amount. */
const rupeeInput = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v / 100) : String(v ?? ''));

export const statusChip = (status) => `<span class="chip-status status-${status}" data-testid="status-chip">${e(STATUS_WORDS[status] || status)}</span>`;

// ---------- the list (AC-28.6) ----------
export function billsList({ state, ui, me, today, kind = 'invoice' }) {
  const b = ui.bills || {};
  const q = b.q || '';
  const chip = b.chip || 'all';
  const { rows, counts } = billList(state.documents, { kind, q, chip }, today);
  const any = state.documents.some((d) => d.type === kind && !d.deleted);
  const empty = !any ? (kind === 'quote' ? W.noEstimates : W.noBills) : W.noBillsMatch;
  const tab = (k, label, href) => `<a class="seg ${kind === k ? 'is-active' : ''}" href="${href}" ${kind === k ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<section class="page page-wide bills-page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">${kind === 'quote' ? W.estimates : W.bills}</h1></header>
    ${b.notice ? `<p class="notice ${b.notice.error ? 'notice-error' : ''}" role="status" data-testid="bills-notice">${e(b.notice.text)}${b.notice.undo ? ` <button type="button" class="btn btn-ghost btn-small" data-action="bill-undo-delete">${W.undo}</button>` : ''}</p>` : ''}
    <div class="panel bills-tools">
    <div class="bills-tools-top"><nav class="segs" aria-label="${W.bills}">${tab('invoice', W.bills, '#/bills')}${tab('quote', W.estimates, '#/estimates')}</nav>
    <label class="search"><span class="sr-only">${W.searchBills}</span>${icon('search', { size: 18 })}<input type="search" data-bill-search placeholder="${W.searchBillsShort}" value="${e(q)}"></label></div>
    <div class="chips chips-scroll" role="group" aria-label="${W.bills}">${CHIPS.filter(([k]) => kind === 'invoice' || !['unpaid', 'overdue', 'paid'].includes(k)).map(([k, label]) => `<button type="button" class="chip ${chip === k ? 'is-on' : ''}" aria-pressed="${chip === k}" data-action="bill-chip" data-chip="${k}">${label} <span class="chip-count" data-chip-count="${k}">${counts[k]}</span></button>`).join('')}</div>
    </div>
    <div data-slot="bill-rows">${rows.length ? billRows(rows, today, { jobs: state.jobs, make: can(me, 'create_documents'), demo: Boolean(state.settings.is_demo) }) : `<p class="empty" data-testid="bills-empty">${e(empty)}</p>`}</div>
  </section>`;
}

export const billHref = (d) => (isV2(d) ? (d.status === 'draft' ? `#/bills/${encodeURIComponent(d.id)}/edit` : `#/bills/${encodeURIComponent(d.id)}`) : `#/doc/${encodeURIComponent(d.id)}`);

/** Where a bill came from (CR-0015): a technician's WhatsApp report through its job, or made at the counter. */
function sourceOf(d, jobs) {
  if (!d.job_id) return ['file', W.sourceCounter, 'counter'];
  const job = (jobs || []).find((j) => j.id === d.job_id);
  const sample = job && job.source_sample_id ? SAMPLES.find((x) => x.id === job.source_sample_id) : null;
  if (sample && sample.kind === 'voice') return ['mic', W.sourceVoice, 'whatsapp'];
  if (sample && sample.kind === 'photo') return ['image', W.sourcePhoto, 'whatsapp'];
  return ['chat', W.sourceText, 'whatsapp'];
}
function taxCell(d) {
  const t = d.totals;
  if (!t) return '<span class="muted">–</span>';
  const tax = t.igst ? `IGST ${rw(t.igst)}` : t.cgst || t.sgst ? `CGST ${rw(t.cgst)} + SGST ${rw(t.sgst)}` : '';
  return `<span class="cell-main mono">${rw(t.taxable)}</span>${tax ? `<span class="cell-sub mono">${e(tax)}</span>` : ''}`;
}
function rowActions(d, s, ctx) {
  const live = isV2(d) && d.number && ['saved', 'sent', 'paid', 'overdue'].includes(s);
  const name = e(numberText(d));
  const send = live && ctx.make ? `<button type="button" class="icon-btn row-act" data-action="bill-send" data-doc="${e(d.id)}" data-testid="row-send" aria-label="${W.sendOn} ${name}" title="${W.sendWhatsApp}">${icon('send', { size: 18 })}</button>` : '';
  const paper = live && d.link_token && !ctx.demo
    ? `<a class="icon-btn row-act" href="/b/${e(d.link_token)}/pdf" target="_blank" rel="noopener" data-testid="row-pdf" aria-label="${W.previewOf} ${name}" title="${W.downloadPdf}">${icon('file', { size: 18 })}</a>`
    : `<a class="icon-btn row-act" href="${billHref(d)}" data-testid="row-open" aria-label="${W.openBill}: ${name}" title="${W.openBill}">${icon('file', { size: 18 })}</a>`;
  return `<span class="row-actions">${send}${paper}</span>`;
}

export function billRows(rows, today, ctx = {}) {
  const href = billHref;
  const cards = rows.map((d) => {
    const s = statusOf(d, today);
    const t = totalOf(d);
    return `<li class="row-card bill-card"><a class="row-link" href="${href(d)}" data-testid="bill-row"><span class="row-main"><strong>${e(numberText(d))}</strong><span class="muted">${e((d.customer || {}).name || '')} · ${ddmmyyyy(d.date)}</span></span><span class="row-side"><strong>${t === null ? '' : rw(t)}</strong>${statusChip(s)}</span></a></li>`;
  }).join('');
  const table = rows.map((d) => {
    const s = statusOf(d, today);
    const t = totalOf(d);
    const c = d.customer || {};
    const [srcIcon, srcText, srcKind] = sourceOf(d, ctx.jobs);
    return `<tr data-doc="${e(d.id)}"><td><a class="cell-main mono row-name" href="${href(d)}">${e(numberText(d))}</a><span class="cell-sub">${ddmmyyyy(d.date)}</span></td><td><span class="cell-main">${e(c.name || '')}</span><span class="cell-sub ${c.gstin ? 'mono' : ''}">${e(c.gstin || W.noGstin)}</span></td><td><span class="source source-${srcKind}" data-testid="bill-source">${icon(srcIcon, { size: 14 })} ${srcText}</span></td><td>${taxCell(d)}</td><td class="num"><strong class="total-cell mono">${t === null ? '' : rw(t)}</strong></td><td>${statusChip(s)}</td><td class="num">${rowActions(d, s, ctx)}</td></tr>`;
  }).join('');
  return `<ul class="list bill-cards">${cards}</ul>
    <div class="table-wrap bill-table-wrap"><table class="bill-table"><thead><tr><th scope="col">${W.colBill}</th><th scope="col">${W.colCustomer}</th><th scope="col">${W.colSource}</th><th scope="col">${W.colTax}</th><th scope="col" class="num">${W.total}</th><th scope="col">Status</th><th scope="col" class="num"><span class="sr-only">${W.colActions}</span></th></tr></thead><tbody>${table}</tbody></table></div>`;
}

// ---------- the editor (AC-27.1 to AC-27.3) ----------
function customerBlock(doc, ui, state) {
  const c = doc.customer || {};
  if (ui.billEd && ui.billEd.picking) {
    return `<div class="picker" data-testid="customer-picker">
      <label class="search"><span class="sr-only">${W.searchCustomer}</span>${icon('search', { size: 18 })}<input type="search" data-cust-search data-k="cust-search" placeholder="${W.searchCustomer}" value="${e(ui.billEd.custQ || '')}" autocomplete="off"></label>
      <ul class="pick-list" data-slot="cust-results">${customerRows(state, ui.billEd.custQ || '')}</ul>
      <button type="button" class="btn btn-ghost btn-small" data-action="bill-walk-in">${W.keepWalkIn}</button>
    </div>`;
  }
  return `<div class="cust-card" data-testid="bill-customer"><span>${icon('user', { size: 18 })}<strong>${e(c.name || W.walkIn)}</strong>${c.phone ? `<span class="muted"> · ${e(c.phone)}</span>` : ''}</span>
    <button type="button" class="btn btn-ghost btn-small" data-action="bill-pick-customer">${W.changeCustomer}</button></div>`;
}

export function customerRows(state, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, '');
  const found = (state.customers || []).filter((c) => (words.length ? words.every((w) => String(c.name || '').toLowerCase().includes(w)) || (digits.length >= 3 && String(c.phone || '').includes(digits)) : true)).slice(0, 8);
  const rows = found.map((c) => `<li><button type="button" class="pick-row" data-action="bill-set-customer" data-customer="${e(c.id)}"><strong>${e(c.name)}</strong><span class="muted">${e(c.phone || '')}</span></button></li>`).join('');
  const typed = q.trim() && !found.some((c) => c.name.toLowerCase() === q.trim().toLowerCase())
    ? `<li><button type="button" class="pick-row" data-action="bill-new-customer">${icon('plus', { size: 16 })} ${W.newCustomer}: <strong>${e(q.trim())}</strong></button></li>` : '';
  return rows + typed;
}

export function itemRows(state, q, doc) {
  const words = q.toLowerCase().replace(/[µ]/g, 'u').split(/\s+/).filter(Boolean);
  const items = (state.items || []).filter((it) => !it.stopped && words.length && words.every((w) => `${it.name} ${it.code || ''}`.toLowerCase().replace(/[µ.\s]/g, (m) => (m === 'µ' ? 'u' : '')).includes(w.replace(/[.\s]/g, '')))).slice(0, 8);
  const rows = items.map((it) => `<li><button type="button" class="pick-row" data-action="bill-add-item" data-item="${e(it.id)}"><strong>${e(it.name)}</strong><span class="muted">${it.service ? `${W.service} · ` : ''}${rw(it.sale || 0)}${it.gst !== undefined ? ` · GST ${e(it.gst)}%` : ''}</span></button></li>`).join('');
  const typed = q.trim() ? `<li><button type="button" class="pick-row" data-action="bill-add-typed">${icon('plus', { size: 16 })} ${W.addTypedLine}: <strong>${e(q.trim())}</strong></button></li>` : '';
  return doc ? rows + typed : '';
}

function lineCard(l, i, taxed, figures, state) {
  const item = state && l.item_id ? (state.items || []).find((x) => x.id === l.item_id) : null;
  const units = item && !l.from_job_parts ? unitsOf(item) : [];
  const f = figures && figures.lines ? figures.lines[i] : null;
  const disc = l.discount || {};
  return `<li class="bill-line" data-line="${i}">
    <div class="bill-line-top"><label class="field grow"><span class="sr-only">${W.description} ${i + 1}</span><input data-line-key="description" data-index="${i}" data-k="d${i}" value="${e(l.description)}" placeholder="${W.description}"></label>
      <button type="button" class="icon-btn" data-action="bill-remove-line" data-index="${i}" aria-label="${W.removeLine} ${i + 1}">${icon('x', { size: 18 })}</button></div>
    <div class="bill-line-nums">
      ${units.length > 1 ? `<label class="field"><span>Unit</span><select data-line-key="unit_id" data-index="${i}" data-k="u${i}" data-testid="line-unit">${units.map((u) => `<option value="${e(u.unit)}" ${(l.unit_id || item.unit) === u.unit ? 'selected' : ''}>${e(unitText(state, u.unit))}</option>`).join('')}</select></label>` : ''}<label class="field"><span>${W.quantity}${l.unit ? ` (${e(l.unit)})` : ''}</span><input inputmode="decimal" data-line-key="qty" data-index="${i}" data-k="q${i}" value="${e(l.qty)}"></label>
      <label class="field"><span>${W.rate} ₹${l.last_price ? ` <span class="badge" data-testid="last-price">${W.lastPrice}</span>` : ''}</span><input inputmode="decimal" data-line-key="rate" data-index="${i}" data-k="r${i}" value="${e(rupeeInput(l.rate))}"></label>
      ${taxed ? `<label class="field"><span>GST %</span><select data-line-key="gst_rate" data-index="${i}" data-k="g${i}">${GST_RATES.map((r) => `<option value="${r}" ${String(l.gst_rate) === r ? 'selected' : ''}>${r}%</option>`).join('')}</select></label>` : ''}
      <p class="line-taxable"><span class="muted small">${taxed ? W.taxable : W.total}</span><strong data-slot="line-taxable-${i}">${f ? rp(f.taxable) : '–'}</strong></p>
    </div>
    ${l.price_includes_gst && taxed ? `<p class="muted small">${W.priceIncludesGst}</p>` : ''}
    <details class="line-more" ${disc.value ? 'open' : ''}><summary>${W.lineDiscount}</summary>
      <div class="disc-row"><label class="field"><span class="sr-only">${W.lineDiscount} ${i + 1}</span><input inputmode="decimal" data-line-key="discount" data-index="${i}" data-k="ld${i}" value="${e(disc.kind === 'amount' ? rupeeInput(disc.value) : disc.value ?? '')}" placeholder="0"></label>
      <select data-line-key="discount_kind" data-index="${i}" aria-label="${W.lineDiscount} in % or ₹"><option value="percent" ${disc.kind !== 'amount' ? 'selected' : ''}>%</option><option value="amount" ${disc.kind === 'amount' ? 'selected' : ''}>₹</option></select></div>
    </details>
  </li>`;
}

export function totalsBar(doc, me, business) {
  const f = figuresOf(doc, business);
  const problem = ((doc.lines || []).length ? (f.error ? (f.line ? `Line ${f.line}: ${f.error}` : f.error) : '') : W.addLine);
  const t = f.result ? f.result.totals : null;
  const taxes = t && f.result.tax_mode === 'intra' ? `CGST ${rp(t.cgst)} + SGST ${rp(t.sgst)}` : t && f.result.tax_mode === 'inter' ? `IGST ${rp(t.igst)}` : '';
  return `<div class="totals-bar" data-slot="totals-bar">
    <div class="totals-text" aria-live="polite"><span class="muted small">${W.total}</span><strong class="total-figure" data-testid="editor-total">${t ? rw(t.total) : '–'}</strong>
    <span class="muted small" data-testid="editor-taxes">${e(taxes)}${t && t.round_off ? ` · ${W.roundOff} ${rp(t.round_off)}` : ''}</span>
    ${problem ? `<span class="field-error" data-testid="editor-problem">${e(problem)}</span>` : ''}</div>
    <button type="button" class="btn btn-primary btn-lg" data-action="bill-save" data-testid="save-and-share" ${me && me.busySave ? 'aria-busy="true" disabled' : ''}>${icon('send', { size: 18 })} ${W.saveAndShare}</button>
  </div>`;
}

export function billEditor({ state, ui, me, params }) {
  const doc = (ui.billEd && ui.billEd.doc && ui.billEd.doc.id === params.id) ? ui.billEd.doc : state.documents.find((d) => d.id === params.id);
  if (!doc || !isV2(doc)) return notFound();
  const business = me.business;
  const reg = regOf(doc, me);
  const taxed = reg === 'regular';
  const f = figuresOf(doc, business).result;
  const c = doc.customer || {};
  const ownState = (business && business.state_code) || '27';
  const options = Object.entries(STATES).map(([code, name]) => `<option value="${code}" ${(doc.place_of_supply || c.state_code || ownState) === code ? 'selected' : ''}>${e(name)} (${code})</option>`).join('');
  const custStates = `<option value="">–</option>${Object.entries(STATES).map(([code, name]) => `<option value="${code}" ${c.state_code === code ? 'selected' : ''}>${e(name)} (${code})</option>`).join('')}`;
  const bd = doc.bill_discount || {};
  const title = doc.number ? `${docWord(doc)} ${doc.number}` : `New ${docWord(doc).toLowerCase()}`;
  return `<section class="page bill-editor" data-testid="bill-editor">
    <header class="page-head"><a class="back" href="${doc.number ? `#/bills/${encodeURIComponent(doc.id)}` : isBill(doc) ? '#/bills' : '#/estimates'}">${icon('arrowLeft', { size: 18 })} ${isBill(doc) ? W.bills : W.estimates}</a>
      <h1 id="page-title" tabindex="-1">${e(title)}</h1>${statusChip(statusOf(doc, ''))}</header>
    ${doc.save && !doc.number ? `<p class="notice" role="status" data-testid="number-when-online">${icon('server', { size: 16 })} ${W.numberWhenOnline}. ${W.notSharedYet}</p>` : ''}
    ${doc.save_problem ? `<p class="notice notice-error" role="alert" data-testid="save-problem">${e(doc.save_problem)}</p>` : ''}
    ${ui.billEd && ui.billEd.error ? `<p class="notice notice-error" role="alert" data-testid="editor-error">${e(ui.billEd.error)}</p>` : ''}
    <h2 class="section-title">${W.customer}</h2>
    ${customerBlock(doc, ui, state)}
    <h2 class="section-title">${W.items}</h2>
    <label class="search"><span class="sr-only">${W.searchItems}</span>${icon('search', { size: 18 })}<input type="search" data-item-search data-k="item-search" placeholder="${W.searchItems}" value="${e((ui.billEd && ui.billEd.itemQ) || '')}" autocomplete="off"></label>
    <ul class="pick-list" data-slot="item-results">${itemRows(state, (ui.billEd && ui.billEd.itemQ) || '', doc)}</ul>
    ${doc.lines.length ? `<ol class="bill-lines" data-testid="bill-lines">${doc.lines.map((l, i) => lineCard(l, i, taxed, f, state)).join('')}</ol>` : `<p class="empty" data-testid="no-lines">${W.addLine}</p>`}
    <details class="more-options" data-testid="more-options" ${ui.billEd && ui.billEd.more ? 'open' : ''}><summary data-action="bill-more">${W.moreOptions}</summary>
      <div class="stack">
        <div class="disc-row"><label class="field grow"><span>${W.billDiscount}</span><input inputmode="decimal" data-bill-key="bill_discount" data-k="bd" value="${e(bd.kind === 'amount' ? rupeeInput(bd.value) : bd.value ?? '')}" placeholder="0"></label>
          <select data-bill-key="bill_discount_kind" aria-label="${W.billDiscount} in % or ₹"><option value="percent" ${bd.kind !== 'amount' ? 'selected' : ''}>%</option><option value="amount" ${bd.kind === 'amount' ? 'selected' : ''}>₹</option></select></div>
        <label class="field"><span>${W.billDate}</span><input type="date" data-bill-key="date" data-k="date" value="${e(doc.date)}" ${doc.number ? 'disabled' : ''}></label>
        ${isBill(doc) ? `<label class="field"><span>${W.dueDate}</span><input type="date" data-bill-key="due_date" data-k="due" value="${e(doc.due_date || '')}"></label>` : `<label class="field"><span>${W.validUntil}</span><input type="date" data-bill-key="valid_until" data-k="valid" value="${e(doc.valid_until || '')}"></label>`}
        ${taxed ? `<label class="field"><span>${W.placeOfSupply}</span><select data-bill-key="place_of_supply" data-k="pos">${options}</select></label>` : ''}
        <label class="field"><span>${W.customerGstin}</span><input data-cust-key="gstin" data-k="cg" maxlength="15" value="${e(c.gstin || '')}" autocapitalize="characters"></label>
        <label class="field"><span>${W.customerAddress}</span><input data-cust-key="address" data-k="ca" value="${e(c.address || '')}"></label>
        <label class="field"><span>${W.customerState}</span><select data-cust-key="state_code" data-k="cs">${custStates}</select></label>
        <label class="field"><span>${W.notes}</span><textarea data-bill-key="notes" data-k="notes" rows="2">${e(doc.notes || '')}</textarea></label>
        <label class="field"><span>${W.terms}</span><textarea data-bill-key="terms" data-k="terms" rows="2" placeholder="${e(lookOf(business).terms)}">${e(doc.terms || '')}</textarea></label>
        ${doc.status === 'draft' ? `<button type="button" class="btn btn-ghost" data-action="bill-delete-draft">${icon('x', { size: 16 })} ${W.deleteDraft}</button>` : ''}
      </div>
    </details>
    ${totalsBar(doc, { ...me, busySave: ui.billEd && ui.billEd.saving }, business)}
  </section>`;
}

function notFound() {
  return `<section class="page"><h1 id="page-title" tabindex="-1">Not found</h1><p>It may no longer be on this device.</p><a class="btn btn-ghost" href="#/bills">${W.bills}</a></section>`;
}

// ---------- the printed paper (AC-30.2): the bill view and the Settings preview ----------
export function billPaper(doc, { business, settings = {}, sample = false, look = null }) {
  const lk = look || lookOf(business);
  const seller = doc.seller || sellerOf(business, settings);
  const f = doc.totals ? { lines: doc.lines, totals: doc.totals, summary: doc.summary || [], tax_mode: doc.tax_mode } : (figuresOf(doc, business).result || { lines: [], totals: null, summary: [], tax_mode: 'none' });
  const mode = f.tax_mode;
  const taxed = mode === 'intra' || mode === 'inter';
  const heading = doc.type === 'quote' ? W.estimate : seller.registration === 'composition' ? 'Bill of Supply' : seller.registration === 'unregistered' ? 'Bill' : 'Tax Invoice';
  const c = doc.customer || {};
  const hsn = doc.lines.some((l) => l.hsn);
  const lineFig = (i) => (f.lines && f.lines[i]) || {};
  const rows = doc.lines.map((l, i) => {
    const x = { ...l, ...lineFig(i) };
    const disc = (Number(x.line_discount) || 0) + (Number(x.bill_discount) || 0);
    return `<tr><td>${i + 1}</td><td>${e(l.description)}</td>${hsn ? `<td>${e(l.hsn || '')}</td>` : ''}<td class="num">${e(l.qty)}</td><td>${e(l.unit || '')}</td><td class="num">${rp(l.rate)}</td><td class="num">${disc ? rp(disc) : ''}</td><td class="num">${rp(x.taxable)}</td>${taxed ? `<td class="num">${e(x.gst_rate)}%</td><td class="num">${rp((x.cgst || 0) + (x.sgst || 0) + (x.igst || 0))}</td>` : ''}</tr>`;
  }).join('');
  const t = f.totals || { taxable: 0, cgst: 0, sgst: 0, igst: 0, round_off: 0, total: 0, in_words: '' };
  const summary = taxed && f.summary.length ? `<table class="doc-table tax-summary" aria-label="Tax summary"><thead><tr><th scope="col">GST rate</th><th scope="col" class="num">${W.taxable}</th>${mode === 'inter' ? '<th scope="col" class="num">IGST</th>' : '<th scope="col" class="num">CGST</th><th scope="col" class="num">SGST</th>'}</tr></thead><tbody>${f.summary.map((r) => `<tr><td>${e(r.gst_rate)}%</td><td class="num">${rp(r.taxable)}</td>${mode === 'inter' ? `<td class="num">${rp(r.igst)}</td>` : `<td class="num">${rp(r.cgst)}</td><td class="num">${rp(r.sgst)}</td>`}</tr>`).join('')}</tbody></table>` : '';
  const bank = lk.bank || {};
  const cancelled = doc.status === 'cancelled';
  const place = doc.place_of_supply || c.state_code || seller.state_code;
  const ocean = String(lk.colour).toUpperCase() === COLOURS[0]; // the default colour prints as the brand gradient (CR-0015)
  return `<article class="doc bill-paper layout-${e(lk.layout)} ${ocean ? 'is-ocean' : ''}" style="--bill-accent:${e(lk.colour)}" data-testid="bill-paper" aria-label="${e(heading)} ${e(doc.number || '')}">
    ${sample ? `<div class="watermark" data-testid="sample-mark">${W.sample}</div>` : ''}
    ${cancelled ? `<div class="stamp" data-testid="cancelled-stamp" aria-hidden="true"><span>CANCELLED</span></div><p class="notice notice-error" role="status">${W.cancelled}</p>` : ''}
    <header class="doc-head"><div>
      ${business && business.logo_version ? `<img class="doc-logo" alt="" src="/api/v1/business/logo?v=${e(business.logo_version)}">` : ''}
      <p class="doc-biz">${e(seller.name)}</p>${seller.address ? `<p class="muted">${e(seller.address)}</p>` : ''}
      ${seller.gstin ? `<p class="muted">GSTIN <span data-testid="seller-gstin">${e(seller.gstin)}</span></p>` : ''}${seller.phone ? `<p class="muted">${e(seller.phone)}</p>` : ''}
    </div><div class="doc-meta"><h2 class="doc-heading" data-testid="bill-heading">${e(heading)}</h2><p><strong data-testid="bill-number">${e(doc.number || numberText(doc))}</strong></p>
      <p class="muted">${W.billDate} ${ddmmyyyy(doc.date)}</p>${isBill(doc) && doc.due_date ? `<p class="muted">${doc.due_date === doc.date ? W.dueOnReceipt : `${W.dueDate} ${ddmmyyyy(doc.due_date)}`}</p>` : ''}${!isBill(doc) && doc.valid_until ? `<p class="muted">${W.validUntil} ${ddmmyyyy(doc.valid_until)}</p>` : ''}</div></header>
    ${seller.registration === 'composition' && isBill(doc) ? '<p class="muted small" data-testid="composition-line">Composition taxable person, not eligible to collect tax on supplies</p>' : ''}
    <section class="doc-to"><p class="label">Bill to</p><p><strong data-testid="bill-customer">${e(c.name || W.walkIn)}</strong></p>${c.address ? `<p class="muted">${e(c.address)}</p>` : ''}${c.gstin ? `<p class="muted">GSTIN ${e(c.gstin)}</p>` : ''}
      ${taxed ? `<p class="muted" data-testid="place-of-supply">${W.placeOfSupply}: ${e(stateLabel(place))}</p>` : ''}</section>
    <div class="table-wrap"><table class="doc-table" data-testid="paper-lines"><thead><tr><th scope="col">#</th><th scope="col">Item</th>${hsn ? '<th scope="col">HSN/SAC</th>' : ''}<th scope="col" class="num">Qty</th><th scope="col">Unit</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Discount</th><th scope="col" class="num">${taxed ? W.taxable : 'Amount'}</th>${taxed ? `<th scope="col" class="num">GST</th><th scope="col" class="num">${mode === 'inter' ? 'IGST' : 'CGST + SGST'}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    ${summary}
    <dl class="doc-totals" data-testid="paper-totals">
      <div><dt>${taxed ? W.taxable : 'Amount'}</dt><dd>${rp(t.taxable)}</dd></div>
      ${mode === 'intra' ? `<div><dt>CGST</dt><dd data-testid="paper-cgst">${rp(t.cgst)}</dd></div><div><dt>SGST</dt><dd data-testid="paper-sgst">${rp(t.sgst)}</dd></div>` : ''}
      ${mode === 'inter' ? `<div><dt>IGST</dt><dd data-testid="paper-igst">${rp(t.igst)}</dd></div>` : ''}
      ${t.round_off ? `<div><dt>${W.roundOff}</dt><dd>${rp(t.round_off)}</dd></div>` : ''}
      <div class="grand"><dt>${W.total}</dt><dd data-testid="paper-total">${rw(t.total)}</dd></div>
    </dl>
    <p class="words" data-testid="paper-words">${e(t.in_words || '')}</p>
    ${doc.notes ? `<p>${e(doc.notes)}</p>` : ''}
    <footer class="doc-foot bill-foot">
      ${bank.account_number || (isBill(doc) && lk.upi_id) ? `<div><p class="label">Pay to</p>${bank.account_number ? `<p>${e(bank.account_name)}</p><p>A/c ${e(bank.account_number)} · IFSC ${e(bank.ifsc)}</p>` : ''}${isBill(doc) && lk.upi_id ? `<p>UPI ${e(lk.upi_id)}</p>` : ''}</div>` : ''}
      ${doc.terms || lk.terms ? `<div><p class="label">${W.terms}</p><p>${e(doc.terms || lk.terms)}</p></div>` : ''}
      <div class="sign">${business && business.signature_version ? `<img alt="Signature" src="/api/v1/business/signature?v=${e(business.signature_version)}">` : ''}<p>For ${e(seller.name)}</p><p class="muted">${W.authorised}</p></div>
    </footer>
  </article>`;
}

// ---------- the bill view (AC-28.5, AC-29.2, AC-30, AC-31) ----------
export function billView({ state, ui, me, params, today }) {
  const doc = state.documents.find((d) => d.id === params.id);
  if (!doc || !isV2(doc) || doc.deleted) return notFound();
  const s = statusOf(doc, today);
  const demo = Boolean(state.settings.is_demo);
  const numbered = Boolean(doc.number);
  const live = numbered && ['saved', 'sent', 'paid', 'overdue'].includes(s);
  const v = ui.billView || {};
  const make = can(me, 'create_documents');
  const btn = (action, label, ic, cls = 'btn-secondary', extra = '') => `<button type="button" class="btn ${cls}" data-action="${action}" data-doc="${e(doc.id)}" ${extra}>${icon(ic, { size: 18 })} ${label}</button>`;
  const estimateBilled = doc.type === 'quote' && doc.bill_id;
  const actions = []; // the main step and the common ones
  const more = []; // everything else, behind More (rule 6: one main action per screen)
  if (make && doc.type === 'quote' && numbered && !estimateBilled && s !== 'cancelled') actions.push(btn('bill-make-bill', W.makeBill, 'file', 'btn-primary'));
  if (make && live) {
    actions.push(btn('bill-send', W.sendWhatsApp, 'send', doc.type === 'quote' && !estimateBilled ? 'btn-secondary' : 'btn-primary', 'data-testid="send-whatsapp"'));
    actions.push(btn('bill-copy-link', W.copyLink, 'file'));
    if (isBill(doc) && s !== 'paid') actions.push(btn('bill-mark-paid', W.markPaid, 'checks'));
    if (win().navigator && win().navigator.share) more.push(btn('bill-share', W.share, 'arrowRight', 'btn-ghost'));
    if (s !== 'sent' && s !== 'paid') more.push(btn('bill-mark-sent', W.markSent, 'check', 'btn-ghost'));
  }
  if (make && !numbered) actions.push(`<a class="btn btn-primary" href="#/bills/${encodeURIComponent(doc.id)}/edit">${icon('pencil', { size: 18 })} ${W.edit}</a>`);
  if (make && doc.status === 'saved') more.push(`<a class="btn btn-ghost" href="#/bills/${encodeURIComponent(doc.id)}/edit">${icon('pencil', { size: 18 })} ${W.edit}</a>`);
  if (make && numbered) (s === 'cancelled' ? actions : more).push(btn('bill-copy', W.makeCopy, 'rotate', s === 'cancelled' ? 'btn-primary' : 'btn-ghost'));
  if (numbered && doc.link_token && !demo) more.push(`<a class="btn btn-ghost" href="/b/${e(doc.link_token)}/pdf" download data-testid="download-pdf">${icon('download', { size: 18 })} ${W.downloadPdf}</a>`);
  if (numbered) more.push(`<button type="button" class="btn btn-ghost" data-action="download" data-testid="download">${icon('download', { size: 18 })} ${W.print}</button>`);
  if (make && live && doc.link_token && !demo) more.push(btn('bill-link', doc.link_on === false ? W.linkOn : W.linkOff, 'eyeOff', 'btn-ghost'));
  if (can(me, isBill(doc) ? 'cancel_bills' : 'create_documents') && live) more.push(btn('bill-cancel', W.cancelBill, 'x', 'btn-ghost danger-text'));
  const billedLine = estimateBilled ? `<p class="notice" data-testid="billed-as">${W.billedAs} <strong>${e(doc.bill_number || '')}</strong> <a href="#/bills/${encodeURIComponent(doc.bill_id)}">${W.openBill}</a></p>` : '';
  const fromEst = doc.estimate_id ? state.documents.find((d) => d.id === doc.estimate_id) : null;
  return `<section class="page doc-page bill-view">
    <div class="doc-toolbar no-print"><a class="back" href="${isBill(doc) ? '#/bills' : '#/estimates'}">${icon('arrowLeft', { size: 18 })} ${isBill(doc) ? W.bills : W.estimates}</a>${statusChip(s)}</div>
    <h1 id="page-title" class="sr-only" tabindex="-1">${e(docWord(doc))} ${e(numberText(doc))}</h1>
    ${v.notice ? `<p class="notice no-print ${v.notice.error ? 'notice-error' : ''}" role="status" data-testid="bill-notice">${e(v.notice.text)}${v.notice.undo ? ` <button type="button" class="btn btn-ghost btn-small" data-action="${v.notice.undo}" data-doc="${e(doc.id)}">${W.undo}</button>` : ''}${v.notice.open ? ` <a href="${v.notice.open}">${W.openBill}</a>` : ''}</p>` : ''}
    ${doc.save && !numbered ? `<p class="notice no-print" role="status" data-testid="number-when-online">${W.numberWhenOnline}. ${W.notSharedYet}</p>` : ''}
    ${doc.link_on === false ? `<p class="notice no-print" data-testid="link-off">${W.linkIsOff}</p>` : ''}
    ${demo && numbered ? `<p class="muted small no-print" data-testid="links-for-real">${W.sampleLinks}.</p>` : ''}
    ${billedLine}${fromEst ? `<p class="muted small no-print">From ${W.estimate.toLowerCase()} <a href="#/bills/${encodeURIComponent(fromEst.id)}">${e(fromEst.number)}</a></p>` : ''}
    ${doc.job_id ? `<p class="muted small no-print">Job <a href="#/jobs/${encodeURIComponent(doc.job_id)}">${e(doc.job_id)}</a></p>` : ''}
    ${v.cancelling ? `<form class="panel no-print" data-form="bill-cancel" data-doc="${e(doc.id)}"><label class="field"><span>${W.cancelReason}</span><input name="reason" maxlength="200"></label><div class="actions"><button type="submit" class="btn btn-primary danger">${W.cancelBill}</button><button type="button" class="btn btn-ghost" data-action="bill-cancel-close">Keep it</button></div></form>` : ''}
    <div class="actions bill-actions no-print" data-testid="bill-actions">${actions.join('')}${more.length ? `<details class="more-actions" ${v.cancelling || v.moreOpen ? 'open' : ''}><summary class="btn btn-ghost">${W.more}</summary><div class="more-list">${more.join('')}</div></details>` : ''}</div>
    ${billPaper(doc, { business: me.business, settings: state.settings, sample: demo || doc.sample })}
    ${(doc.history || []).length ? `<details class="panel no-print bill-history" open data-testid="bill-history"><summary>${W.history}</summary><ul class="history">${[...doc.history].reverse().map((h) => `<li><span>${e(h.what)}</span><span class="small"><strong data-testid="history-who">${e(h.who)}</strong> <span class="muted">· ${e(localStamp(h.at, demo))}</span></span></li>`).join('')}</ul></details>` : ''}
  </section>`;
}
const win = () => globalThis;

// ---------- Settings: business type, packs and bill look (AC-26.4, AC-30.1) ----------
export function setupPanel({ me, ui }) {
  const b = me.business || {};
  const packs = Array.isArray(b.packs) ? b.packs : ['field_service'];
  const f = ui.setupForm || {};
  const locked = Boolean(b.is_demo);
  return `<section class="panel" aria-labelledby="packs-title" data-testid="packs-panel">
    <div class="panel-head"><h2 class="panel-title" id="packs-title">${W.packsTitle}</h2></div>
    <p class="muted small">${W.packsLead}</p>
    ${f.notice ? `<p class="notice ${f.notice.error ? 'notice-error' : ''}" role="status" data-testid="packs-notice">${e(f.notice.text)}</p>` : ''}
    <form data-form="bill-setup" class="stack" novalidate>
      ${typeFields(b.business_type || 'service', locked)}
      ${gstFields(b.gst_registration || 'regular', b.state_code || '27', locked)}
      <fieldset class="setting"><legend>Packs</legend>
        <label class="switch"><input type="checkbox" role="switch" name="pack_field_service" ${packs.includes('field_service') ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><strong>${W.packFieldService}</strong><span class="muted">${W.packFieldServiceHint}</span></span></label>
        <p class="pack-soon"><strong>${W.packTrading}</strong> <span class="badge">${W.comingSoon}</span></p>
        <p class="pack-soon"><strong>${W.packShop}</strong> <span class="badge">${W.comingSoon}</span></p>
      </fieldset>
      ${locked ? '<p class="muted small">The demo business\'s setup can\'t be changed.</p>' : `<button type="submit" class="btn btn-primary">${icon('check', { size: 18 })} Save</button>`}
    </form>
  </section>`;
}

export function typeFields(current, locked = false) {
  const types = [['service', W.typeService, W.typeServiceHint], ['trading', W.typeTrading, W.typeTradingHint], ['shop', W.typeShop, W.typeShopHint], ['other', W.typeOther, W.typeOtherHint]];
  return `<fieldset class="setting type-choice"><legend>${W.setupTitle}</legend>${types.map(([v, label, hint]) => `<label class="radio-card"><input type="radio" name="business_type" value="${v}" ${current === v ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><strong>${label}</strong><span class="muted small">${hint}</span></span></label>`).join('')}</fieldset>`;
}

export function gstFields(reg, stateCode, locked = false) {
  return `<fieldset class="setting"><legend>${W.gstLabel}</legend>${[['regular', W.gstRegular], ['composition', W.gstComposition], ['unregistered', W.gstUnregistered]].map(([v, label]) => `<label class="radio"><input type="radio" name="gst_registration" value="${v}" ${reg === v ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${label}</label>`).join('')}</fieldset>
    <label class="field"><span>${W.stateLabel}</span><select name="state_code" ${locked ? 'disabled' : ''}><option value="">–</option>${Object.entries(STATES).map(([code, name]) => `<option value="${code}" ${stateCode === code ? 'selected' : ''}>${e(name)} (${code})</option>`).join('')}</select></label>`;
}

export function setupScreen({ me, ui }) {
  const b = me.business || {};
  const f = ui.setupForm || {};
  return `<section class="page setup-page" data-testid="setup-screen">
    <header class="page-head"><h1 id="page-title" tabindex="-1">${W.setupTitle}</h1></header>
    <p class="muted">${W.setupLead}</p>
    ${f.notice ? `<p class="notice ${f.notice.error ? 'notice-error' : ''}" role="alert" data-testid="setup-notice">${e(f.notice.text)}</p>` : ''}
    <form data-form="bill-first-setup" class="stack" novalidate>
      ${typeFields(f.business_type || '')}
      ${gstFields(f.gst_registration || 'regular', f.state_code ?? b.state_code ?? '')}
      <button type="submit" class="btn btn-primary btn-lg">${icon('check', { size: 18 })} ${W.setupSave}</button>
    </form>
  </section>`;
}

export function lookPanel({ me, ui }) {
  const b = me.business || {};
  const lk = { ...lookOf(b), ...((ui.lookForm && ui.lookForm.draft) || {}) };
  const f = ui.lookForm || {};
  const locked = Boolean(b.is_demo);
  const dis = locked ? 'disabled' : '';
  return `<section class="panel" aria-labelledby="look-title" data-testid="look-panel">
    <div class="panel-head"><h2 class="panel-title" id="look-title">${W.lookTitle}</h2></div>
    ${f.notice ? `<p class="notice ${f.notice.error ? 'notice-error' : ''}" role="status" data-testid="look-notice">${e(f.notice.text)}</p>` : ''}
    <form data-form="bill-look" class="stack look-form" novalidate>
      <fieldset class="setting"><legend>${W.layout}</legend>${LAYOUTS.map(([v, label]) => `<label class="radio"><input type="radio" name="layout" value="${v}" data-look-live ${lk.layout === v ? 'checked' : ''} ${dis}> ${label}</label>`).join('')}</fieldset>
      <fieldset class="setting"><legend>${W.colour}</legend><div class="swatches">${COLOURS.map((c, i) => `<label class="swatch" style="--sw:${c}"><input type="radio" name="colour" value="${c}" data-look-live ${lk.colour === c ? 'checked' : ''} ${dis}><span class="sr-only">Colour ${i + 1}</span></label>`).join('')}</div></fieldset>
      <label class="field"><span>${W.phone}</span><input name="phone" value="${e(lk.phone)}" inputmode="tel" ${dis}></label>
      <label class="field"><span>${W.bankName}</span><input name="account_name" value="${e(lk.bank.account_name)}" ${dis}></label>
      <label class="field"><span>${W.bankNumber}</span><input name="account_number" value="${e(lk.bank.account_number)}" inputmode="numeric" ${dis}></label>
      <label class="field"><span>${W.bankIfsc}</span><input name="ifsc" value="${e(lk.bank.ifsc)}" autocapitalize="characters" ${dis}></label>
      <label class="field"><span>${W.upiId}</span><input name="upi_id" value="${e(lk.upi_id)}" ${dis}></label>
      <label class="field"><span>${W.terms}</span><textarea name="terms" rows="2" ${dis}>${e(lk.terms)}</textarea></label>
      <label class="field"><span>${W.prefix}</span><input name="prefix" maxlength="6" value="${e(lk.prefix)}" data-look-live autocapitalize="characters" ${dis}><small class="muted">${W.prefixHint}</small></label>
      <label class="field"><span>${W.dueDays}</span><input name="due_days" type="number" min="0" max="365" value="${e(lk.due_days)}" ${dis}><small class="muted">${W.dueDaysHint}</small></label>
      <label class="field"><span>${W.validDays}</span><input name="estimate_valid_days" type="number" min="1" max="365" value="${e(lk.estimate_valid_days)}" ${dis}></label>
      ${locked ? '' : `<div class="logo-field"><span class="logo-label">${W.signature}</span>${b.signature_version ? `<img class="logo-preview" alt="${W.signature}" src="/api/v1/business/signature?v=${e(b.signature_version)}">` : ''}
        <div class="logo-actions"><label class="btn btn-secondary btn-small">${icon('file', { size: 16 })} ${b.signature_version ? W.replaceSignature : W.addSignature}<input class="sr-only" type="file" accept="image/png,image/jpeg" data-action="pick-signature"></label>${b.signature_version ? `<button type="button" class="btn btn-ghost btn-small" data-action="bill-remove-signature">${W.removeSignature}</button>` : ''}</div></div>
        <button type="submit" class="btn btn-primary">${icon('check', { size: 18 })} ${W.saveLook}</button>`}
    </form>
  </section>`;
}

/** The live A4 paper of Settings (CR-0015): its own column beside the forms. */
export function lookPreview({ me, ui, state }) {
  const b = me.business || {};
  const lk = { ...lookOf(b), ...((ui.lookForm && ui.lookForm.draft) || {}) };
  return `<section class="preview-card" aria-labelledby="preview-title">
    <h2 class="panel-title" id="preview-title">${W.preview}</h2>
    <div class="look-preview" data-slot="look-preview" data-testid="look-preview">${billPaper(lookSample(lk, b), { business: b, settings: state.settings, sample: true, look: lk })}</div>
  </section>`;
}
function lookSample(lk, b) {
  return {
    id: 'sample', doc_version: 2, type: 'invoice', status: 'saved', number: `${lk.prefix || ''}${lk.prefix && !'/-'.includes(lk.prefix.at(-1)) ? '/' : ''}26-27/0001`, date: '2026-11-02', due_date: '2026-11-02',
    customer: { name: 'Mehta Clinic', address: 'Kothrud, Pune', state_code: b.state_code || '27' },
    lines: [{ description: 'AC service, split 1.5 ton', qty: 1, unit: 'nos', rate: 89900, gst_rate: '18' }, { description: 'Copper pipe', qty: '2.5', unit: 'metre', rate: 25000, gst_rate: '18' }],
  };
}

// ---------- + New (AC-26.5) ----------
export function newMenu(me, open) {
  const choices = [];
  if (can(me, 'create_documents')) choices.push(['#/bills/new', W.newBill, 'file'], ['#/estimates/new', W.newEstimate, 'file']);
  if (can(me, 'manage_inventory')) choices.push(['#/inventory/new', W.newItem, 'box']);
  if (can(me, 'use_chat')) choices.push(['#/chat', W.newJob, 'jobs']);
  if (!choices.length) return '';
  return `<div class="fab no-print ${open ? 'is-open' : ''}" data-testid="new-button">
    ${open ? `<ul class="fab-menu" aria-label="${W.newMenu}">${choices.map(([href, label, ic]) => `<li><a class="fab-item" href="${href}" data-testid="new-choice">${icon(ic, { size: 18 })} ${label}</a></li>`).join('')}</ul>` : ''}
    <button type="button" class="fab-btn" data-action="bill-new-menu" aria-expanded="${open ? 'true' : 'false'}" aria-label="${W.newMenu}">${icon(open ? 'x' : 'plus', { size: 22 })}<span>${W.newButton}</span></button>
  </div>`;
}

/** Home's bill figures (Screens and flows): billed today, unpaid total, overdue count. */
export function homeBills(fig, demo, stock = null) {
  return `<section class="today" aria-labelledby="bills-today-title" data-testid="home-bills">
    <h2 class="sr-only" id="bills-today-title">${W.bills}${demo ? ` (${W.sample})` : ''}</h2>
    <ul class="kpis kpis-home">
      <li class="kpi kpi-home"><span class="kpi-badge tone-ok" aria-hidden="true">${icon('file', { size: 20 })}</span><span class="kpi-label">${W.billedToday}</span><span class="kpi-value money" data-kpi="billed-today">${rw(fig.billedToday)}</span><a class="kpi-sub" href="#/bills">${W.billsMadeToday(fig.madeToday)}</a></li>
      <li class="kpi kpi-home"><span class="kpi-badge tone-warn" aria-hidden="true">${icon('trend', { size: 20 })}</span><span class="kpi-label">${W.unpaidBalance}</span><span class="kpi-value is-soon" data-kpi="unpaid">${rw(fig.unpaid)}</span><span class="kpi-sub muted">${W.awaitingPayment(fig.unpaidCount)}</span></li>
      <li class="kpi kpi-home"><span class="kpi-badge tone-bad" aria-hidden="true">${icon('alert', { size: 20 })}</span><span class="kpi-label">${W.overdueTitle}</span><span class="kpi-value ${fig.overdue ? 'is-lapsed' : ''}" data-kpi="overdue-amount">${rw(fig.overdueAmount)}</span><span class="kpi-sub muted">${fig.overdue ? `<span data-kpi="overdue">${fig.overdue}</span> ${W.followUps(fig.overdue)}` : `<span data-kpi="overdue" hidden>0</span>${W.nothingOverdue}`}</span></li>
      ${stock ? `<li class="kpi kpi-home"><span class="kpi-badge tone-info" aria-hidden="true">${icon('box', { size: 20 })}</span><span class="kpi-label">${W.stockValuation}</span><span class="kpi-value is-info" data-kpi="stock-value">${rw(stock.value)}</span><a class="kpi-sub" href="#/inventory">${W.itemsLow(stock.low)}</a></li>` : ''}
    </ul>
  </section>`;
}

/** Home's GST card (CR-0015): what this month's saved bills come to, with the next step. */
export function gstCard(g, demo) {
  const row = (label, value, cls = '') => `<div class="${cls}"><dt>${label}</dt><dd class="mono">${rp(value)}</dd></div>`;
  return `<section class="panel gst-card" aria-labelledby="gst-title" data-testid="gst-card">
    <div class="panel-head"><h2 class="panel-title" id="gst-title">${W.gstTitle}</h2>${demo ? `<span class="muted small">${W.sample}</span>` : ''}</div>
    <p class="muted small">${g.count ? W.gstBills(g.count) : W.gstNone}</p>
    <dl class="gst-lines">
      ${row(W.taxable, g.taxable)}
      ${g.igst ? row('IGST', g.igst) : ''}
      ${row('CGST', g.cgst)}
      ${row('SGST', g.sgst)}
      ${row(W.gstTotal, g.total, 'gst-total')}
    </dl>
    <div class="actions"><a class="btn btn-primary btn-small" href="#/bills/new">${icon('plus', { size: 16 })} ${W.gstMake}</a><a class="btn btn-ghost btn-small" href="#/bills">${W.gstAll}</a></div>
  </section>`;
}

export { saveProblem };
