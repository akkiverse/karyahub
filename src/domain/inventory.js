// Inventory of a business, as the screens see it (CR-0011, US-25). Pure functions: no store, no network.
//
// The quantity in stock belongs to the server. A phone keeps the last quantity the server told it (`item.qty`) and the
// stock moves it made that the server has not answered yet (a move without `after`). What a screen shows is the two
// added together, so a part taken with no signal shows at once and is never counted twice once the server has it.

import { detailWords, readDetails, unitNameProblem } from './fields.js';

const BUILT_IN_UNITS = { nos: 'nos', kg: 'kg', metre: 'm', litre: 'litre', set: 'set', roll: 'roll' };
const BUILT_IN_NAMES = { nos: 'nos (pieces)', kg: 'kg', metre: 'metre (m)', litre: 'litre', set: 'set', roll: 'roll' };
const BUILT_IN_WHOLE = ['nos', 'set', 'roll'];
export const BUILT_IN_UNIT_IDS = Object.keys(BUILT_IN_UNITS);
// The units as the screens use them. The six built-in ones are always here; the business's own (CR-0013) are put in
// by applyUnits() whenever the on-device copy changes, so every screen that writes a quantity shows their names.
export const UNITS = { ...BUILT_IN_UNITS };
export const UNIT_NAMES = { ...BUILT_IN_NAMES };
export const WHOLE_UNITS = new Set(BUILT_IN_WHOLE);
export function applyUnits(list = []) {
  for (const k of Object.keys(UNITS)) if (!BUILT_IN_UNITS[k]) delete UNITS[k];
  for (const k of Object.keys(UNIT_NAMES)) if (!BUILT_IN_NAMES[k]) delete UNIT_NAMES[k];
  WHOLE_UNITS.clear();
  BUILT_IN_WHOLE.forEach((u) => WHOLE_UNITS.add(u));
  for (const u of list) {
    UNITS[u.id] = u.name;
    UNIT_NAMES[u.id] = `${u.name}${u.whole ? '' : ' (decimals allowed)'}`;
    if (u.whole) WHOLE_UNITS.add(u.id);
  }
}
/** The units a person may pick for an item: the built-in ones and the business's own that are in use, plus `keep`. */
export function pickableUnits(state, keep = null) {
  const own = (state.units || []).filter((u) => !u.alias_of && (!u.stopped || u.id === keep));
  return [...BUILT_IN_UNIT_IDS.map((id) => ({ id, name: UNIT_NAMES[id] })), ...own.map((u) => ({ id: u.id, name: u.name }))];
}
export const GST_RATES = [0, 0.25, 3, 5, 18, 40]; // 0.25 % and 3 % added by CR-0012 (AC-27.6)
const UNIT_ALIASES = { m: 'metre', mtr: 'metre', mtrs: 'metre', meter: 'metre', meters: 'metre', metres: 'metre', kgs: 'kg', l: 'litre', ltr: 'litre', ltrs: 'litre', litres: 'litre', liter: 'litre', pcs: 'nos', pc: 'nos', piece: 'nos', pieces: 'nos', no: 'nos', sets: 'set', rolls: 'roll' };
export const MOVE_LABELS = { opening: 'Opening stock', in: 'Stock in', out: 'Stock out', used: 'Used on job', returned: 'Put back from job', count: 'Count correction', cut: 'Cut', sold: 'Sold on a bill', sale_cancelled: 'Bill cancelled' };

export const r3 = (n) => Math.round((Number(n) + 0) * 1000) / 1000;
/** 1.5 -> "1.5", 38 -> "38", 1200 -> "1,200". */
export const fmtQty = (q) => r3(q).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const qtyText = (q, unit) => `${fmtQty(q)} ${UNITS[unit] || unit}`;
export const signedText = (q, unit) => `${q > 0 ? '+' : '−'}${qtyText(Math.abs(q), unit)}`;
export const parseUnit = (text) => {
  const t = String(text || '').trim().toLowerCase();
  return UNITS[t] ? t : UNIT_ALIASES[t] || null;
};

// ---------- searching ----------
/** Lower case, µ read as u, and spaces, dots, dashes and slashes ignored: "cap 45" finds "Capacitor 45 µF". */
export const norm = (s) => String(s || '').toLowerCase().replace(/µ/g, 'u').replace(/[\s.\-_/()]+/g, '');
export const words = (s) => String(s || '').toLowerCase().replace(/µ/g, 'u').split(/[\s,]+/).map(norm).filter(Boolean);
export const matches = (item, query, state = null) => {
  const hay = `${norm(item.name)} ${norm(item.code)}${state ? ` ${norm(detailWords(state, item))}` : ''}`;
  return words(query).every((w) => hay.includes(w));
};

// ---------- what is in stock ----------
const pending = (m) => m.after === undefined;
export const movesOf = (state, itemId) => (state.stock_moves || []).filter((m) => m.item_id === itemId);

// ---------- the units an item is sold in (CR-0014) ----------
/** Every unit the item is sold in, the main one first: [{unit, main, sale, cost, low, qty, cut_from, cut_gives}]. */
export function unitsOf(item) {
  return [
    { unit: item.unit, main: true, sale: item.sale, cost: item.cost, low: item.low, qty: Number(item.qty || 0), cut_from: '', cut_gives: null },
    ...(item.sells || []).map((x) => ({ ...x, main: false, qty: Number(x.qty || 0) })),
  ];
}
/** What a stock move does to one unit of the item: a cut lowers the unit it cuts and raises the unit it makes. */
const deltaOf = (m, unit, item) => {
  if (m.kind === 'cut') return m.unit === unit ? m.qty : m.to_unit === unit ? m.gave : 0;
  return (m.unit || item.unit) === unit ? m.qty : 0;
};
/** The quantity to show for one unit: what the server last said, plus this phone's moves it has not answered yet. */
export function stockOf(state, item, unit = item.unit) {
  const held = unitsOf(item).find((u) => u.unit === unit);
  return r3((held ? held.qty : 0) + movesOf(state, item.id).filter(pending).reduce((sum, m) => sum + deltaOf(m, unit, item), 0));
}
export function markOf(qty, low) {
  if (qty < 0) return { kind: 'short' };
  if (qty === 0) return { kind: 'out' };
  if (low != null && qty <= low) return { kind: 'low' };
  return null;
}
/** The mark of one unit. The main unit is marked as before; another unit only when it has a level set or is short, so a unit that is cut on demand isn't "Out" all day. */
export function unitMark(state, item, u) {
  if (item.service) return null;
  const q = stockOf(state, item, u.unit);
  if (u.main) return markOf(q, u.low);
  if (q < 0) return { kind: 'short' };
  return u.low != null && q <= u.low ? { kind: 'low' } : null;
}
export const markText = (mark, qty, unit) => (!mark ? '' : mark.kind === 'low' ? 'Low' : mark.kind === 'out' ? 'Out' : `Short by ${qtyText(-qty, unit)}`);
export const nameOf = (a, b) => a.name.localeCompare(b.name, 'en-IN');

export function summary(state) {
  const live = (state.items || []).filter((i) => !i.stopped);
  let low = 0;
  let out = 0;
  let value = 0;
  for (const i of live) {
    const marks = unitsOf(i).map((u) => unitMark(state, i, u));
    if (marks.some((m) => m && m.kind === 'low')) low += 1;
    if (marks.some((m) => m && (m.kind === 'out' || m.kind === 'short'))) out += 1;
    for (const u of unitsOf(i)) value += Math.max(stockOf(state, i, u.unit), 0) * (u.cost || 0);
  }
  return { all: live.length, low, out, stopped: (state.items || []).length - live.length, value: Math.round(value) };
}
export function listItems(state, { filter = 'all', q = '', f = {} } = {}) {
  const picked = Object.entries(f).filter(([, v]) => v);
  return (state.items || [])
    .filter((i) => (filter === 'stopped' ? i.stopped : !i.stopped))
    .filter((i) => picked.every(([fid, entry]) => (i.attrs || {})[fid] === entry))
    .filter((i) => {
      const marks = unitsOf(i).map((u) => unitMark(state, i, u)).filter(Boolean);
      if (filter === 'low') return marks.some((m) => m.kind === 'low');
      if (filter === 'out') return marks.some((m) => m.kind === 'out' || m.kind === 'short');
      return true;
    })
    .filter((i) => !String(q).trim() || matches(i, q, state))
    .sort(nameOf);
}
/** One unit's moves, newest first, each with the quantity left in that unit after it. A cut shows in both units. */
export function historyOf(state, item, unit = item.unit) {
  const moves = movesOf(state, item.id).map((m, order) => ({ m, order })).filter(({ m }) => deltaOf(m, unit, item) !== 0 || (m.kind === 'cut' && (m.unit === unit || m.to_unit === unit)));
  moves.sort((a, b) => (a.m.at === b.m.at ? b.order - a.order : a.m.at < b.m.at ? 1 : -1));
  let run = stockOf(state, item, unit);
  return moves.map(({ m }) => {
    const d = deltaOf(m, unit, item);
    const row = { ...m, qty: d, shown_after: run };
    run = r3(run - d);
    return row;
  });
}

// ---------- parts used on a job ----------
/** What a job has used, in the order the parts were taken: the server's list plus this phone's moves not answered yet. */
export function partsOnJob(state, job) {
  const used = { ...(job.parts_used || {}) };
  for (const m of state.stock_moves || []) {
    if (m.job_id !== job.id || !pending(m) || (m.kind !== 'used' && m.kind !== 'returned')) continue;
    used[m.item_id] = r3((used[m.item_id] || 0) - m.qty); // used is stored as minus, put back as plus
  }
  return Object.entries(used)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ id, qty, item: (state.items || []).find((i) => i.id === id) || null }));
}
/** The parts named in the job's note, matched to items by name with no AI. */
export function suggestParts(state, job, dismissed = []) {
  const taken = new Set(partsOnJob(state, job).map((p) => p.id));
  return String(job.parts || '')
    .split(/[,;\n+]| and /i)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = /^(.*?)\s+(\d+(?:\.\d+)?)\s*(kgs?|mtrs?|metres?|meters?|m|nos|pcs?|litres?|ltrs?|l|sets?|rolls?)$/i.exec(seg);
      const text = m ? m[1] : seg;
      const qty = m ? Number(m[2]) : 1;
      const item = (state.items || []).find((i) => !i.stopped && words(text).length && matches(i, text)) || null;
      return { seg, text, qty, item };
    })
    .filter((s) => !dismissed.includes(s.seg) && !(s.item && taken.has(s.item.id)));
}
/** Document lines for the parts a job used: item name, quantity, sale price (₹). A job line that already names the part is not doubled. */
export function partLines(state, job) {
  const lines = [];
  for (const p of partsOnJob(state, job)) {
    if (!p.item) continue;
    const hay = `${norm(p.item.name)} ${norm(p.item.code)}`;
    const covered = (job.lines || []).some((l) => { const w = words(l.description); return w.length > 1 && w.every((x) => hay.includes(x)); });
    if (covered) continue;
    lines.push({ description: p.item.name, qty: p.qty, rate: (p.item.sale || 0) / 100 });
  }
  return lines;
}

// ---------- reading what people type ----------
export function parseQty(text, unit, whole = WHOLE_UNITS.has(unit), label = UNITS[unit]) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, message: 'Type a quantity.' };
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return { ok: false, message: 'Use a number, for example 2 or 1.5.' };
  const value = Number(t);
  if (value > 1_000_000) return { ok: false, message: 'That is too large. Use up to 1,000,000.' };
  if (whole && !Number.isInteger(value)) return { ok: false, message: `Use a whole number for ${label}.` };
  return { ok: true, value };
}
/** "450" or "1,250.50" -> paise. Empty is allowed (value null). */
export function parseRupees(text) {
  const t = String(text ?? '').replace(/[₹,\s]/g, '');
  if (!t) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, message: 'Type the price in rupees, for example 450 or 450.50.' };
  return { ok: true, value: Math.round(Number(t) * 100) };
}
export const isoFromDmy = (s) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
};
export const dmy = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return y ? `${d}-${m}-${y}` : ''; };

export const MAX_SELLS = 49; // other units besides the main one (50 in all)
/** The other units an item is sold in, from the form's rows (sell_unit_0, sell_sale_0 ...). `main` is the main unit's id, or '__new__' while it is still being made. */
function readSells(v, main, errors, isNew) {
  const sells = [];
  const openings = [];
  const seen = [main];
  for (let i = 0; Object.prototype.hasOwnProperty.call(v, `sell_unit_${i}`); i += 1) {
    const k = (n) => `sell_${n}_${i}`;
    const unit = v[k('unit')];
    if (!UNITS[unit]) errors[k('unit')] = 'Pick a unit.';
    else if (seen.includes(unit)) errors[k('unit')] = `${UNITS[unit]} is already one of this item's units.`;
    else seen.push(unit);
    const sale = parseRupees(v[k('sale')]);
    if (!sale.ok) errors[k('sale')] = sale.message;
    else if (sale.value == null) errors[k('sale')] = 'Type the price for this unit.';
    const cost = parseRupees(v[k('cost')]);
    if (!cost.ok) errors[k('cost')] = cost.message;
    let low = null;
    if (String(v[k('low')] ?? '').trim()) {
      const l = parseQty(v[k('low')], unit);
      if (!l.ok) errors[k('low')] = 'Type a number, or leave it empty.'; else low = l.value;
    }
    const cutFrom = v[k('cut_from')] || '';
    let gives = null;
    if (cutFrom) {
      const g = parseQty(v[k('cut_gives')], unit);
      if (!g.ok) errors[k('cut_gives')] = g.message;
      else if (g.value === 0) errors[k('cut_gives')] = 'A cut must give more than 0.';
      else gives = g.value;
    }
    if (String(v[k('opening')] ?? '').trim() && isNew) {
      const o = parseQty(v[k('opening')], unit);
      if (!o.ok) errors[k('opening')] = o.message; else if (o.value > 0) openings.push({ unit, qty: o.value });
    }
    sells.push({ unit, sale: sale.value, cost: cost.value, low, cut_from: cutFrom, cut_gives: gives });
  }
  if (sells.length > MAX_SELLS) errors.sells = `An item can be sold in up to ${MAX_SELLS + 1} units.`;
  for (const [i, x] of sells.entries()) {
    if (x.cut_from && !seen.includes(x.cut_from)) errors[`sell_cut_from_${i}`] = "Cut from one of this item's own units.";
    if (x.cut_from && x.cut_from === x.unit) errors[`sell_cut_from_${i}`] = "A unit can't be cut from itself.";
  }
  return { sells, openings };
}

/** Check the add or edit form. Returns the item to save (prices in paise) or the message for each wrong field.
 *  `pending` are list values typed that the list doesn't have yet; `newUnit` is a unit typed for this item. */
export function validateItem(v, state, editingId = null) {
  const errors = {};
  const name = String(v.name || '').trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Give the item a name of 2 to 80 characters.';
  const code = String(v.code || '').trim();
  if (code) {
    if (!/^[A-Za-z0-9._/-]{1,24}$/.test(code)) errors.code = 'Use up to 24 letters, numbers, dots, dashes or slashes.';
    else {
      const other = (state.items || []).find((i) => i.id !== editingId && String(i.code || '').toLowerCase() === code.toLowerCase());
      if (other) errors.code = `Code ${code} is already used by ${other.name}.`;
    }
  }
  let unit = v.unit;
  let newUnit = null;
  if (unit === '__new__') {
    const problem = unitNameProblem(state, v.new_unit, BUILT_IN_UNIT_IDS);
    if (problem) errors.new_unit = problem;
    else { newUnit = { name: String(v.new_unit).trim(), whole: v.new_unit_whole === 'on' || v.new_unit_whole === true }; unit = null; }
  } else if (!UNITS[unit]) errors.unit = 'Pick a unit.';
  const sale = parseRupees(v.sale);
  if (!sale.ok) errors.sale = sale.message;
  else if (sale.value == null) errors.sale = 'Type the sale price, or 0 if you never bill this part.';
  const cost = parseRupees(v.cost);
  if (!cost.ok) errors.cost = cost.message;
  const hsn = String(v.hsn || '').trim();
  if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) errors.hsn = 'An HSN code has 4, 6 or 8 digits.';
  if (!GST_RATES.includes(Number(v.gst))) errors.gst = 'Pick a GST rate.';
  let low = null;
  if (String(v.low ?? '').trim()) {
    const l = parseQty(v.low, 'kg');
    if (!l.ok) errors.low = 'Type a number, or leave it empty for no Low mark.';
    else low = l.value;
  }
  let opening = 0;
  if (v.opening !== undefined && String(v.opening).trim()) {
    const o = newUnit ? parseQty(v.opening, null, newUnit.whole, newUnit.name) : parseQty(v.opening, v.unit);
    if (!o.ok) errors.opening = o.message;
    else opening = o.value;
  }
  const details = readDetails(state, v);
  Object.assign(errors, details.errors);
  const { sells, openings } = readSells(v, newUnit ? '__new__' : unit, errors, editingId == null);
  if (Object.keys(errors).length) return { errors };
  const on = (x) => x === true || x === 'on' || x === 'true';
  return {
    errors, opening, openings, pending: details.pending, newUnit,
    item: { name, code, unit, sale: sale.value, cost: cost.value, hsn, gst: Number(v.gst), low, price_includes_gst: on(v.price_includes_gst), service: on(v.service), attrs: details.attrs, sells },
  };
}
