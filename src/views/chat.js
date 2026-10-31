import { icon } from '../ui/icons.js';
import { escapeHtml, rupees, prettyDate, prettyPhone, duration } from '../format.js';
import { SAMPLES } from '../data/demo.js';
import { JOBSHEET_SVG } from '../data/jobsheet.js';
import { docLabel } from '../domain/documents.js';
import { jobRef } from '../ids.js';

const FIELDS = [
  ['customer_name', 'Customer', 'text'],
  ['phone', 'Phone', 'tel'],
  ['area', 'Area', 'text'],
  ['equipment', 'Equipment', 'text'],
  ['work_done', 'Work', 'text'],
  ['amc_expiry', 'AMC expiry', 'date'],
  ['amc_value', 'AMC value (₹)', 'number'],
];
const time = (at) => (at || '').slice(11, 16);
const bars = (seed) => Array.from({ length: 28 }, (_, i) => 6 + ((seed * 31 + i * 17) % 13) + (i % 5 === 0 ? 4 : 0));

function fieldValue(job, key) {
  const v = job[key];
  if (key === 'amc_expiry') return v ? prettyDate(v) : 'Not mentioned';
  if (key === 'amc_value') return v ? rupees(v) : 'Not mentioned';
  if (key === 'phone') return v ? prettyPhone(v) : 'Not mentioned';
  return v ? escapeHtml(v) : 'Not mentioned';
}

function voiceBubble(m, ui) {
  const playing = ui.playing === m.id;
  return `<div class="voice" data-testid="voice-note">
    <button type="button" class="voice-play" data-action="play-voice" data-id="${m.id}" aria-label="${playing ? 'Pause' : 'Play'} voice note, ${duration(m.seconds)}">${icon(playing ? 'pause' : 'play', { size: 18 })}</button>
    <span class="wave ${playing ? 'is-playing' : ''}" aria-hidden="true">${bars(m.seconds).map((h) => `<i style="height:${h}px"></i>`).join('')}</span>
    <span class="voice-dur" data-testid="voice-duration">${duration(m.seconds)}</span>
  </div>
  <p class="voice-transcript"><span class="sr-label">Voice note transcript:</span> ${escapeHtml(m.body)}</p>`;
}

function processCard(m) {
  const stepIcon = (s) => (s.status === 'done' ? icon('check', { size: 16 }) : s.status === 'failed' ? icon('x', { size: 16 }) : s.status === 'running' ? '<span class="spinner" aria-hidden="true"></span>' : s.status === 'skipped' ? icon('arrowRight', { size: 16 }) : '<span class="dot-pending" aria-hidden="true"></span>');
  const statusText = { pending: 'waiting', running: 'working', done: 'done', failed: 'failed', skipped: 'skipped' };
  return `<div class="process" data-testid="processing-panel" aria-live="polite">
    <p class="process-title">${icon('sparkle', { size: 16 })} Processing</p>
    <ol class="steps">${m.steps
      .map((s) => `<li class="step is-${s.status}" data-step="${s.id}" data-status="${s.status}"><span class="step-icon">${stepIcon(s)}</span><span class="step-body"><strong>${s.label}</strong> <span class="step-state">${statusText[s.status]}</span>${s.detail ? `<span class="step-detail">${escapeHtml(s.detail)}</span>` : ''}</span></li>`)
      .join('')}</ol>
    ${m.notice ? `<p class="process-note" role="status" data-testid="process-note">${icon('alert', { size: 16 })}<span>${escapeHtml(m.notice)}</span></p>` : ''}
    ${m.transcript ? `<div class="transcript" data-testid="transcript"><span class="label">Transcript</span><p>${escapeHtml(m.transcript)}</p></div>` : ''}
    ${m.error ? `<div class="step-error" role="alert" data-testid="process-error">${icon('alert', { size: 16 })}<span>${escapeHtml(m.error)}</span><button type="button" class="btn btn-small" data-action="retry" data-id="${m.id}">${icon('rotate', { size: 16 })} Try again</button></div>` : ''}
  </div>`;
}

function summaryCard(m, ui, state) {
  const editing = ui.editingCard === m.id && m.status === 'draft';
  const errs = (ui.cardErrors && ui.cardErrors[m.id]) || {};
  const lines = (m.job.lines || []).filter((l) => Number(l.rate) > 0);
  const linesHtml = lines.length
    ? `<ul class="card-lines">${lines.map((l) => `<li><span>${escapeHtml(l.description)}${l.qty > 1 ? ` x ${l.qty}` : ''}</span><span>${rupees(l.qty * l.rate)}</span></li>`).join('')}</ul>`
    : '';
  if (editing) {
    return `<form class="summary is-editing" data-testid="summary-card" data-form="approve" data-id="${m.id}" novalidate>
      <p class="summary-title">${icon('pencil', { size: 16 })} Check and correct</p>
      ${FIELDS.map(([k, label, type]) => `<label class="field"><span>${label}</span><input name="${k}" type="${type}" value="${escapeHtml(m.job[k] ?? '')}" ${type === 'number' ? 'min="0" step="1" inputmode="numeric"' : ''} ${errs[k] ? 'aria-invalid="true"' : ''} data-field="${k}">${errs[k] ? `<small class="field-error">${escapeHtml(errs[k])}</small>` : ''}</label>`).join('')}
      <div class="card-actions"><button type="button" class="btn btn-ghost" data-action="cancel-edit" data-id="${m.id}">Cancel</button><button type="submit" class="btn btn-primary" data-testid="approve">${icon('check', { size: 18 })} Approve</button></div>
    </form>`;
  }
  return `<div class="summary ${m.status === 'approved' ? 'is-approved' : ''}" data-testid="summary-card" data-id="${m.id}">
    <p class="summary-title">${icon('jobs', { size: 16 })} Job summary ${m.reader === 'quick' ? '<span class="badge badge-warn" data-testid="reader-tag">Read without AI</span>' : m.reader === 'ai' ? `<span class="badge" data-testid="reader-tag">${icon('sparkle', { size: 12 })} Read by AI</span>` : ''} ${m.status === 'approved' ? `<span class="badge badge-ok">${icon('check', { size: 14 })} Approved</span>` : '<span class="badge">Draft</span>'}</p>
    <dl class="summary-fields">${FIELDS.map(([k, label]) => `<div data-field="${k}"><dt>${label}</dt><dd>${fieldValue(m.job, k)}</dd></div>`).join('')}</dl>
    ${linesHtml}
    ${m.status === 'draft'
      ? `<div class="card-actions"><button type="button" class="btn btn-ghost" data-action="edit-card" data-id="${m.id}">${icon('pencil', { size: 16 })} Edit</button><button type="button" class="btn btn-primary" data-action="approve" data-id="${m.id}" data-testid="approve">${icon('check', { size: 18 })} Approve</button></div>`
      : `<div class="card-actions"><a class="btn btn-ghost" href="#/jobs/${m.job_id}">Open job${jobRef(state, m.job_id) === 'New' ? '' : ` ${jobRef(state, m.job_id)}`} ${icon('arrowRight', { size: 16 })}</a></div>`}
  </div>`;
}

function documentBubble(m, state) {
  const d = state.documents.find((x) => x.id === m.doc_id);
  return `<a class="doc-attach" href="#/doc/${escapeHtml(m.doc_id)}" data-testid="doc-attachment">
      <span class="doc-icon">${icon('file', { size: 22 })}</span>
      <span><strong>${d ? docLabel(d) : escapeHtml(m.doc_id)}</strong><small>${d ? `${rupees(d.total)} · PDF · simulated` : 'PDF · simulated'}</small></span>
    </a>
    <p class="bubble-text" data-testid="doc-sent">${escapeHtml(m.body)}</p>
    <p class="sim-note">Simulated: nothing was sent.</p>`;
}

function message(m, state, ui) {
  const out = m.from === 'technician';
  let body = '';
  if (m.kind === 'voice') body = voiceBubble(m, ui);
  else if (m.kind === 'image') body = `<figure class="photo" data-testid="image-bubble">${JOBSHEET_SVG}<figcaption>${escapeHtml(m.body)}</figcaption></figure>`;
  else if (m.kind === 'process') body = processCard(m);
  else if (m.kind === 'card') body = summaryCard(m, ui, state);
  else if (m.kind === 'document') body = documentBubble(m, state);
  else body = `<p class="bubble-text">${escapeHtml(m.body)}</p>${m.job_id ? `<a class="inline-link" href="#/jobs/${m.job_id}">Open ${jobRef(state, m.job_id) === 'New' ? 'the job' : jobRef(state, m.job_id)}</a>` : ''}`;
  const wide = m.kind === 'process' || m.kind === 'card';
  return `<li class="msg ${out ? 'out' : 'in'} kind-${m.kind} ${wide ? 'wide' : ''}" data-from="${m.from}" data-kind="${m.kind}">
    <div class="bubble">${out && m.author ? `<span class="author">${escapeHtml(m.author)}</span>` : ''}${body}<span class="meta">${time(m.at)}${out ? ` ${icon('checks', { size: 14 })}` : ''}</span></div>
  </li>`;
}

export function chat({ state, ui, busy }) {
  const started = state.messages.some((m) => m.from === 'technician');
  const sample = (s) => `<button type="button" class="chip-sample" data-action="send-sample" data-sample="${s.id}" ${busy ? 'disabled' : ''}>${icon(s.kind === 'voice' ? 'mic' : 'image', { size: 16 })}<span>${escapeHtml(s.label)}</span>${s.seconds ? `<small>${duration(s.seconds)}</small>` : ''}</button>`;
  return `
  <section class="chat-page">
    <h1 id="page-title" class="sr-only" tabindex="-1">Chat: simulated WhatsApp conversation</h1>
    <div class="phone" data-testid="chat-phone">
      <header class="phone-bar">
        <span class="avatar" aria-hidden="true">K</span>
        <span class="who"><strong data-testid="chat-title">KaryaHub</strong><small>Business account · ${state.settings.is_demo ? 'demo, nothing is really sent' : 'WhatsApp is simulated until it is connected'}</small></span>
      </header>
      <ol class="thread" data-testid="thread">
        ${state.messages.map((m) => message(m, state, ui)).join('')}
        ${!started ? `<li class="hint" data-testid="chat-hint">${state.settings.is_demo ? 'Pick a sample to start' : 'Type a technician\'s message below to start'}</li>` : ''}
      </ol>
      ${state.settings.is_demo ? `<div class="picker" role="group" aria-label="Send a sample technician message" data-testid="sample-picker">
        ${SAMPLES.map(sample).join('')}
      </div>` : ''}
      <form class="composer" data-form="send-text">
        <label class="sr-only" for="composer-input">Type a message as the technician</label>
        <input id="composer-input" name="text" autocomplete="off" placeholder="Type as the technician, e.g. Gas refill for Mr Anil Kumar, 9900000150" value="${escapeHtml(ui.draft || '')}" ${busy ? 'disabled' : ''}>
        <button type="submit" class="send" aria-label="Send" ${busy ? 'disabled' : ''}>${icon('send', { size: 20 })}</button>
      </form>
    </div>
    <aside class="chat-aside" aria-label="${state.settings.is_demo ? 'About this demo' : 'How it works'}">
      <h2>${state.settings.is_demo ? 'What you are seeing' : 'How it works'}</h2>
      <ol class="script">
        <li>A technician sends a voice note, a photo of a paper job sheet, or a text, just like on WhatsApp today.</li>
        <li>KaryaHub transcribes it, pulls out the customer, the work and the AMC, and saves a draft.</li>
        <li>The owner checks it, corrects anything, and approves. A quote or invoice and a renewal reminder follow.</li>
      </ol>
      <p class="aside-note">${icon('plug', { size: 16 })} Messages and job-sheet photos are read by Studio AI, the firm's own AI server, once it's connected; until then, and whenever it's offline, a quick reader fills in the details and the card says "Read without AI". WhatsApp and speech-to-text are still demo adapters, so nothing is really sent.</p>
    </aside>
  </section>`;
}
