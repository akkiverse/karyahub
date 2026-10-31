// Everything the screens can do to the demo data. Each action goes through the adapters,
// so switching from mock to live changes the services, not the screens.
import { SAMPLES } from '../data/demo.js';
import { today, nowStamp } from '../clock.js';
import { computeTotals, docNumber, docTitle } from './documents.js';
import { reminderText } from './renewals.js';
import { isValidISO } from '../format.js';
import { ApiUnreachable } from '../api/client.js';
import { FALLBACK_NOTE } from '../adapters/server.js';
import { can, ACTION_PERMISSION, roleShort } from './access.js';
import { isSynced, uid } from '../ids.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const NO_NAME_REPLY = "I couldn't find a customer name, can you add it?";
export const UNDERSTOOD_REPLY = 'Got it. Here is what I understood';

function nextId(state, key, prefix) {
  if (isSynced(state)) return `${prefix}${uid()}`; // a real business: unique on every phone, numbered by the server (CR-0009)
  state.seq[key] = (state.seq[key] || 0) + 1;
  return `${prefix}${String(state.seq[key]).padStart(4, '0')}`;
}
function pushMessage(state, msg) {
  const id = nextId(state, 'msg', 'm-');
  state.messages.push({ id, at: nowStamp(), ...msg });
  return id;
}

const STILL_WAITING = "This job is still waiting to be sent to the server. Try again when the signal is back.";
const SERVER_NEEDED = "Couldn't reach the KaryaHub server. Proof-of-work steps and visit plans need it; check your connection and try again.";
const via = (r, a) => (r && r._via === 'fallback' ? `${a.mode}: ${FALLBACK_NOTE}` : a.mode === 'server' ? 'KaryaHub server' : a.mode);
// Who read the message on the server (CR-0004): Studio AI, or the quick reader when AI is offline.
export const READ_WITHOUT_AI = 'Read without AI';
const readerLabel = (r) => (r && r.reader === 'ai' ? 'Read by Studio AI' : r && r.reader === 'quick' ? READ_WITHOUT_AI : '');
const stepDetail = (base, r, a) => (readerLabel(r) ? `${readerLabel(r)} (${via(r, a)})` : `${base} (${via(r, a)})`);
let opCounter = 0;
const newOpId = (jobId) => `op-${jobId}-${Date.now().toString(36)}-${(opCounter += 1)}-${Math.random().toString(36).slice(2, 6)}`;

export function createActions({ store, getAdapters, stepDelay, api, currentUser = () => null, photoImage = async () => null, ensureSynced = async () => true }) {
  const adapters = () => getAdapters(store.get().settings.mode, api);
  const updateMsg = (id, fn) => store.update((s) => { const m = s.messages.find((x) => x.id === id); if (m) fn(m, s); });
  const setStep = (id, stepId, patch) => updateMsg(id, (m) => Object.assign(m.steps.find((st) => st.id === stepId), patch));
  let busy = false;

  async function process(source, processId) {
    const fail = store.get().settings.simulate_failure;
    const a = adapters();
    const sample = source.sample_id ? SAMPLES.find((s) => s.id === source.sample_id) : null;
    // Step 1: Transcribe
    setStep(processId, 'transcribe', { status: 'running' });
    await sleep(stepDelay());
    let text;
    try {
      let r = null;
      if (source.type === 'voice') r = await a.speech.transcribe(sample, { fail });
      else if (source.type === 'photo') {
        let image = null;
        if (a.mode === 'server') { try { image = await photoImage(sample); } catch { image = null; } }
        r = await a.llm.readImage(sample, { fail, image });
      }
      text = r ? r.text : source.text;
      setStep(processId, 'transcribe', {
        status: 'done',
        detail: source.type === 'voice' ? `Speech adapter (${via(r, a)})` : source.type === 'photo' ? (readerLabel(r) ? stepDetail('', r, a) : `Photo read by LLM adapter (${via(r, a)})`) : 'Text message, nothing to transcribe',
      });
      updateMsg(processId, (m) => { m.transcript = text; if (r && r.notice) m.notice = r.notice; });
    } catch (e) {
      setStep(processId, 'transcribe', { status: 'failed', detail: e.message });
      updateMsg(processId, (m) => { m.error = e.message; });
      return;
    }
    // Step 2: Extract
    setStep(processId, 'extract', { status: 'running' });
    await sleep(stepDelay());
    let result;
    try {
      result = await a.llm.extractJob(text, { fail: false });
      setStep(processId, 'extract', { status: 'done', detail: stepDetail('LLM adapter', result, a) });
      if (result && result.notice) updateMsg(processId, (m) => { m.notice = result.notice; });
    } catch (e) {
      setStep(processId, 'extract', { status: 'failed', detail: e.message });
      updateMsg(processId, (m) => { m.error = e.message; });
      return;
    }
    if (!result.found) {
      store.update((s) => {
        const m = s.messages.find((x) => x.id === processId);
        m.steps.find((st) => st.id === 'save').status = 'skipped';
        m.steps.find((st) => st.id === 'save').detail = 'Nothing to save yet';
        pushMessage(s, { from: 'bot', kind: 'text', body: NO_NAME_REPLY });
      });
      return;
    }
    // Step 3: Save (as a draft the owner approves)
    setStep(processId, 'save', { status: 'running' });
    await sleep(stepDelay());
    store.update((s) => {
      const m = s.messages.find((x) => x.id === processId);
      Object.assign(m.steps.find((st) => st.id === 'save'), { status: 'done', detail: 'Saved as a draft for your approval' });
      pushMessage(s, { from: 'bot', kind: 'text', body: UNDERSTOOD_REPLY });
      const author = source.sample_id ? (SAMPLES.find((x) => x.id === source.sample_id) || {}).technician : 'the technician';
      pushMessage(s, { from: 'bot', kind: 'card', status: 'draft', job: result.job, source_sample_id: source.sample_id || null, reported_by: author || 'the technician', reader: result.reader || '' });
    });
  }

  async function send(source) {
    if (busy) return;
    busy = true;
    try {
      let processId;
      store.update((s) => {
        const sample = source.sample_id ? SAMPLES.find((x) => x.id === source.sample_id) : null;
        if (source.type === 'voice') pushMessage(s, { from: 'technician', kind: 'voice', sample_id: sample.id, seconds: sample.seconds, body: sample.mock_transcript, author: sample.technician });
        else if (source.type === 'photo') pushMessage(s, { from: 'technician', kind: 'image', sample_id: sample.id, body: sample.label, author: sample.technician });
        else pushMessage(s, { from: 'technician', kind: 'text', body: source.text, author: 'You (as technician)' });
        processId = pushMessage(s, { from: 'bot', kind: 'process', source, transcript: '', error: '', steps: [
          { id: 'transcribe', label: 'Transcribe', status: 'pending', detail: '' },
          { id: 'extract', label: 'Extract', status: 'pending', detail: '' },
          { id: 'save', label: 'Save', status: 'pending', detail: '' },
        ] });
      });
      await process(source, processId);
    } finally {
      busy = false;
    }
  }

  async function retry(processId) {
    if (busy) return;
    const msg = store.get().messages.find((m) => m.id === processId);
    if (!msg) return;
    busy = true;
    try {
      updateMsg(processId, (m) => { m.error = ''; m.transcript = ''; m.notice = ''; m.steps.forEach((st) => { st.status = 'pending'; st.detail = ''; }); });
      await process(msg.source, processId);
    } finally {
      busy = false;
    }
  }

  function validateJob(job) {
    const errors = {};
    if (!String(job.customer_name || '').trim()) errors.customer_name = 'Add the customer name.';
    const digits = String(job.phone || '').replace(/\D/g, '');
    if (job.phone && digits.length !== 10) errors.phone = 'Use a 10-digit mobile number.';
    if (job.amc_expiry && !isValidISO(job.amc_expiry)) errors.amc_expiry = 'Use a date like 2027-03-15.';
    if (job.amc_value !== '' && job.amc_value != null && !(Number(job.amc_value) >= 0)) errors.amc_value = 'Enter the AMC value in rupees, for example 6500.';
    return errors;
  }

  function approve(cardId, edits = {}) {
    const card = store.get().messages.find((m) => m.id === cardId);
    if (!card || card.status !== 'draft') return { errors: { _: 'This card was already handled.' } };
    const job = { ...card.job, ...edits };
    job.phone = String(job.phone || '').replace(/\D/g, '');
    const errors = validateJob(job);
    if (Object.keys(errors).length) return { errors };
    let jobId;
    store.update((s) => {
      let customer = s.customers.find((c) => (job.phone && c.phone === job.phone) || c.name.toLowerCase() === job.customer_name.trim().toLowerCase());
      if (!customer) {
        customer = { id: nextId(s, 'customer', 'n'), name: job.customer_name.trim(), phone: job.phone, area: job.area || '', equipment: job.equipment || '', amc_expiry: '', amc_value: 0, reminded_at: null };
        s.customers.push(customer);
      }
      Object.assign(customer, {
        name: job.customer_name.trim(),
        phone: job.phone || customer.phone,
        area: job.area || customer.area,
        equipment: job.equipment || customer.equipment,
      });
      if (job.amc_expiry) customer.amc_expiry = job.amc_expiry;
      if (job.amc_value !== '' && job.amc_value != null) customer.amc_value = Number(job.amc_value);
      jobId = nextId(s, 'job', 'J-');
      s.jobs.unshift({
        id: jobId,
        ...(isSynced(s) ? { number: '' } : {}), // the server gives the number when it receives the job
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
        area: customer.area,
        equipment: job.equipment,
        date: today(),
        work_done: job.work_done,
        parts: job.parts || '',
        amc_expiry: job.amc_expiry,
        amc_value: Number(job.amc_value) || 0,
        lines: (job.lines || []).map((l) => ({ ...l })),
        source_sample_id: card.source_sample_id,
        approved_at: nowStamp(),
        // Proof of work (CR-0002): the technician reported the work done, so the job starts there.
        state: 'WORK_DONE',
        events: [{
          id: `ev-${jobId}-reported`, action: 'report_done', from_state: 'NEW', to_state: 'WORK_DONE',
          client_op_id: `reported-${jobId}`, actor: (card.reported_by || 'the technician').replace(/ \(technician\)$/, ''), channel: 'whatsapp',
          detail: `Reported done by ${(card.reported_by || 'the technician').replace(/ \(technician\)$/, '')} on WhatsApp`, received_at: nowStamp(),
        }],
        otp: null,
      });
      const m = s.messages.find((x) => x.id === cardId);
      m.status = 'approved';
      m.job = job;
      m.job_id = jobId;
      pushMessage(s, { from: 'bot', kind: 'text', body: isSynced(s) ? `Saved. The job for ${customer.name} is in Jobs.` : `Saved. Job ${jobId} for ${customer.name} is in Jobs.`, job_id: jobId });
    });
    return { jobId };
  }

  async function createDocument(jobId, type) {
    const s0 = store.get();
    const job = s0.jobs.find((j) => j.id === jobId);
    if (!job) return { error: 'That job no longer exists. Pick another job.' };
    let docId;
    let synced = false;
    store.update((s) => {
      synced = isSynced(s);
      s.seq[type] = (s.seq[type] || 0) + 1;
      docId = synced ? `d-${uid()}` : docNumber(type, s.seq[type]);
      const lines = job.lines.map((l) => ({ ...l }));
      s.documents.unshift({ id: docId, ...(synced ? { number: '' } : {}), job_id: jobId, type, customer: { name: job.customer_name, phone: job.phone, area: job.area }, lines, ...computeTotals(lines), date: today(), sent: false });
    });
    const label = `${docTitle(type)} sent to ${job.customer_name}`;
    try {
      await adapters().whatsapp.sendMessage({ to: job.phone, kind: 'document', body: synced ? docTitle(type) : `${docTitle(type)} ${docId}` });
      store.update((s) => {
        s.documents.find((d) => d.id === docId).sent = true;
        pushMessage(s, { from: 'bot', kind: 'document', doc_id: docId, body: label });
      });
      return { docId };
    } catch (e) {
      return { docId, error: e.message };
    }
  }

  function updateDocumentLine(docId, index, patch) {
    store.update((s) => {
      const d = s.documents.find((x) => x.id === docId);
      if (!d || !d.lines[index]) return;
      Object.assign(d.lines[index], patch);
      Object.assign(d, computeTotals(d.lines));
    });
  }

  async function sendReminder(customerId) {
    const s0 = store.get();
    const c = s0.customers.find((x) => x.id === customerId);
    if (!c) return { error: 'That customer no longer exists.' };
    const text = reminderText(c, s0.settings.business_name, today());
    try {
      await adapters().whatsapp.sendMessage({ to: c.phone, kind: 'text', body: text });
      store.update((s) => { s.customers.find((x) => x.id === customerId).reminded_at = today(); });
      return { text };
    } catch (e) {
      return { text, error: e.message };
    }
  }

  /** Move a job through its workflow. The KaryaHub server checks every rule (CR-0002, US-8). */
  async function transition(jobId, action, payload = {}) {
    const job = store.get().jobs.find((j) => j.id === jobId);
    if (!job) return { error: 'That job no longer exists. Pick another job.' };
    const user = currentUser();
    if (user && ACTION_PERMISSION[action] && !can(user, ACTION_PERMISSION[action])) {
      return { error: "Your access doesn't include this. Ask your business owner." };
    }
    // A real business's job is saved on the server, which does the step on its own copy, so the job must be there first (CR-0009).
    if (!(await ensureSynced(jobId))) return { error: STILL_WAITING };
    const body = {
      state: job.state || 'WORK_DONE',
      action,
      client_op_id: newOpId(jobId),
      applied_op_ids: (job.events || []).map((e) => e.client_op_id),
      payload: action === 'request_otp' ? { ...payload, phone: job.phone } : payload,
      actor: user ? `${user.name} (${roleShort(user.role)})` : 'Owner',
      channel: 'web',
      captured_at: nowStamp(),
      work_done: job.work_done,
    };
    let r;
    try {
      r = await api.transition(jobId, body);
    } catch (e) {
      return { error: e instanceof ApiUnreachable ? SERVER_NEEDED : e.message };
    }
    store.update((s) => {
      const j = s.jobs.find((x) => x.id === jobId);
      if (!j) return;
      j.state = r.state;
      j.events = j.events || [];
      if (r.event && !j.events.some((e) => e.id === r.event.id)) j.events.push(r.event);
      if (r.otp) j.otp = { challenge: r.otp.challenge, expires_at: r.otp.expires_at, demo_code: r.otp.demo_code || '' };
      if (r.state !== 'WORK_DONE') j.otp = null;
    });
    return { state: r.state, event: r.event, otp: r.otp || null };
  }

  /** AMC visit plan for a job's customer, worked out by the server (US-9). */
  async function amcPlan(jobId) {
    const job = store.get().jobs.find((j) => j.id === jobId);
    if (!job || !job.amc_expiry) return { error: 'This job has no AMC end date, so there are no visits to plan.' };
    try {
      return { plan: await api.amcPlan({ customer_id: job.customer_id, ends_on: job.amc_expiry, every_days: 90, lead_days: 7 }, today()) };
    } catch (e) {
      return { error: e instanceof ApiUnreachable ? SERVER_NEEDED : e.message };
    }
  }

  const setSetting = (key, value) => store.update((s) => { s.settings[key] = value; });

  return { send, retry, approve, createDocument, updateDocumentLine, sendReminder, transition, amcPlan, setSetting, reset: () => store.reset(), isBusy: () => busy };
}
