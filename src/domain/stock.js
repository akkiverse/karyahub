// What people can do with inventory (CR-0011): add and change items, stock in, stock out, count, and take parts for a job.
//
// For a real business a move is only written down here, unanswered; the server works out the quantity and the job's
// list of parts and sends them back (ADR-0015). For the demo business there is no server, so the same move is applied
// on the device at once. Either way a move is never edited: a mistake is fixed with a new move.
import { today, deviceNow, deviceToday } from '../clock.js';
import { can } from './access.js';
import { isSynced, uid } from '../ids.js';
import { W } from '../words.js';
import { itemChanges } from './inventory.js';
import { UNITS, parseQty, parseRupees, isoFromDmy, qtyText, stockOf, partsOnJob, validateItem, unitsOf, r3 } from './inventory.js';

export const DENIED = "Your access doesn't include this. Ask your business owner.";
export const JOB_CLOSED = "This job is closed, so its parts can't change.";
const SIGN = { opening: 1, in: 1, returned: 1, out: -1, used: -1 };

export function createStockActions({ store, currentUser = () => null }) {
  const denied = (perm) => { const u = currentUser(); return u && !can(u, perm) ? { error: DENIED } : null; };
  const stamp = (s) => (isSynced(s) ? deviceNow() : `${today()}T10:00:00`);
  const dateOf = (s) => (isSynced(s) ? deviceToday() : today());
  const who = () => (currentUser() ? currentUser().name : 'Owner');

  /** Add to the quantity the device holds for one unit of an item (the demo business only; a real business waits for the server). */
  function addTo(item, unit, qty) {
    if (unit === item.unit) { item.qty = r3((item.qty || 0) + qty); return item.qty; }
    const sold = item.sells.find((x) => x.unit === unit);
    sold.qty = r3((sold.qty || 0) + qty);
    return sold.qty;
  }

  /** Write one move down. For the demo business also apply it on the device, as the server would. */
  function pushMove(s, spec) {
    const item = s.items.find((i) => i.id === spec.item_id);
    const unit = spec.unit || item.unit;
    const shown = stockOf(s, item, unit);
    const cut = spec.kind === 'cut';
    const qty = cut ? r3(-spec.count) : spec.kind === 'count' ? r3(spec.counted - shown) : r3(SIGN[spec.kind] * spec.qty);
    const move = {
      id: `mv-${uid()}`, item_id: item.id, kind: spec.kind, qty, date: spec.date || dateOf(s), at: stamp(s), who: who(),
      note: spec.note || '', ...(spec.kind === 'count' ? { counted: spec.counted } : {}), ...(spec.job_id ? { job_id: spec.job_id } : {}),
      ...(spec.kind === 'in' ? { supplier: spec.supplier || '', bill: spec.bill || '', cost: spec.cost ?? null } : {}),
      ...(unit !== item.unit || cut ? { unit } : {}),
      ...(cut ? { to_unit: spec.to_unit, gave: spec.gives, count: spec.count, gives: spec.gives } : {}), // count and gives are what the server reads; gave is what it keeps
    };
    if (!isSynced(s)) {
      move.after = addTo(item, unit, qty);
      if (cut) move.to_after = addTo(item, spec.to_unit, spec.gives);
      if (spec.job_id) {
        const job = s.jobs.find((j) => j.id === spec.job_id);
        const parts = { ...(job.parts_used || {}) };
        const left = r3((parts[item.id] || 0) - qty);
        if (left > 0) parts[item.id] = left; else delete parts[item.id];
        job.parts_used = parts;
        const verb = spec.kind === 'returned' ? 'put back' : 'used';
        job.events = [...(job.events || []), {
          id: `ev-part-${move.id}`, action: spec.kind === 'returned' ? 'parts_returned' : 'parts_used', from_state: job.state, to_state: job.state,
          client_op_id: `part-${move.id}`, actor: who(), channel: 'web', detail: `${who()} ${verb} ${qtyText(spec.qty, item.unit)} ${item.name}`, received_at: move.at,
        }];
      }
    }
    s.stock_moves.push(move);
    return move;
  }

  // A line on the item's own history (CR-0016). The server writes its own when the change reaches it; this shows it at once.
  const itemLine = (s, found, what) => {
    const at = isSynced(s) ? `${new Date().toISOString().slice(0, 19)}Z` : stamp(s);
    found.history = [...(found.history || []), { at, who: who(), what }].slice(-30);
  };
  function saveItem(values, id = null) {
    const no = denied('manage_inventory');
    if (no) return no;
    const { errors, item, opening, openings = [], pending = [], newUnit = null } = validateItem(values, store.get(), id);
    if (Object.keys(errors).length) return { errors };
    let savedId = id;
    store.update((s) => {
      // A unit or a list entry typed on the form is made first, so the item can point to it (CR-0013).
      if (newUnit) {
        item.unit = `un-${uid()}`;
        s.units = [...(s.units || []), { id: item.unit, name: newUnit.name, whole: newUnit.whole, stopped: false }];
        for (const x of item.sells || []) if (x.cut_from === '__new__') x.cut_from = item.unit; // a cut from the unit being made now
      }
      for (const p of pending) {
        const entryId = `le-${uid()}`;
        s.list_entries = [...(s.list_entries || []), { id: entryId, field_id: p.field_id, name: p.name, stopped: false }];
        item.attrs[p.field_id] = entryId;
      }
      if (id) {
        const found = s.items.find((i) => i.id === id);
        // Each unit keeps the quantity the item holds for it; the server owns it (CR-0014).
        item.sells = (item.sells || []).map((x) => ({ ...x, qty: ((found.sells || []).find((o) => o.unit === x.unit) || {}).qty || 0 }));
        const said = itemChanges(found, item);
        Object.assign(found, item);
        itemLine(s, found, said ? `${W.itemChanged}: ${said}` : W.itemChanged);
        return;
      }
      savedId = `it-${uid()}`;
      s.items.push({ id: savedId, qty: 0, stopped: false, ...item, sells: (item.sells || []).map((x) => ({ ...x, qty: 0 })) });
      itemLine(s, s.items[s.items.length - 1], W.itemAdded);
      if (opening > 0) pushMove(s, { item_id: savedId, kind: 'opening', qty: opening });
      for (const o of openings) pushMove(s, { item_id: savedId, kind: 'opening', qty: o.qty, unit: o.unit });
    });
    return { id: savedId, opening, unit: store.get().items.find((i) => i.id === savedId).unit };
  }

  function setStopped(id, stopped) {
    const no = denied('manage_inventory');
    if (no) return no;
    if (!store.get().items.some((i) => i.id === id)) return { error: "That item isn't in your inventory." };
    store.update((s) => { const found = s.items.find((i) => i.id === id); found.stopped = Boolean(stopped); itemLine(s, found, stopped ? W.itemStopped : W.itemStarted); });
    return { ok: true };
  }

  /** Stock in, stock out or a count, from the item's sheet. `v` holds what was typed. */
  function move(itemId, type, v) {
    const no = denied('manage_inventory');
    if (no) return no;
    const s0 = store.get();
    const item = s0.items.find((i) => i.id === itemId);
    if (!item) return { error: "That item isn't in your inventory." };
    if (item.stopped) return { error: `${item.name} is not in use. Use it again first.` };
    const errors = {};
    const unit = v.unit && unitsOf(item).some((u) => u.unit === v.unit) ? v.unit : item.unit;
    const shown = stockOf(s0, item, unit);
    const q = parseQty(v.qty, unit);
    if (!q.ok) errors.qty = q.message;
    else if (type !== 'count' && q.value === 0) errors.qty = 'The quantity must be more than 0.';
    const spec = { item_id: itemId, kind: type, note: String(v.note || '').trim(), ...(unit !== item.unit ? { unit } : {}) };
    if (type === 'in') {
      const iso = isoFromDmy(v.date || '');
      if (!iso) errors.date = 'Use a real date as dd-mm-yyyy, for example 01-11-2026.';
      else if (iso > dateOf(s0)) errors.date = "The date can't be in the future.";
      else spec.date = iso;
      const c = parseRupees(v.cost);
      if (!c.ok) errors.cost = c.message; else spec.cost = c.value;
      spec.supplier = String(v.supplier || '').trim();
      spec.bill = String(v.bill || '').trim();
    }
    if (type === 'out') {
      if (!['supplier', 'lost', 'other'].includes(v.reason)) errors.reason = 'Pick a reason.';
      if (v.reason === 'other' && !spec.note) errors.note = 'Say what it was used for.';
      if (q.ok && !errors.qty && q.value > shown) errors.qty = `Only ${qtyText(Math.max(shown, 0), unit)} in stock. If that's wrong, count the stock first.`;
      const label = { supplier: 'Returned to supplier', lost: 'Damaged or lost', other: 'Used without a job' }[v.reason];
      spec.note = [label, spec.note].filter(Boolean).join(': ');
    }
    if (Object.keys(errors).length) return { errors };
    if (type === 'count') {
      spec.counted = q.value;
      if (r3(q.value - shown) === 0) return { same: true };
      if (!spec.note) spec.note = `Counted ${qtyText(q.value, unit)} on the shelf`;
    } else spec.qty = q.value;
    let made;
    store.update((s) => { made = pushMove(s, spec); });
    return { move: made, item, unit, shown: stockOf(store.get(), item, unit) };
  }

  /** Cut some of one unit into another: a coil into loose metres (CR-0014). */
  function cut(itemId, v) {
    const no = denied('manage_inventory');
    if (no) return no;
    const s0 = store.get();
    const item = s0.items.find((i) => i.id === itemId);
    if (!item) return { error: "That item isn't in your inventory." };
    if (item.stopped) return { error: `${item.name} is not in use. Use it again first.` };
    const units = unitsOf(item);
    const errors = {};
    const from = units.find((u) => u.unit === v.from);
    const to = units.find((u) => u.unit === v.to);
    if (!from) errors.from = 'Pick the unit you are cutting.';
    if (!to || to.unit === v.from) errors.to = 'Pick the unit it makes.';
    const count = from ? parseQty(v.count, from.unit) : { ok: false, message: 'Pick the unit first.' };
    if (!count.ok) errors.count = count.message;
    else if (count.value === 0) errors.count = 'Cut at least 1.';
    else if (from && count.value > stockOf(s0, item, from.unit)) errors.count = `Only ${qtyText(Math.max(stockOf(s0, item, from.unit), 0), from.unit)} in stock. If that's wrong, count the stock first.`;
    const gives = to ? parseQty(v.gives, to.unit) : { ok: false, message: 'Pick the unit it makes first.' };
    if (!gives.ok) errors.gives = gives.message;
    else if (gives.value === 0) errors.gives = 'A cut must give more than 0.';
    if (Object.keys(errors).length) return { errors };
    let made;
    store.update((s) => { made = pushMove(s, { item_id: itemId, kind: 'cut', unit: from.unit, to_unit: to.unit, count: count.value, gives: gives.value, note: String(v.note || '').trim() }); });
    return { move: made, item, from: from.unit, to: to.unit, count: count.value, gives: gives.value };
  }

  function takePart(jobId, itemId, qty, fromNote = null) {
    const no = denied('use_parts');
    if (no) return no;
    const s0 = store.get();
    const job = s0.jobs.find((j) => j.id === jobId);
    const item = s0.items.find((i) => i.id === itemId);
    if (!job) return { error: 'That job no longer exists. Pick another job.' };
    if (!item) return { error: "That item isn't in your inventory." };
    if (['CLOSED', 'CANCELLED'].includes(job.state)) return { error: JOB_CLOSED };
    if (item.stopped) return { error: `${item.name} is not in use. Use it again first.` };
    const q = parseQty(qty, item.unit);
    if (!q.ok) return { errors: { qty: q.message } };
    if (q.value === 0) return { errors: { qty: 'The quantity must be more than 0.' } };
    const before = stockOf(s0, item);
    store.update((s) => { pushMove(s, { item_id: itemId, kind: 'used', qty: q.value, job_id: jobId, note: fromNote ? `From the note: ${fromNote}` : '' }); });
    return { item, qty: q.value, short: q.value > before, had: Math.max(before, 0) };
  }

  function removePart(jobId, itemId) {
    const no = denied('use_parts');
    if (no) return no;
    const s0 = store.get();
    const job = s0.jobs.find((j) => j.id === jobId);
    const item = s0.items.find((i) => i.id === itemId);
    if (!job || !item) return { error: "That part isn't on this job." };
    if (['CLOSED', 'CANCELLED'].includes(job.state)) return { error: JOB_CLOSED };
    const on = partsOnJob(s0, job).find((p) => p.id === itemId);
    if (!on) return { error: "That part isn't on this job." };
    store.update((s) => { pushMove(s, { item_id: itemId, kind: 'returned', qty: on.qty, job_id: jobId }); });
    return { item, qty: on.qty };
  }

  return { saveItem, setStopped, move, cut, takePart, removePart, UNITS };
}
