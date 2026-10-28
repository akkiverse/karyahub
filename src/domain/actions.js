// Everything the screens can do to the demo data. Each action goes through the adapters,
// so switching from mock to live changes the services, not the screens.
import { SAMPLES } from '../data/demo.js';
import { today, nowStamp } from '../clock.js';
import { computeTotals, docNumber, docTitle } from './documents.js';
import { reminderText } from './renewals.js';
import { isValidISO } from '../format.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const NO_NAME_REPLY = "I couldn't find a customer name, can you add it?";
export const UNDERSTOOD_REPLY = 'Got it. Here is what I understood';

function nextId(state, key, prefix) {
  state.seq[key] = (state.seq[key] || 0) + 1;
  return `${prefix}${String(state.seq[key]).padStart(4, '0')}`;
}
function pushMessage(state, msg) {
  const id = nextId(state, 'msg', 'm-');
  state.messages.push({ id, at: nowStamp(), ...msg });
  return id;
}

export function createActions({ store, getAdapters, stepDelay }) {
  const adapters = () => getAdapters(store.get().settings.mode);
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
      if (source.type === 'voice') text = (await a.speech.transcribe(sample, { fail })).text;
      else if (source.type === 'photo') text = (await a.llm.readImage(sample, { fail })).text;
      else text = source.text;
      setStep(processId, 'transcribe', {
        status: 'done',
        detail: source.type === 'voice' ? `Speech adapter (${a.mode})` : source.type === 'photo' ? `Photo read by LLM adapter (${a.mode})` : 'Text message, nothing to transcribe',
      });
      updateMsg(processId, (m) => { m.transcript = text; });
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
      setStep(processId, 'extract', { status: 'done', detail: `LLM adapter (${a.mode})` });
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
      pushMessage(s, { from: 'bot', kind: 'card', status: 'draft', job: result.job, source_sample_id: source.sample_id || null });
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
      updateMsg(processId, (m) => { m.error = ''; m.transcript = ''; m.steps.forEach((st) => { st.status = 'pending'; st.detail = ''; }); });
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
      });
      const m = s.messages.find((x) => x.id === cardId);
      m.status = 'approved';
      m.job = job;
      m.job_id = jobId;
      pushMessage(s, { from: 'bot', kind: 'text', body: `Saved. Job ${jobId} for ${customer.name} is in Jobs.`, job_id: jobId });
    });
    return { jobId };
  }

  async function createDocument(jobId, type) {
    const s0 = store.get();
    const job = s0.jobs.find((j) => j.id === jobId);
    if (!job) return { error: 'That job no longer exists. Reset the demo or pick another job.' };
    let docId;
    store.update((s) => {
      s.seq[type] = (s.seq[type] || 0) + 1;
      docId = docNumber(type, s.seq[type]);
      const lines = job.lines.map((l) => ({ ...l }));
      s.documents.unshift({ id: docId, job_id: jobId, type, customer: { name: job.customer_name, phone: job.phone, area: job.area }, lines, ...computeTotals(lines), date: today(), sent: false });
    });
    const label = `${docTitle(type)} sent to ${job.customer_name}`;
    try {
      await adapters().whatsapp.sendMessage({ to: job.phone, kind: 'document', body: `${docTitle(type)} ${docId}` });
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

  const setSetting = (key, value) => store.update((s) => { s.settings[key] = value; });

  return { send, retry, approve, createDocument, updateDocumentLine, sendReminder, setSetting, reset: () => store.reset(), isBusy: () => busy };
}
