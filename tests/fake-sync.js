// A stand-in for the server's business-data calls in UI tests (the real rules are tested with pytest in tests/api/).
// It keeps records, applies each operation id once, gives numbers, and can lose its network, drop an answer, or refuse.
import { ApiError, ApiUnreachable } from '../src/api/client.js';

const KINDS = ['customer', 'job', 'document', 'message', 'item', 'stock_move'];
const SIGNED = { opening: 1, in: 1, returned: 1, out: -1, used: -1 };
const clone = (x) => JSON.parse(JSON.stringify(x));
const pad = (n, w = 4) => String(n).padStart(w, '0');

export function fakeSync({ deny = [], readable = KINDS, business = 'b-shree' } = {}) {
  const server = { records: new Map(), applied: new Map(), counters: { seq: 0, job: 0, quote: 0, invoice: 0 }, imports: new Map(), logo: '' };
  const network = { offline: false, loseNext: 0, failNext: 0, deny: [...deny], readable: [...readable] };
  const calls = { sync: [], import: [] };
  const key = (kind, id) => `${kind}:${id}`;
  const pub = (r) => ({ kind: r.kind, id: r.id, number: r.number, seq: r.seq, body: { ...clone(r.body), id: r.id, ...(r.kind === 'job' || r.kind === 'document' ? { number: r.number } : {}) } });

  function put(kind, id, body, { number, keepState = false } = {}) {
    const existing = server.records.get(key(kind, id));
    server.counters.seq += 1;
    if (existing) {
      const merged = clone(body);
      if (kind === 'job') for (const f of ['state', 'events', 'otp', 'parts_used']) if (f in existing.body) merged[f] = existing.body[f];
      if (kind === 'item') merged.qty = existing.body.qty || 0; // the quantity is the server's
      existing.body = merged;
      existing.seq = server.counters.seq;
      return existing;
    }
    let num = number || '';
    if (!num && kind === 'job') num = `J-${pad((server.counters.job += 1))}`;
    if (!num && kind === 'document') num = `${body.type === 'invoice' ? 'INV' : 'QT'}-2027-${pad((server.counters[body.type] += 1))}`;
    const rec = { kind, id, number: num, body: clone(body), seq: server.counters.seq };
    if (kind === 'job') { rec.body.otp = null; rec.body.parts_used = {}; if (!keepState) rec.body.state = 'WORK_DONE'; }
    if (kind === 'item') rec.body.qty = 0;
    server.records.set(key(kind, id), rec);
    return rec;
  }
  /** The server's rules for a stock move, in short (the real ones are tested with pytest). Returns a message when refused. */
  function applyMove(id, b) {
    if (server.records.has(key('stock_move', id))) return "Stock moves can't be changed. Add a correction instead.";
    const item = server.records.get(key('item', b.item_id));
    if (!item) return "That item isn't in your inventory.";
    const have = item.body.qty || 0;
    const qty = b.kind === 'count' ? Math.round((b.counted - have) * 1000) / 1000 : SIGNED[b.kind] * Math.abs(b.qty);
    if (b.kind === 'out' && have + qty < 0) return `Only ${have} ${item.body.unit} in stock. If that's wrong, count the stock first.`;
    let job = null;
    if (b.job_id) {
      job = server.records.get(key('job', b.job_id));
      if (!job) return "That job isn't on the server yet. Try again with signal.";
      if (['CLOSED', 'CANCELLED'].includes(job.body.state)) return "This job is closed, so its parts can't change.";
    }
    item.body.qty = Math.round((have + qty) * 1000) / 1000;
    item.seq = ++server.counters.seq;
    if (job) {
      const parts = { ...(job.body.parts_used || {}) };
      parts[b.item_id] = Math.round(((parts[b.item_id] || 0) - qty) * 1000) / 1000;
      if (parts[b.item_id] <= 0) delete parts[b.item_id];
      job.body = { ...job.body, parts_used: parts, events: [...(job.body.events || []), { id: `ev-part-${id}`, action: 'parts_used', client_op_id: `part-${id}`, detail: `${b.who || 'Someone'} ${b.kind === 'returned' ? 'put back' : 'used'} ${Math.abs(qty)} ${item.body.unit} ${item.body.name}` }] };
      job.seq = ++server.counters.seq;
    }
    server.counters.seq += 1;
    server.records.set(key('stock_move', id), { kind: 'stock_move', id, number: '', seq: server.counters.seq, body: { ...clone(b), id, qty, after: item.body.qty } });
    return null;
  }
  const changesSince = (since) => {
    const out = Object.fromEntries(KINDS.map((k) => [k, []]));
    for (const r of [...server.records.values()].sort((a, b) => a.seq - b.seq)) {
      if (r.seq > since && network.readable.includes(r.kind)) out[r.kind].push(pub(r));
    }
    return out;
  };

  return {
    server,
    network,
    syncCalls: calls.sync,
    importCalls: calls.import,
    sync: async (since, ops) => {
      calls.sync.push({ since, ops: clone(ops) });
      if (network.offline) throw new ApiUnreachable();
      if (network.failNext > 0) { network.failNext -= 1; throw new ApiError('Something went wrong on our side. Try again.', { code: 'internal_error', status: 500 }); }
      const results = ops.map((o) => {
        const done = server.applied.get(o.op_id);
        if (done) return { ...done, status: 'duplicate' };
        let result;
        if (network.deny.includes(o.kind)) {
          const cur = server.records.get(key(o.kind, o.id));
          result = { op_id: o.op_id, kind: o.kind, id: o.id, status: 'rejected', message: "Your access doesn't include this. Ask your business owner.", ...(cur ? { record: pub(cur) } : {}) };
        } else if (o.kind === 'stock_move' && applyMove(o.id, o.body)) {
          result = { op_id: o.op_id, kind: o.kind, id: o.id, status: 'rejected', message: applyMove(o.id, o.body) };
        } else {
          const rec = o.kind === 'stock_move' ? { number: '' } : put(o.kind, o.id, o.body);
          result = { op_id: o.op_id, kind: o.kind, id: o.id, status: 'applied', number: rec.number };
        }
        server.applied.set(o.op_id, { op_id: o.op_id, kind: o.kind, id: o.id, status: 'applied', number: result.number });
        return result;
      });
      const answer = { cursor: server.counters.seq, more: false, readable: [...network.readable], results, changes: changesSince(since) };
      if (network.loseNext > 0) { network.loseNext -= 1; throw new ApiUnreachable(); } // applied, but the answer never arrived
      return answer;
    },
    importDevice: async (payload) => {
      calls.import.push(clone(payload));
      if (network.offline) throw new ApiUnreachable();
      const prior = server.imports.get(payload.device_id);
      if (prior) return { imported: false, already: true, counts: prior };
      const tag = payload.device_id.replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
      const counts = { customer: 0, job: 0, document: 0, message: 0, merged_customers: 0, skipped: 0 };
      const cmap = {};
      const jmap = {};
      for (const c of payload.customer) { put('customer', `imp-${tag}-${c.id}`, c); cmap[c.id] = `imp-${tag}-${c.id}`; counts.customer += 1; }
      for (const j of payload.job) {
        const id = `imp-${tag}-${j.id}`;
        put('job', id, { ...j, customer_id: cmap[j.customer_id] || j.customer_id }, { number: j.id, keepState: true });
        jmap[j.id] = id; counts.job += 1;
        server.counters.job = Math.max(server.counters.job, Number(String(j.id).replace(/\D/g, '')) || 0);
      }
      for (const d of payload.document) { put('document', `imp-${tag}-${d.id}`, { ...d, job_id: jmap[d.job_id] || d.job_id }, { number: d.id }); counts.document += 1; }
      for (const m of payload.message) { if (m.id === 'm-welcome') continue; put('message', `imp-${tag}-${m.id}`, { ...m, ...(m.job_id ? { job_id: jmap[m.job_id] || m.job_id } : {}) }); counts.message += 1; }
      server.imports.set(payload.device_id, counts);
      return { imported: true, already: false, counts };
    },
    /** A short stand-in for the CSV import: name is needed, unit must be known; a code or name that exists is an update. */
    inventoryImport: async ({ text, name, check }) => {
      calls.csv = [...(calls.csv || []), { name, check }];
      if (network.offline) throw new ApiUnreachable();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
      if (!head.includes('name')) throw new ApiError('This file has no "name" column. Use the template: its first row names the columns.', { code: 'csv_refused', status: 422 });
      const items = [...server.records.values()].filter((r) => r.kind === 'item');
      const rows = lines.slice(1).map((line, i) => {
        const cells = line.split(',');
        const r = Object.fromEntries(head.map((h, k) => [h, (cells[k] || '').trim()]));
        const problems = [];
        if (!r.name) problems.push('name is empty');
        if (!['nos', 'kg', 'metre', 'litre', 'set', 'roll'].includes(r.unit)) problems.push(`unit "${r.unit}" isn't one of nos, kg, metre, litre, set, roll`);
        const hit = r.code ? items.find((x) => (x.body.code || '').toLowerCase() === r.code.toLowerCase()) : items.find((x) => x.body.name.toLowerCase() === r.name.toLowerCase());
        return { row: i + 2, status: problems.length ? 'problem' : hit ? 'update' : 'new', problems, notes: [], code: r.code, name: r.name, unit: r.unit, sale_price: r.sale_price, opening_stock: r.opening_stock, _r: r, _hit: hit };
      });
      const counts = { new: 0, update: 0, same: 0, problem: 0 };
      rows.forEach((r) => { counts[r.status] += 1; });
      const out = rows.map(({ _r, _hit, ...rest }) => rest);
      if (check) return { checked: true, file: name, rows: out, counts };
      for (const r of rows.filter((x) => x.status === 'new')) {
        const id = `it-csv-${r.row}`;
        put('item', id, { id, name: r._r.name, code: r._r.code, unit: r._r.unit, sale: Math.round(Number(r._r.sale_price || 0) * 100), cost: null, hsn: '', gst: 18, low: null, stopped: false });
      }
      return { checked: false, file: name, rows: out, counts, imported: { added: counts.new, updated: counts.update, skipped: counts.problem } };
    },
    saveLogo: async (dataUrl) => {
      if (network.offline) throw new ApiUnreachable();
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new ApiError('Use a PNG, JPEG or WebP picture of up to 200 KB for the logo.', { code: 'validation_error', status: 422 });
      server.logo = dataUrl;
      return { id: business, name: 'Shree Cool AC', address: 'Nashik', gstin: '', is_demo: false, active: true, logo_version: 'abc123def456' };
    },
    removeLogo: async () => {
      server.logo = '';
      return { id: business, name: 'Shree Cool AC', address: 'Nashik', gstin: '', is_demo: false, active: true, logo_version: '' };
    },
  };
}
