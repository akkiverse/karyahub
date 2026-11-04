// Estimates and bills on the phone (CR-0012). The server (backend/karyahub/data/bills.py) numbers them and
// stores its own figures; this file makes drafts, shows figures while typing, and draws lists. The demo
// business keeps bills on the device, so it numbers them here the same way (AC-30.6).
import { compute, TaxInputError, gstinOk, STATES } from './tax.js';
import { uid } from '../ids.js';
import { W } from '../words.js';
import { billName } from './fields.js';

export const DOC_VERSION = 2;
export const BIG_BILL = 5_000_000; // ₹50,000 in paise (AC-27.8)
export const DEFAULT_LOOK = {
  layout: 'a4_classic', colour: '#0F766E', phone: '', bank: { account_name: '', account_number: '', ifsc: '' },
  upi_id: '', terms: '', prefix: '', due_days: 0, estimate_valid_days: 15,
};
export const COLOURS = ['#0F766E', '#1D4ED8', '#4338CA', '#9F1239', '#15803D', '#334155'];
export const LAYOUTS = [['a4_classic', W.layoutClassic], ['a4_modern', W.layoutModern], ['receipt_80', W.layoutReceipt]];

export const isV2 = (d) => Boolean(d) && d.doc_version === DOC_VERSION;
export const isBill = (d) => d.type === 'invoice';
export const lookOf = (business) => {
  const saved = (business && business.bill_look) || {};
  return { ...DEFAULT_LOOK, ...saved, bank: { ...DEFAULT_LOOK.bank, ...(saved.bank || {}) } };
};
/** Every business before v0.8.0, and one not yet set up, has Field service on (AC-26.2). */
export const packsOf = (business) => (business && Array.isArray(business.packs) ? business.packs : ['field_service']);
export const hasFieldService = (me) => packsOf(me && me.business).includes('field_service');
export const sellerOf = (business, settings = {}) => ({
  name: (business && business.name) || settings.business_name || '',
  address: (business && business.address) || settings.address || '',
  gstin: business && business.gst_registration === 'unregistered' ? '' : (business && business.gstin) || settings.gstin || '',
  state_code: (business && business.state_code) || '27',
  registration: (business && business.gst_registration) || 'regular',
  phone: lookOf(business).phone,
});

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** The financial year (1 April to 31 March) of an ISO date, as "26-27". */
export function fyOf(iso) {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${pad(start % 100)}-${pad((start + 1) % 100)}`;
}
export const numberSep = (prefix) => (!prefix || '/-'.includes(prefix.at(-1)) ? '' : '/');
export const numberOf = (type, prefix, fy, n) => (type === 'invoice' ? `${prefix}${numberSep(prefix)}${fy}/${pad(n, 4)}` : `E/${fy}/${pad(n, 4)}`);
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function newDraft({ type = 'invoice', today, look = DEFAULT_LOOK, customer = null, lines = [], jobId = '', estimateId = '', from = null }) {
  return {
    id: `doc-${uid()}`, doc_version: DOC_VERSION, type, status: 'draft', number: '', date: today,
    customer: customer || { id: '', name: W.walkIn, phone: '', address: '', gstin: '', state_code: '' },
    lines, place_of_supply: from ? from.place_of_supply || '' : '', bill_discount: from ? from.bill_discount || null : null,
    notes: from ? from.notes || '' : '', terms: '', job_id: jobId, estimate_id: estimateId,
    due_date: '', valid_until: type === 'quote' ? addDays(today, look.estimate_valid_days) : '',
  };
}

/** What the tax engine needs: a saved bill keeps its seller's registration and state; a draft uses today's. */
export function engineInput(doc, business) {
  const seller = doc.seller || sellerOf(business);
  return {
    registration: seller.registration, business_state: seller.state_code,
    place_of_supply: doc.place_of_supply || seller.state_code, lines: doc.lines, bill_discount: doc.bill_discount,
  };
}
/** The figures while typing: { result } or { error, line } (line counted from 1, or null for the bill). */
export function figuresOf(doc, business) {
  try {
    return { result: compute(engineInput(doc, business)) };
  } catch (e) {
    if (e instanceof TaxInputError) return { error: e.message, line: e.line === null ? null : e.line + 1 };
    throw e;
  }
}

/** The same checks the server makes before a number is given (AC-27.8), so the person hears at once. */
export function saveProblem(doc, business) {
  if (!doc.lines.length) return W.addLine;
  const bad = doc.lines.findIndex((l) => !String(l.description || '').trim());
  if (bad >= 0) return `Line ${bad + 1}: give it a description.`;
  const f = figuresOf(doc, business);
  if (f.error) return f.line ? `Line ${f.line}: ${f.error}` : f.error;
  const c = doc.customer || {};
  if (c.gstin && !gstinOk(c.gstin)) return W.badGstin;
  if (isBill(doc) && f.result.totals.total >= BIG_BILL && !c.gstin && !(c.address && STATES[c.state_code])) return W.bigBill;
  return '';
}

/** Overdue is worked out, never stored (AC-28.4); documents from v0.7.0 show as Saved (AC-28.7). */
export function statusOf(doc, today) {
  if (!isV2(doc)) return 'saved';
  const s = doc.status || 'draft';
  if (['saved', 'sent'].includes(s) && isBill(doc) && doc.due_date && doc.due_date < today) return 'overdue';
  return s;
}
export const STATUS_WORDS = { draft: W.draft, saved: W.saved, sent: W.sent, paid: W.paid, overdue: W.overdue, cancelled: W.cancelled };

/** Total in paise for any document: v2 stores paise, v0.7.0 stored whole rupees. */
export const totalOf = (d) => (isV2(d) ? (d.totals ? d.totals.total : null) : Math.round(Number(d.total || 0) * 100));
export const numberText = (d) => (d.number || (isV2(d) ? (d.save ? W.numberWhenOnline : W.draft) : d.id));
export const docWord = (d) => (d.type === 'quote' ? W.estimate : W.bill);

/** AC-27.2: the price on this customer's last bill for this item. */
export function lastPrice(documents, customer, itemId) {
  if (!customer || !itemId) return null;
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
  const same = (c) => (customer.id && c.id === customer.id) || (phone && String(c.phone || '').replace(/\D/g, '').slice(-10) === phone);
  const bills = documents
    .filter((d) => isV2(d) && isBill(d) && ['saved', 'sent', 'paid'].includes(d.status) && same(d.customer || {}))
    .sort((a, b) => `${b.date}${b.number}`.localeCompare(`${a.date}${a.number}`));
  for (const d of bills) {
    const l = d.lines.find((x) => x.item_id === itemId);
    if (l) return Number(l.rate);
  }
  return null;
}
/** A bill line from an item. With the on-device copy, the item's on-bill details join its name and a unit of the business's own prints by its name (CR-0013). */
export function lineFromItem(item, price = null, state = null) {
  const own = state && (state.units || []).find((u) => u.id === item.unit);
  return {
    item_id: item.id, description: state ? billName(state, item) : item.name, hsn: item.hsn || '', qty: 1, unit: own ? own.name : item.unit, rate: price ?? item.sale ?? 0,
    gst_rate: String(item.gst ?? 18), price_includes_gst: Boolean(item.price_includes_gst), discount: null,
    from_job_parts: false, last_price: price !== null,
  };
}

// ---------- the WhatsApp message (AC-31.1); the server makes the same one ----------
export const rupeesWhole = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
export function messageText(doc, businessName, url) {
  const name = doc.customer.name;
  const greeting = name === W.walkIn ? 'Namaste' : `Namaste ${name}`;
  const total = rupeesWhole(totalOf(doc) || 0);
  const what = doc.type === 'quote' ? `your estimate ${doc.number}, valid until ${ddmmyyyy(doc.valid_until)},` : `your bill ${doc.number}`;
  return `${greeting}, here is ${what} from ${businessName} for ${total}: ${url}`;
}
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : ''}?text=${encodeURIComponent(text)}`;
}

// ---------- the Bills list (AC-28.6) ----------
export const CHIPS = [['all', W.chipAll], ['draft', W.draft], ['unpaid', W.chipUnpaid], ['overdue', W.overdue], ['paid', W.paid], ['cancelled', W.cancelled]];
const chipHas = (chip, status) => chip === 'all' || chip === status || (chip === 'unpaid' && ['saved', 'sent', 'overdue'].includes(status));
export function billList(documents, { kind = 'invoice', q = '', chip = 'all' }, today) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, '');
  const mine = documents.filter((d) => d.type === kind && !d.deleted);
  const matching = mine.filter((d) => {
    if (!words.length) return true;
    const c = d.customer || {};
    const hay = `${d.number || ''} ${c.name || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w)) || (digits.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(digits));
  });
  const counts = Object.fromEntries(CHIPS.map(([k]) => [k, matching.filter((d) => chipHas(k, statusOf(d, today))).length]));
  const rows = matching
    .filter((d) => chipHas(chip, statusOf(d, today)))
    .sort((a, b) => `${b.date || ''}${b.number || 'zz'}`.localeCompare(`${a.date || ''}${a.number || 'zz'}`));
  return { rows, counts };
}

/** Home's figures (US-26 Home): billed today, unpaid total, overdue count. */
export function billFigures(documents, today) {
  let billedToday = 0;
  let unpaid = 0;
  let overdue = 0;
  for (const d of documents) {
    if (!isV2(d) || !isBill(d) || d.deleted) continue;
    const s = statusOf(d, today);
    const t = totalOf(d) || 0;
    if (d.date === today && ['saved', 'sent', 'paid', 'overdue'].includes(s)) billedToday += t;
    if (['saved', 'sent', 'overdue'].includes(s)) unpaid += t;
    if (s === 'overdue') overdue += 1;
  }
  return { billedToday, unpaid, overdue };
}

// ---------- the demo business: numbered on the device (AC-30.6) ----------
export function demoSave(state, doc, business) {
  const problem = saveProblem(doc, business);
  if (problem) return { problem };
  const look = lookOf(business);
  const fy = fyOf(doc.date);
  const series = `${doc.type === 'invoice' ? 'bill' : 'estimate'}:${fy}`;
  state.bill_counters = state.bill_counters || {};
  state.bill_counters[series] = (state.bill_counters[series] || 0) + 1;
  const f = figuresOf(doc, business).result;
  doc.lines = doc.lines.map((l, i) => ({ ...l, ...f.lines[i] }));
  Object.assign(doc, {
    status: 'saved', number: numberOf(doc.type, look.prefix, fy, state.bill_counters[series]), fy, series,
    seller: sellerOf(business, state.settings), tax_mode: f.tax_mode, place_of_supply: f.place_of_supply, summary: f.summary, totals: f.totals,
    sample: true,
  });
  if (isBill(doc) && !doc.due_date) doc.due_date = addDays(doc.date, look.due_days);
  delete doc.save;
  delete doc.save_problem;
  return { doc };
}
