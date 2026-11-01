// The on-device copy of a real business's data, and the queue of changes waiting to reach the server (CR-0009, ADR-0013).
//
// Screens and actions keep changing the store as they always did. This module watches the store, turns every
// changed customer, job, document or chat message into a queued change with its own operation id, keeps the queue
// on the device, and sends it with one call when there is signal. The server applies each operation id once, so
// a lost answer or a retry never makes a duplicate. What comes back (numbers, other phones' work, proof-of-work
// steps) is written into the store marked as remote, so it is not sent back. The demo business never syncs.
import { ApiError, ApiUnreachable } from './api/client.js';
import { nowStamp } from './clock.js';
import { uid } from './ids.js';

const LEGACY_KINDS = [['customer', 'customers'], ['job', 'jobs'], ['document', 'documents'], ['message', 'messages']];
// Inventory (CR-0011): items, and stock moves that are never changed once made.
const KINDS = [...LEGACY_KINDS, ['item', 'items'], ['stock_move', 'stock_moves']];
const COLLECTION = Object.fromEntries(KINDS);
const MAX_OPS = 100;
const LOCAL_ONLY = new Set(['m-welcome']); // the greeting every device draws for itself
const RETRY_MS = [3000, 10000, 30000, 60000];
const deviceKey = 'karyahub.device.v1';
const syncKey = (businessId) => `karyahub.sync.v1.${businessId}`;

const clone = (x) => JSON.parse(JSON.stringify(x));
/** JSON with sorted keys, so two copies of the same item always read the same. */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
/** What counts as "this item changed": the server owns a job's state, history and code, and every number. */
function fingerprint(kind, e) {
  if (kind === 'job' || kind === 'document') {
    const rest = { ...e };
    for (const k of ['state', 'events', 'otp', 'number', 'parts_used']) delete rest[k];
    return canon(rest);
  }
  if (kind === 'item') { // the quantity in stock is the server's: it changes only through stock moves
    const rest = { ...e };
    delete rest.qty;
    return canon(rest);
  }
  return canon(e);
}
/** A chat step still running is the phone's own business; it is sent once it has finished. */
function syncable(kind, e) {
  if (kind === 'message') {
    if (LOCAL_ONLY.has(e.id)) return false;
    if (e.kind === 'process') return (e.steps || []).every((s) => ['done', 'failed', 'skipped'].includes(s.status));
  }
  return Boolean(e && e.id);
}

function read(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; }
}
function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: the queue stays in memory */ }
}
function deviceId(storage) {
  let id = read(storage, deviceKey);
  if (typeof id !== 'string' || !id) {
    id = `phone-${uid()}`;
    write(storage, deviceKey, id);
  }
  return id;
}

export function createSync({ store, api, win = globalThis, storage = globalThis.localStorage, debounceMs = 300, pollMs = 30000, retryMs = RETRY_MS, onChange = () => {} }) {
  let active = false;
  let biz = null;
  let s = null; // the saved state: device id, cursor, what may be read, queue, rejected changes
  let baseline = null; // kind -> Map(id -> fingerprint) of what the server is known to hold
  const sending = new Set();
  let state = 'idle';
  let errorText = '';
  let notice = null;
  let running = null;
  let again = false;
  let flushTimer = null;
  let retryTimer = null;
  let pollTimer = null;
  let attempt = 0;
  let unsub = null;
  let seen = null; // a full pass from the start: ids the server holds, to drop what it no longer has
  const listeners = [];

  const emit = () => onChange(status());
  const save = () => write(storage, syncKey(biz), s);
  const pendingFor = (kind, id) => s.outbox.some((o) => o.kind === kind && o.id === id);
  const status = () => ({
    active, state, pending: s ? s.outbox.length : 0, rejected: s ? s.rejected : [], notice, error: errorText,
  });

  function snapshot(st) {
    const base = {};
    for (const [kind, coll] of KINDS) {
      base[kind] = new Map((st[coll] || []).filter((e) => syncable(kind, e)).map((e) => [e.id, fingerprint(kind, e)]));
    }
    return base;
  }
  const hasRecords = (st) => KINDS.some(([, coll]) => (st[coll] || []).some((e) => !LOCAL_ONLY.has(e.id)));

  // ---------- what the screens changed ----------
  function enqueue(kind, e) {
    const body = clone(e);
    const queued = s.outbox.find((o) => o.kind === kind && o.id === e.id && !sending.has(o.op_id));
    if (queued) queued.body = body; // an edit to something not yet sent replaces the waiting change
    else s.outbox.push({ op_id: `op-${uid()}`, kind, id: e.id, body, at: nowStamp() });
  }
  function onStore(st, meta) {
    if (!active || (meta && meta.remote)) return;
    let changed = false;
    for (const [kind, coll] of KINDS) {
      for (const e of st[coll] || []) {
        if (!syncable(kind, e)) continue;
        const fp = fingerprint(kind, e);
        if (baseline[kind].get(e.id) === fp) continue;
        baseline[kind].set(e.id, fp);
        enqueue(kind, e);
        changed = true;
      }
    }
    if (changed) {
      save();
      emit();
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => run(), debounceMs);
    }
  }

  // ---------- what the server sent ----------
  function upsert(list, coll, item) {
    const at = list.findIndex((x) => x.id === item.id);
    if (at >= 0) list[at] = item;
    else if (coll === 'jobs' || coll === 'documents') list.unshift(item); // newest first, like the screens expect
    else list.push(item);
  }
  /** Write the server's answer into the store in one step, marked remote so it is not queued again. */
  function applyRemote({ changes = {}, readable = [], reverts = [], numbers = [], prune = false }) {
    store.update((st) => {
      for (const [kind, coll] of KINDS) {
        if (!st[coll]) st[coll] = [];
        if (!readable.includes(kind)) {
          st[coll] = st[coll].filter((e) => LOCAL_ONLY.has(e.id) || pendingFor(kind, e.id)); // access was taken away
          continue;
        }
        for (const item of changes[kind] || []) {
          if (seen) seen[kind].add(item.id);
          if (pendingFor(kind, item.id)) continue; // a newer change of ours is waiting; ours wins until it is sent
          upsert(st[coll], coll, item.body);
          baseline[kind].set(item.id, fingerprint(kind, item.body));
        }
        if (prune && seen) {
          // Drop what this phone believes the server holds but the server no longer has. Things the phone has not
          // sent yet (a chat step still running, a new item in the queue) are not on the server and stay.
          const drop = new Set(st[coll]
            .filter((e) => !LOCAL_ONLY.has(e.id) && baseline[kind].has(e.id) && !seen[kind].has(e.id) && !pendingFor(kind, e.id))
            .map((e) => e.id));
          st[coll] = st[coll].filter((e) => !drop.has(e.id));
          drop.forEach((id) => baseline[kind].delete(id));
        }
      }
      for (const { kind, id, record } of reverts) {
        const coll = COLLECTION[kind];
        if (pendingFor(kind, id)) continue;
        if (record) { upsert(st[coll], coll, record.body); baseline[kind].set(id, fingerprint(kind, record.body)); }
        else { st[coll] = st[coll].filter((e) => e.id !== id); baseline[kind].delete(id); }
      }
      for (const [kind, id, number] of numbers) {
        const e = (st[COLLECTION[kind]] || []).find((x) => x.id === id);
        if (e && !pendingFor(kind, id) && e.number !== number) e.number = number;
      }
    }, { remote: true });
  }

  function handle(res, batch, since) {
    const byOp = new Map(res.results.map((r) => [r.op_id, r]));
    const reverts = [];
    const numbers = [];
    for (const o of batch) {
      const r = byOp.get(o.op_id);
      if (!r) continue; // no answer for it: it stays queued and goes again
      s.outbox = s.outbox.filter((x) => x.op_id !== o.op_id);
      if (r.status === 'rejected') {
        s.rejected.push({ kind: o.kind, id: o.id, message: r.message || 'The server did not accept this change.' });
        reverts.push({ kind: o.kind, id: o.id, record: r.record });
      } else if (r.number) numbers.push([o.kind, o.id, r.number]);
    }
    const gained = s.readable.length > 0 && res.readable.some((k) => !s.readable.includes(k));
    if (since === 0) seen = Object.fromEntries(KINDS.map(([k]) => [k, new Set()]));
    applyRemote({ changes: res.changes, readable: res.readable, reverts, numbers, prune: !res.more && Boolean(seen) });
    if (!res.more) seen = null;
    s.readable = res.readable;
    s.cursor = gained ? 0 : res.cursor; // a kind became readable: start again from the beginning to fetch its history
    save();
    return gained;
  }

  // ---------- the one-time move of what this phone held before ----------
  function legacyPayload(st) {
    const out = { device_id: s.device_id };
    for (const [kind, coll] of LEGACY_KINDS) out[kind] = (st[coll] || []).filter((e) => !LOCAL_ONLY.has(e.id)).map(clone);
    return out;
  }
  async function moveOldData() {
    const payload = legacyPayload(store.get());
    const res = await api.importDevice(payload);
    if (!active || !s) return;
    // Edits queued meanwhile to things that were just moved are dropped (the moved copy replaces them); new things stay queued.
    s.outbox = s.outbox.filter((o) => !(payload[o.kind] || []).some((e) => e.id === o.id));
    s.imported = true;
    s.cursor = 0;
    s.readable = [];
    save();
    if (res.imported) {
      const c = res.counts || {};
      const total = (c.customer || 0) + (c.job || 0) + (c.document || 0) + (c.message || 0);
      notice = { text: `We moved ${total} ${total === 1 ? 'item' : 'items'} from this phone to your KaryaHub account. They are now saved on the server and shared with your team.` };
    }
    seen = Object.fromEntries(KINDS.map(([k]) => [k, new Set()]));
  }

  // ---------- one round of sending and fetching ----------
  async function cycle() {
    state = 'syncing';
    errorText = '';
    emit();
    try {
      if (!s.imported) await moveOldData();
      for (; active && s;) {
        const batch = s.outbox.filter((o) => !sending.has(o.op_id)).slice(0, MAX_OPS);
        const since = s.cursor;
        batch.forEach((o) => sending.add(o.op_id));
        let res;
        try {
          res = await api.sync(since, batch.map(({ op_id, kind, id, body }) => ({ op_id, kind, id, body })));
        } finally {
          batch.forEach((o) => sending.delete(o.op_id));
        }
        if (!active || !s) return; // signed out while the answer was on its way
        const gained = handle(res, batch, since);
        emit();
        const moreQueued = s.outbox.some((o) => !sending.has(o.op_id));
        if (!(res.more || gained || (moreQueued && batch.length))) break;
      }
      attempt = 0;
      state = 'idle';
    } catch (e) {
      if (!active) return;
      if (e instanceof ApiUnreachable) state = 'offline';
      else if (e instanceof ApiError && e.code === 'demo_local') { stop(); return; }
      else { state = 'error'; errorText = e.message; }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => run(), retryMs[Math.min(attempt, retryMs.length - 1)]);
      attempt += 1;
    }
    emit();
  }

  function run() {
    if (!active) return Promise.resolve();
    clearTimeout(flushTimer);
    if (running) { again = true; return running; }
    running = cycle().finally(() => {
      running = null;
      if (again && active) { again = false; run(); }
    });
    return running;
  }

  // ---------- starting and stopping ----------
  function start(business) {
    stop();
    biz = business.id;
    const st = store.get();
    const saved = read(storage, syncKey(biz));
    s = saved && typeof saved === 'object'
      ? { rejected: [], outbox: [], readable: [], cursor: 0, imported: true, ...saved, device_id: deviceId(storage) }
      : { device_id: deviceId(storage), cursor: 0, readable: [], imported: !hasRecords(st), outbox: [], rejected: [] };
    baseline = snapshot(st);
    active = true;
    state = 'idle';
    notice = null;
    attempt = 0;
    save();
    unsub = store.subscribe(onStore);
    const wake = () => { if (!win.document || win.document.visibilityState !== 'hidden') run(); };
    win.addEventListener?.('online', wake);
    win.document?.addEventListener?.('visibilitychange', wake);
    listeners.push(() => win.removeEventListener?.('online', wake), () => win.document?.removeEventListener?.('visibilitychange', wake));
    if (pollMs > 0) pollTimer = setInterval(wake, pollMs);
    emit();
    flushTimer = setTimeout(() => run(), 0);
  }
  function stop() {
    active = false;
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
    clearInterval(pollTimer);
    unsub?.();
    unsub = null;
    listeners.splice(0).forEach((off) => off());
    sending.clear();
    running = null;
    again = false;
    seen = null;
    state = 'idle';
    s = null;
    emit();
  }

  return {
    start,
    stop,
    status,
    flush: run,
    /** Send everything now, then say whether this one item has reached the server. */
    async flushFor(kind, id) {
      await run();
      return Boolean(active && s) && !pendingFor(kind, id);
    },
    dismissRejected() { if (s) { s.rejected = []; save(); } emit(); },
    dismissNotice() { notice = null; emit(); },
  };
}
