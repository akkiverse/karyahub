// History (CR-0016): who did what. A real business reads it from the server's log; the demo has no server
// log of its work, so it is put together from what the device holds. The words match the server's.
import { MOVE_LABELS, fmtQty, UNITS } from './inventory.js';
import { docWord } from './bills.js';

export const HISTORY_GROUPS = ['stock', 'bills', 'jobs', 'team', 'settings'];
const ms = (at) => { const t = String(at || ''); return Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(t) ? t : `${t}Z`) || 0; };
export const byTimeNewestFirst = (a, b) => ms(b.at) - ms(a.at);

/** Everything the demo business's device knows, newest first, in the shape of the server's answer. */
export function historyOnDevice(state) {
  const out = [];
  const items = state.items || [];
  for (const m of state.stock_moves || []) {
    const it = items.find((x) => x.id === m.item_id);
    out.push({ who: m.who || 'Owner', at: m.at, group: 'stock', text: `${MOVE_LABELS[m.kind] || m.kind}: ${fmtQty(Math.abs(Number(m.qty) || 0))} ${UNITS[m.unit || (it && it.unit)] || ''} ${it ? it.name : ''}`.replace(/\s+/g, ' ').trim() });
  }
  for (const it of items) for (const h of it.history || []) out.push({ who: h.who, at: h.at, group: 'stock', text: `${it.name}: ${h.what}` });
  for (const d of state.documents || []) {
    if (d.deleted) continue;
    for (const h of d.history || []) out.push({ who: h.who, at: h.at, group: 'bills', text: `${docWord(d)} ${d.number || ''}: ${h.what}`.replace(/\s+:/, ':') });
  }
  for (const j of state.jobs || []) for (const ev of j.events || []) out.push({ who: ev.actor || 'Owner', at: ev.received_at, group: 'jobs', text: `Job ${j.number || j.id}: ${ev.detail || ev.action}` });
  return out.sort(byTimeNewestFirst).map((x, i) => ({ id: i + 1, ...x }));
}

export function filterHistory(entries, { group = '', who = '', q = '' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((x) => (!group || x.group === group) && (!who || x.who === who) && words.every((w) => `${x.who} ${x.text}`.toLowerCase().includes(w)));
}
