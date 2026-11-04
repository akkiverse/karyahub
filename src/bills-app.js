// What the bill screens do (CR-0012): app.js hands every "bill-…" action, the editor's typing and the bill
// forms to this controller. Real businesses save through the sync queue (a number comes from the server,
// AC-28.1, AC-28.3); the demo numbers bills on the device and never syncs (AC-30.6).
import { W } from './words.js';
import { today as demoToday, deviceToday } from './clock.js';
import { uid } from './ids.js';
import { norm, partsOnJob, words } from './domain/inventory.js';
import {
  addDays, demoSave, isBill, isV2, lastPrice, lineFromItem, lineInUnit, lookOf, messageText, newDraft, saveProblem, waLink,
} from './domain/bills.js';
import { stateOfGstin } from './domain/tax.js';
import { billRows, customerRows, itemRows, totalsBar, billPaper } from './views/bills.js';
import { billList } from './domain/bills.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const UNDO_MS = 10000;
const PHONE_LINE_KEYS = ['item_id', 'description', 'hsn', 'qty', 'unit', 'rate', 'price_includes_gst', 'discount', 'gst_rate', 'from_job_parts'];
/** "1250.50" → 125050 paise; anything else stays as typed, so the engine names the line. */
export function paiseOf(text) {
  const t = String(text ?? '').trim().replace(/,/g, '');
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : t;
}
const phoneLines = (lines) => lines.map((l) => Object.fromEntries(PHONE_LINE_KEYS.filter((k) => k in l).map((k) => [k, clone(l[k])])));

export function createBills({ store, api, session, sync, ui, render, navigate, root, win, meOf, msg }) {
  const me = () => meOf();
  const business = () => (me() && me().business) || null;
  const demo = () => Boolean(store.get().settings.is_demo);
  // A real business bills on the phone's real date; the demo keeps its fixed date (the renewals story).
  const today = () => (demo() ? demoToday() : deviceToday());
  const docOf = (id) => store.get().documents.find((d) => d.id === id);
  const timers = [];
  ui.bills = ui.bills || {};
  ui.billView = ui.billView || {};

  // ---------- the editor's working copy ----------
  function edit(id) {
    const d = docOf(id);
    if (!d) return;
    if (!ui.billEd || !ui.billEd.doc || ui.billEd.doc.id !== id) ui.billEd = { doc: clone(d), itemQ: '', custQ: '', picking: false, more: false };
  }
  /** Keep the working copy in the store (and so in the sync queue), keeping focus where the person is. */
  function persist({ redraw = true } = {}) {
    const ed = ui.billEd;
    if (!ed || !ed.doc) return;
    const active = root.ownerDocument.activeElement;
    const k = active && active.dataset ? active.dataset.k : null;
    const at = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const copy = clone(ed.doc);
    store.update((s) => {
      const i = s.documents.findIndex((d) => d.id === copy.id);
      if (i >= 0) s.documents[i] = copy;
      else s.documents.unshift(copy);
    });
    if (!redraw) return;
    if (k) {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (at !== null && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(at, at); } catch { /* not a text field */ } }
      }
    }
  }
  function paintTotals() {
    const ed = ui.billEd;
    const bar = root.querySelector('[data-slot="totals-bar"]');
    if (!ed || !bar) return;
    bar.outerHTML = totalsBar(ed.doc, { ...me(), busySave: ed.saving }, business());
  }

  function openNew(type, extra = {}) {
    const look = lookOf(business());
    const d = newDraft({ type, today: today(), look, ...extra });
    store.update((s) => { s.documents.unshift(d); });
    ui.billEd = { doc: clone(d), itemQ: '', custQ: '', picking: false, more: false };
    navigate(`#/bills/${encodeURIComponent(d.id)}/edit`);
    return d;
  }

  /** AC-29.4: a job's lines, then the parts it used (from stock already, so they take no more). */
  function fromJob(jobId, type) {
    const s = store.get();
    const job = s.jobs.find((j) => j.id === jobId);
    if (!job) return { error: 'That job no longer exists. Pick another job.' };
    const lines = (job.lines || []).map((l) => ({ description: l.description, qty: l.qty || 1, unit: 'nos', rate: Math.round(Number(l.rate || 0) * 100), gst_rate: '18', discount: null, from_job_parts: false }));
    for (const p of partsOnJob(s, job)) {
      if (!p.item) continue;
      const hay = `${norm(p.item.name)} ${norm(p.item.code)}`; // the same test as partLines (AC-25.13)
      if ((job.lines || []).some((l) => { const w = words(l.description); return w.length > 1 && w.every((x) => hay.includes(x)); })) continue; // AC-25.13
      lines.push({ ...lineFromItem(p.item, null, store.get()), qty: p.qty, from_job_parts: true, last_price: false });
    }
    const customer = { id: job.customer_id || '', name: job.customer_name || W.walkIn, phone: job.phone || '', address: job.area || '', gstin: '', state_code: '' };
    return { doc: openNew(type, { customer, lines, jobId }) };
  }

  // ---------- saving (AC-28.1, AC-28.3, AC-30.6) ----------
  async function save() {
    const ed = ui.billEd;
    if (!ed || !ed.doc || ed.saving) return;
    const problem = saveProblem(ed.doc, business());
    if (problem) { ed.error = problem; render(); root.querySelector('[data-testid="editor-error"]')?.focus?.(); return; }
    ed.error = '';
    const id = ed.doc.id;
    rememberCustomer(ed.doc);
    if (demo()) {
      let number = '';
      let fail = '';
      store.update((s) => {
        const d = s.documents.find((x) => x.id === id);
        Object.assign(d, clone(ed.doc));
        const res = demoSave(s, d, business());
        if (res.problem) { fail = res.problem; return; }
        number = d.number;
        d.history = [...(d.history || []), { at: `${today()}T10:00:00`, who: me().name, what: `Saved as ${number}` }];
        if (d.estimate_id) {
          const est = s.documents.find((x) => x.id === d.estimate_id);
          if (est) Object.assign(est, { bill_id: d.id, bill_number: number });
        }
      });
      if (fail) { ed.error = fail; render(); return; }
      ui.billEd = null;
      ui.billView = { notice: { text: `${W.tickSaved} ${number}` } };
      navigate(`#/bills/${encodeURIComponent(id)}`);
      return;
    }
    ed.doc.save = true;
    ed.saving = true;
    persist();
    render();
    const reached = await sync.flushFor('document', id);
    const d = docOf(id) || ed.doc;
    ed.saving = false;
    if (d.number) {
      ui.billEd = null;
      ui.billView = { notice: { text: `${W.tickSaved} ${d.number}` } };
      navigate(`#/bills/${encodeURIComponent(id)}`);
    } else if (reached && d.save_problem) {
      ui.billEd = { ...ed, doc: clone(d), error: '' };
      render();
    } else {
      ui.billEd = null;
      ui.billView = {};
      navigate(`#/bills/${encodeURIComponent(id)}`);
    }
  }
  function rememberCustomer(doc) {
    const c = doc.customer || {};
    if (!c.id) return;
    store.update((s) => {
      const rec = (s.customers || []).find((x) => x.id === c.id);
      if (!rec) return;
      for (const key of ['gstin', 'address', 'state_code']) if (c[key] && !rec[key]) rec[key] = c[key];
    });
  }

  // ---------- steps on a saved bill ----------
  function local(id, fn, what) {
    store.update((s) => {
      const d = s.documents.find((x) => x.id === id);
      fn(d, s);
      d.history = [...(d.history || []), { at: `${today()}T10:00:00`, who: me().name, what }];
    });
  }
  async function step(id, action, extra = {}) {
    if (demo()) return true;
    try {
      const rec = await api.documentAction(id, action, extra);
      sync.accept('document', rec);
      return true;
    } catch (err) {
      ui.billView = { notice: { text: msg(err), error: true } };
      render();
      return false;
    }
  }
  const linkOf = (d) => `${win.location.origin}/b/${d.link_token}`;

  async function send(id) {
    const d = docOf(id);
    if (demo()) {
      const text = messageText(d, store.get().settings.business_name, '(sample: links work for real businesses)');
      win.open?.(waLink(d.customer.phone, text), '_blank', 'noopener');
      local(id, (x) => { if (x.status === 'saved') x.status = 'sent'; x.sent_how = 'whatsapp'; }, 'Opened WhatsApp with the message');
      ui.billView = { notice: { text: W.whatsappOpened } };
      render();
      return;
    }
    // Open the window first, while the press still counts as the person's own, then point it at WhatsApp.
    const tab = win.open ? win.open('', '_blank') : null;
    try {
      const res = await api.sendDocument(id);
      sync.accept('document', res.record);
      if (res.how === 'link') { if (tab) tab.location.href = res.url; else win.location.href = res.url; }
      else tab?.close?.();
      ui.billView = { notice: { text: res.how === 'link' ? W.whatsappOpened : `${W.sent}.` } };
    } catch (err) {
      tab?.close?.();
      ui.billView = { notice: { text: msg(err), error: true } };
    }
    render();
  }
  async function copyLink(id) {
    const d = docOf(id);
    if (demo() || !d.link_token) { ui.billView = { notice: { text: `${W.sampleLinks}.` } }; render(); return; }
    try { await win.navigator.clipboard.writeText(linkOf(d)); } catch { /* the link still shows below */ }
    if (await step(id, 'mark_sent', { how: 'copy' })) ui.billView = { notice: { text: `${W.linkCopied} ${linkOf(d)}` } };
    render();
  }
  async function share(id) {
    const d = docOf(id);
    if (demo() || !d.link_token) { ui.billView = { notice: { text: `${W.sampleLinks}.` } }; render(); return; }
    try {
      await win.navigator.share({ title: `${isBill(d) ? W.bill : W.estimate} ${d.number}`, text: messageText(d, store.get().settings.business_name, ''), url: linkOf(d) });
    } catch { return; } // the person closed the share sheet
    if (await step(id, 'mark_sent', { how: 'share' })) ui.billView = {};
    render();
  }
  function copyOf(id) {
    const d = docOf(id);
    const fresh = openNew(d.type, { customer: clone(d.customer), lines: phoneLines(d.lines), from: d });
    ui.billView = {};
    return fresh;
  }
  async function makeBill(id) {
    const est = docOf(id);
    if (est.bill_id) {
      ui.billView = { notice: { text: `${W.alreadyBilled} ${est.bill_number}.`, open: `#/bills/${encodeURIComponent(est.bill_id)}` } };
      render();
      return;
    }
    if (demo()) { openNew('invoice', { customer: clone(est.customer), lines: phoneLines(est.lines), estimateId: est.id, jobId: est.job_id || '', from: est }); return; }
    const billId = `doc-${uid()}`;
    try {
      const rec = await api.makeBill(id, billId);
      sync.accept('document', rec);
      ui.billEd = { doc: clone(rec.body), itemQ: '', custQ: '', picking: false, more: false };
      navigate(`#/bills/${encodeURIComponent(billId)}/edit`);
    } catch (err) {
      ui.billView = { notice: { text: msg(err), error: true } };
      render();
    }
  }
  async function cancel(id, reason) {
    const ok = demo()
      ? (local(id, (x) => { x.before_cancel = x.status; x.status = 'cancelled'; x.cancel_reason = reason; }, `Cancelled${reason ? `: ${reason}` : ''}`), true)
      : await step(id, 'cancel', { reason });
    if (!ok) return;
    ui.billView = { notice: { text: W.cancelled10s, undo: 'bill-undo-cancel' } };
    timers.push(setTimeout(() => { if (ui.billView.notice && ui.billView.notice.undo === 'bill-undo-cancel') { ui.billView = {}; render(); } }, UNDO_MS));
    render();
  }
  async function undoCancel(id) {
    const ok = demo()
      ? (local(id, (x) => { x.status = x.before_cancel || 'saved'; delete x.cancel_reason; }, 'Cancel undone'), true)
      : await step(id, 'undo_cancel');
    if (ok) { ui.billView = {}; render(); }
  }
  function deleteDraft(id) {
    store.update((s) => {
      const d = s.documents.find((x) => x.id === id);
      if (d && d.status === 'draft') d.deleted = true;
    });
    ui.billEd = null;
    ui.bills = { ...ui.bills, notice: { text: W.deleted, undo: id } };
    timers.push(setTimeout(() => { if (ui.bills.notice && ui.bills.notice.undo === id) { ui.bills.notice = null; render(); } }, UNDO_MS));
    navigate(isBill(docOf(id)) ? '#/bills' : '#/estimates');
  }

  // ---------- clicks ----------
  async function onClick(a, el) {
    const ed = ui.billEd;
    const id = el.dataset.doc;
    switch (a) {
      case 'bill-new-menu': ui.newOpen = !ui.newOpen; render(); return true;
      case 'bill-chip': ui.bills = { ...ui.bills, chip: el.dataset.chip }; render(); return true;
      case 'bill-pick-customer': ed.picking = true; ed.custQ = ''; render(); root.querySelector('[data-cust-search]')?.focus(); return true;
      case 'bill-walk-in': ed.picking = false; ed.doc.customer = { id: '', name: W.walkIn, phone: '', address: '', gstin: '', state_code: '' }; persist(); return true;
      case 'bill-set-customer': {
        const c = store.get().customers.find((x) => x.id === el.dataset.customer);
        const gstin = c.gstin || '';
        const stateCode = c.state_code || stateOfGstin(gstin) || '';
        ed.doc.customer = { id: c.id, name: c.name, phone: c.phone || '', address: c.address || c.area || '', gstin, state_code: stateCode };
        if (stateCode) ed.doc.place_of_supply = stateCode;
        ed.doc.lines = ed.doc.lines.map((l) => { const p = lastPrice(store.get().documents, ed.doc.customer, l.item_id); return p === null ? l : { ...l, rate: p, last_price: true }; });
        ed.picking = false;
        persist();
        return true;
      }
      case 'bill-new-customer': {
        const name = (ed.custQ || '').trim();
        const digits = name.replace(/\D/g, '');
        const c = { id: `c-${uid()}`, name: digits.length >= 10 ? 'Customer' : name, phone: digits.length >= 10 ? digits.slice(-10) : '', area: '' };
        store.update((s) => { s.customers.push(c); });
        ed.doc.customer = { id: c.id, name: c.name, phone: c.phone, address: '', gstin: '', state_code: '' };
        ed.picking = false;
        persist();
        return true;
      }
      case 'bill-add-item': {
        const it = store.get().items.find((x) => x.id === el.dataset.item);
        ed.doc.lines.push(lineFromItem(it, lastPrice(store.get().documents, ed.doc.customer, it.id), store.get()));
        ed.itemQ = '';
        persist();
        root.querySelector(`[data-k="q${ed.doc.lines.length - 1}"]`)?.focus();
        return true;
      }
      case 'bill-add-typed': {
        ed.doc.lines.push({ item_id: '', description: (ed.itemQ || '').trim(), hsn: '', qty: 1, unit: 'nos', rate: '', gst_rate: '18', price_includes_gst: false, discount: null, from_job_parts: false });
        ed.itemQ = '';
        persist();
        root.querySelector(`[data-k="r${ed.doc.lines.length - 1}"]`)?.focus();
        return true;
      }
      case 'bill-remove-line': ed.doc.lines.splice(Number(el.dataset.index), 1); persist(); return true;
      case 'bill-more': ed.more = !ed.more; return false; // <details> opens itself
      case 'bill-save': await save(); return true;
      case 'bill-delete-draft': deleteDraft(ed.doc.id); return true;
      case 'bill-undo-delete': {
        const did = ui.bills.notice && ui.bills.notice.undo;
        store.update((s) => { const d = s.documents.find((x) => x.id === did); if (d) delete d.deleted; });
        ui.bills = { ...ui.bills, notice: null };
        render();
        return true;
      }
      case 'bill-send':
        await send(id);
        if (el.matches('.row-act')) {
          // Sent from a row of the list (CR-0015): the answer shows on the list, for as long as an undo would.
          const notice = ui.billView.notice;
          ui.billView = {};
          ui.bills = { ...ui.bills, notice };
          timers.push(setTimeout(() => { if (ui.bills.notice === notice) { ui.bills = { ...ui.bills, notice: null }; render(); } }, UNDO_MS));
          render();
        }
        return true;
      case 'bill-copy-link': await copyLink(id); return true;
      case 'bill-share': await share(id); return true;
      case 'bill-mark-sent':
        if (demo()) local(id, (x) => { if (x.status === 'saved') x.status = 'sent'; x.sent_how = 'paper'; }, 'Marked as sent');
        else await step(id, 'mark_sent', { how: 'paper' });
        render();
        return true;
      case 'bill-mark-paid':
        if (demo()) local(id, (x) => { x.status = 'paid'; x.paid_at = today(); }, `Marked paid on ${today()}`);
        else await step(id, 'mark_paid', { paid_on: today() });
        render();
        return true;
      case 'bill-cancel': ui.billView = { ...ui.billView, cancelling: true }; render(); root.querySelector('[data-form="bill-cancel"] input')?.focus(); return true;
      case 'bill-cancel-close': ui.billView = { ...ui.billView, cancelling: false }; render(); return true;
      case 'bill-undo-cancel': await undoCancel(id); return true;
      case 'bill-copy': copyOf(id); return true;
      case 'bill-make-bill': await makeBill(id); return true;
      case 'bill-link': {
        const d = docOf(id);
        try { sync.accept('document', await api.documentLink(id, d.link_on === false)); ui.billView = {}; } catch (err) { ui.billView = { notice: { text: msg(err), error: true } }; }
        render();
        return true;
      }
      case 'bill-remove-signature':
        try { session.set({ ...session.get(), business: await api.removeSignature() }); ui.lookForm = { notice: { text: W.lookSaved } }; } catch (err) { ui.lookForm = { notice: { text: msg(err), error: true } }; }
        render();
        return true;
      default: return false;
    }
  }

  // ---------- typing ----------
  function onInput(e) {
    const t = e.target;
    const ed = ui.billEd;
    if (t.matches('[data-bill-search]')) {
      ui.bills = { ...ui.bills, q: t.value };
      const kind = root.querySelector('.bills-page h1')?.textContent === W.estimates ? 'quote' : 'invoice';
      const { rows, counts } = billList(store.get().documents, { kind, q: t.value, chip: ui.bills.chip || 'all' }, today());
      const slot = root.querySelector('[data-slot="bill-rows"]');
      if (slot) slot.innerHTML = rows.length ? billRows(rows, today(), { jobs: store.get().jobs, make: (me().permissions || []).includes('create_documents'), demo: demo() }) : `<p class="empty" data-testid="bills-empty">${W.noBillsMatch}</p>`;
      for (const [k, n] of Object.entries(counts)) { const c = root.querySelector(`[data-chip-count="${k}"]`); if (c) c.textContent = String(n); }
      return true;
    }
    if (t.matches('[data-look-live], [data-form="bill-look"] input, [data-form="bill-look"] textarea')) { paintLook(); return true; }
    if (!ed) return false;
    if (t.matches('[data-item-search]')) {
      ed.itemQ = t.value;
      const slot = root.querySelector('[data-slot="item-results"]');
      if (slot) slot.innerHTML = itemRows(store.get(), t.value, ed.doc);
      return true;
    }
    if (t.matches('[data-cust-search]')) {
      ed.custQ = t.value;
      const slot = root.querySelector('[data-slot="cust-results"]');
      if (slot) slot.innerHTML = customerRows(store.get(), t.value);
      return true;
    }
    if (t.dataset.lineKey !== undefined || t.dataset.billKey !== undefined || t.dataset.custKey !== undefined) {
      apply(t);
      paintTotals();
      return true;
    }
    return false;
  }
  /** One field of the working copy, from what was typed or picked. */
  function apply(t) {
    const doc = ui.billEd.doc;
    if (t.dataset.lineKey !== undefined) {
      const l = doc.lines[Number(t.dataset.index)];
      if (!l) return;
      const key = t.dataset.lineKey;
      if (key === 'rate') { l.rate = paiseOf(t.value); l.last_price = false; }
      else if (key === 'unit_id') Object.assign(l, lineInUnit(store.get(), l, t.value));
      else if (key === 'discount') {
        const kind = (l.discount && l.discount.kind) || 'percent';
        l.discount = t.value.trim() === '' ? null : { kind, value: kind === 'amount' ? paiseOf(t.value) : t.value.trim() };
      } else if (key === 'discount_kind') {
        const raw = root.querySelector(`[data-k="ld${t.dataset.index}"]`)?.value || '';
        l.discount = raw.trim() === '' ? null : { kind: t.value, value: t.value === 'amount' ? paiseOf(raw) : raw.trim() };
      } else l[key] = t.value;
      return;
    }
    if (t.dataset.billKey !== undefined) {
      const key = t.dataset.billKey;
      if (key === 'bill_discount' || key === 'bill_discount_kind') {
        const raw = root.querySelector('[data-k="bd"]')?.value || '';
        const kind = key === 'bill_discount_kind' ? t.value : (doc.bill_discount && doc.bill_discount.kind) || root.querySelector('[data-bill-key="bill_discount_kind"]')?.value || 'percent';
        doc.bill_discount = raw.trim() === '' ? null : { kind, value: kind === 'amount' ? paiseOf(raw) : raw.trim() };
      } else {
        doc[key] = t.value;
        if (key === 'date' && doc.type === 'quote') doc.valid_until = addDays(t.value, lookOf(business()).estimate_valid_days);
      }
      return;
    }
    const key = t.dataset.custKey;
    doc.customer = { ...doc.customer, [key]: key === 'gstin' ? t.value.trim().toUpperCase() : t.value };
    if (key === 'gstin' && stateOfGstin(doc.customer.gstin)) { doc.customer.state_code = stateOfGstin(doc.customer.gstin); doc.place_of_supply = doc.customer.state_code; }
    if (key === 'state_code' && t.value) doc.place_of_supply = t.value;
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-form="bill-look"] input, [data-form="bill-look"] textarea')) { paintLook(); return t.dataset.action !== 'pick-signature' ? true : false; }
    if (!ui.billEd || !(t.dataset.lineKey !== undefined || t.dataset.billKey !== undefined || t.dataset.custKey !== undefined)) return false;
    apply(t);
    setTimeout(() => persist(), 0); // after focus has moved on, so it can be put back
    return true;
  }

  // ---------- forms: setup, bill look, cancel ----------
  async function refreshMe() {
    try { const fresh = await api.me(); if (fresh && fresh.signed_in) session.set(fresh); } catch { /* the next screen load asks again */ }
  }
  function setupFields(form) {
    const f = new FormData(form);
    return { business_type: f.get('business_type') || null, gst_registration: f.get('gst_registration') || null, state_code: f.get('state_code') || null };
  }
  async function onSubmit(form) {
    const kind = form.dataset.form;
    if (kind === 'bill-first-setup' || kind === 'bill-setup') {
      const fields = setupFields(form);
      if (kind === 'bill-setup') fields.packs = form.querySelector('[name="pack_field_service"]').checked ? ['field_service'] : [];
      if (kind === 'bill-first-setup' && !fields.business_type) { ui.setupForm = { ...fields, notice: { text: W.setupTitle, error: true } }; render(); return true; }
      if (!fields.state_code) { ui.setupForm = { ...fields, notice: { text: W.pickState, error: true } }; render(); return true; }
      try {
        const res = await api.saveSetup(fields);
        session.set({ ...session.get(), business: { ...session.get().business, ...res } });
        await refreshMe();
        ui.setupForm = kind === 'bill-setup' ? { notice: { text: W.packsSaved } } : {};
        if (kind === 'bill-first-setup') navigate('#/');
      } catch (err) { ui.setupForm = { ...fields, notice: { text: msg(err), error: true } }; }
      render();
      return true;
    }
    if (kind === 'bill-look') {
      try {
        const look = await api.saveBillLook(lookFields(form));
        session.set({ ...session.get(), business: { ...session.get().business, bill_look: look } });
        ui.lookForm = { notice: { text: W.lookSaved } };
      } catch (err) { ui.lookForm = { draft: lookFields(form), notice: { text: msg(err), error: true } }; }
      render();
      return true;
    }
    if (kind === 'bill-cancel') {
      const reason = new FormData(form).get('reason') || '';
      ui.billView = { ...ui.billView, cancelling: false };
      await cancel(form.dataset.doc, String(reason).trim());
      return true;
    }
    return false;
  }
  function lookFields(form) {
    const f = new FormData(form);
    const n = (k) => (f.get(k) === '' || f.get(k) === null ? undefined : Number(f.get(k)));
    return {
      layout: f.get('layout'), colour: f.get('colour'), phone: f.get('phone') || '', upi_id: f.get('upi_id') || '', terms: f.get('terms') || '',
      prefix: f.get('prefix') || '', due_days: n('due_days'), estimate_valid_days: n('estimate_valid_days'),
      bank: { account_name: f.get('account_name') || '', account_number: f.get('account_number') || '', ifsc: f.get('ifsc') || '' },
    };
  }
  function paintLook() {
    const form = root.querySelector('[data-form="bill-look"]');
    const slot = root.querySelector('[data-slot="look-preview"]');
    if (!form || !slot) return;
    const lk = { ...lookOf(business()), ...lookFields(form) };
    lk.prefix = String(lk.prefix || '').toUpperCase();
    const sample = {
      id: 'sample', doc_version: 2, type: 'invoice', status: 'saved', number: `${lk.prefix}${lk.prefix && !'/-'.includes(lk.prefix.at(-1)) ? '/' : ''}26-27/0001`, date: '2026-11-02', due_date: '2026-11-02',
      customer: { name: 'Mehta Clinic', address: 'Kothrud, Pune', state_code: (business() && business().state_code) || '27' },
      lines: [{ description: 'AC service, split 1.5 ton', qty: 1, unit: 'nos', rate: 89900, gst_rate: '18' }, { description: 'Copper pipe', qty: '2.5', unit: 'metre', rate: 25000, gst_rate: '18' }],
    };
    slot.innerHTML = billPaper(sample, { business: business(), settings: store.get().settings, sample: true, look: lk });
  }
  async function pickSignature(file) {
    if (!file) return;
    if (file.size > 300 * 1024 || !/^image\/(png|jpeg)$/.test(file.type)) { ui.lookForm = { notice: { text: 'Use a PNG or JPEG picture of up to 300 KB for the signature.', error: true } }; render(); return; }
    const dataUrl = await new Promise((resolve, reject) => { const r = new win.FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    try { session.set({ ...session.get(), business: await api.saveSignature(dataUrl) }); ui.lookForm = { notice: { text: W.lookSaved } }; } catch (err) { ui.lookForm = { notice: { text: msg(err), error: true } }; }
    render();
  }

  // ---------- routes ----------
  function load(route) {
    if (route.name === 'bill-new') {
      const d = openNew(route.params.type);
      return d;
    }
    if (route.name === 'bill-edit') {
      const d = docOf(route.params.id);
      if (d && isV2(d) && !['draft', 'saved'].includes(d.status)) { navigate(`#/bills/${encodeURIComponent(d.id)}`); return null; }
      edit(route.params.id);
    }
    if (route.name !== 'bill-edit') ui.billEd = null;
    if (route.name !== 'bill') ui.billView = {};
    ui.newOpen = false;
    return null;
  }

  return { onClick, onInput, onChange, onSubmit, load, fromJob, pickSignature, stop: () => timers.forEach(clearTimeout) };
}
