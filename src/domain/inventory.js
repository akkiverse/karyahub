// Inventory of a business, as the screens see it (CR-0011, US-25). Pure functions: no store, no network.
//
// The quantity in stock belongs to the server. A phone keeps the last quantity the server told it (`item.qty`) and the
// stock moves it made that the server has not answered yet (a move without `after`). What a screen shows is the two
// added together, so a part taken with no signal shows at once and is never counted twice once the server has it.

export const UNITS = { nos: 'nos', kg: 'kg', metre: 'm', litre: 'litre', set: 'set', roll: 'roll' };
export const UNIT_NAMES = { nos: 'nos (pieces)', kg: 'kg', metre: 'metre (m)', litre: 'litre', set: 'set', roll: 'roll' };
export const WHOLE_UNITS = new Set(['nos', 'set', 'roll']);
export const GST_RATES = [0, 5, 18, 40];
const UNIT_ALIASES = { m: 'metre', mtr: 'metre', mtrs: 'metre', meter: 'metre', meters: 'metre', metres: 'metre', kgs: 'kg', l: 'litre', ltr: 'litre', ltrs: 'litre', litres: 'litre', liter: 'litre', pcs: 'nos', pc: 'nos', piece: 'nos', pieces: 'nos', no: 'nos', sets: 'set', rolls: 'roll' };
export const MOVE_LABELS = { opening: 'Opening stock', in: 'Stock in', out: 'Stock out', used: 'Used on job', returned: 'Put back from job', count: 'Count correction' };

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
export const matches = (item, query) => {
  const hay = `${norm(item.name)} ${norm(item.code)}`;
  return words(query).every((w) => hay.includes(w));
};

// ---------- what is in stock ----------
const pending = (m) => m.after === undefined;
export const movesOf = (state, itemId) => (state.stock_moves || []).filter((m) => m.item_id === itemId);
/** The quantity to show: what the server last said, plus this phone's moves it has not answered yet. */
export function stockOf(state, item) {
  return r3(Number(item.qty || 0) + movesOf(state, item.id).filter(pending).reduce((s, m) => s + m.qty, 0));
}
export function markOf(qty, low) {
  if (qty < 0) return { kind: 'short' };
  if (qty === 0) return { kind: 'out' };
  if (low != null && qty <= low) return { kind: 'low' };
  return null;
}
export const markText = (mark, qty, unit) => (!mark ? '' : mark.kind === 'low' ? 'Low' : mark.kind === 'out' ? 'Out' : `Short by ${qtyText(-qty, unit)}`);
export const nameOf = (a, b) => a.name.localeCompare(b.name, 'en-IN');

export function summary(state) {
  const live = (state.items || []).filter((i) => !i.stopped);
  let low = 0;
  let out = 0;
  let value = 0;
  for (const i of live) {
    const q = stockOf(state, i);
    const m = markOf(q, i.low);
    if (m && m.kind === 'low') low += 1;
    if (m && (m.kind === 'out' || m.kind === 'short')) out += 1;
    value += Math.max(q, 0) * (i.cost || 0);
  }
  return { all: live.length, low, out, stopped: (state.items || []).length - live.length, value: Math.round(value) };
}
export function listItems(state, { filter = 'all', q = '' } = {}) {
  return (state.items || [])
    .filter((i) => (filter === 'stopped' ? i.stopped : !i.stopped))
    .filter((i) => {
      const m = markOf(stockOf(state, i), i.low);
      if (filter === 'low') return m && m.kind === 'low';
      if (filter === 'out') return m && (m.kind === 'out' || m.kind === 'short');
      return true;
    })
    .filter((i) => !String(q).trim() || matches(i, q))
    .sort(nameOf);
}
/** An item's moves, newest first, each with the quantity left after it. */
export function historyOf(state, item) {
  const moves = movesOf(state, item.id).map((m, order) => ({ m, order }));
  moves.sort((a, b) => (a.m.at === b.m.at ? b.order - a.order : a.m.at < b.m.at ? 1 : -1));
  let run = stockOf(state, item);
  return moves.map(({ m }) => {
    const row = { ...m, shown_after: run };
    run = r3(run - m.qty);
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
export function parseQty(text, unit) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, message: 'Type a quantity.' };
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return { ok: false, message: 'Use a number, for example 2 or 1.5.' };
  const value = Number(t);
  if (value > 1_000_000) return { ok: false, message: 'That is too large. Use up to 1,000,000.' };
  if (WHOLE_UNITS.has(unit) && !Number.isInteger(value)) return { ok: false, message: `Use a whole number for ${UNITS[unit]}.` };
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

/** Check the add or edit form. Returns the item to save (prices in paise) or the message for each wrong field. */
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
  if (!UNITS[v.unit]) errors.unit = 'Pick a unit.';
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
    const o = parseQty(v.opening, v.unit);
    if (!o.ok) errors.opening = o.message;
    else opening = o.value;
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, opening, item: { name, code, unit: v.unit, sale: sale.value, cost: cost.value, hsn, gst: Number(v.gst), low } };
}
