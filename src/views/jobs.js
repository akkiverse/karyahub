import { icon } from '../ui/icons.js';
import { escapeHtml, rupees, prettyDate, prettyPhone } from '../format.js';
import { docTitle } from '../domain/documents.js';

export function jobs({ state }) {
  return `<section class="page">
    <header class="page-head"><h1 id="page-title" tabindex="-1">Jobs</h1><p class="muted">Approved jobs from technicians' messages, newest first.</p></header>
    ${state.jobs.length
      ? `<ul class="list" data-testid="jobs-list">${state.jobs
          .map((j) => `<li class="row-card" data-job="${j.id}"><a href="#/jobs/${j.id}" class="row-link">
            <span class="row-main"><strong>${escapeHtml(j.customer_name)}</strong><span class="muted">${escapeHtml(j.work_done)}${j.equipment ? ` · ${escapeHtml(j.equipment)}` : ''}</span></span>
            <span class="row-side"><span class="state-chip state-${(j.state || 'WORK_DONE').toLowerCase()} small">${escapeHtml((STATE_LABELS[j.state || 'WORK_DONE'] || '').split(',')[0])}</span><span class="muted">${j.id} · ${prettyDate(j.date)}</span>${icon('arrowRight', { size: 18 })}</span></a></li>`)
          .join('')}</ul>`
      : `<div class="empty" data-testid="jobs-empty">${icon('jobs', { size: 32 })}<p><strong>No jobs yet, send a sample in Chat</strong></p><a class="btn btn-primary" href="#/chat">Open Chat</a></div>`}
  </section>`;
}

// Presentation only: which buttons to offer in each state. The KaryaHub server enforces the rules.
export const STATE_LABELS = {
  NEW: 'New', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', WORK_DONE: 'Work done, waiting for customer check',
  VERIFIED: 'Verified by customer', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const STEPS = [['WORK_DONE', 'Work reported'], ['VERIFIED', 'Customer verified'], ['CLOSED', 'Closed']];
const VISIT_LABELS = { past: 'Before tracking', upcoming: 'Upcoming', create_job_now: 'Create job now', overdue: 'Overdue', job_created: 'Job created' };

function proofOfWork(j, ui, allow = () => true) {
  const st = j.state || 'WORK_DONE';
  const reached = (s) => STEPS.findIndex(([k]) => k === s) <= STEPS.findIndex(([k]) => k === st);
  const busy = ui.wfBusy === j.id;
  const note = ui.wfNote && ui.wfNote.job === j.id ? ui.wfNote : null;
  let controls = '';
  if (st === 'WORK_DONE' && !j.otp) {
    controls = `<p class="muted small">Before you close the job, ask the customer to confirm the work with a one-time code. It proves the visit really happened.</p>
      <button type="button" class="btn btn-primary" data-action="wf" data-wf="request_otp" data-job="${j.id}" ${busy ? 'disabled' : ''}>${icon('key', { size: 18 })} Send code to customer</button>`;
  } else if (st === 'WORK_DONE' && j.otp) {
    controls = `<form class="otp-form" data-form="verify-otp" data-job="${j.id}" novalidate>
        <label class="field"><span>Customer's 6-digit code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*" required ${note && note.error ? 'aria-invalid="true"' : ''}></label>
        <button type="submit" class="btn btn-primary" ${busy ? 'disabled' : ''}>${icon('shield', { size: 18 })} Verify</button>
      </form>
      ${j.otp.demo_code ? `<p class="demo-code" data-testid="demo-code">Demo: the customer's code is <strong>${escapeHtml(j.otp.demo_code)}</strong>. In the real version it arrives on their WhatsApp, not here.</p>` : '<p class="muted small">The code was sent to the customer\'s WhatsApp.</p>'}
      <button type="button" class="btn btn-ghost btn-small" data-action="wf" data-wf="request_otp" data-job="${j.id}" ${busy ? 'disabled' : ''}>${icon('rotate', { size: 16 })} Send a new code</button>`;
  } else if (st === 'VERIFIED' && !allow('close_jobs')) {
    controls = '<p class="muted small" data-testid="close-hidden">Verified. The office closes the job.</p>';
  } else if (st === 'VERIFIED') {
    controls = `<button type="button" class="btn btn-primary" data-action="wf" data-wf="close" data-job="${j.id}" ${busy ? 'disabled' : ''}>${icon('checks', { size: 18 })} Close job</button>`;
  }
  return `<section class="pow" data-testid="proof-of-work" aria-labelledby="pow-title">
    <h2 class="section-title" id="pow-title">${icon('shield', { size: 18 })} Proof of work</h2>
    <p class="pow-state"><span class="state-chip state-${st.toLowerCase()}" data-testid="job-state" data-state="${st}">${escapeHtml(STATE_LABELS[st] || st)}</span></p>
    <ol class="pow-steps" aria-label="Progress">${STEPS.map(([k, label]) => `<li class="${reached(k) ? 'is-done' : ''}">${reached(k) ? icon('check', { size: 14 }) : '<span class="dot-pending" aria-hidden="true"></span>'}<span>${label}</span></li>`).join('')}</ol>
    ${note ? `<p class="notice ${note.error ? 'notice-error' : ''}" role="${note.error ? 'alert' : 'status'}" data-testid="wf-note">${escapeHtml(note.text)}</p>` : ''}
    <div class="pow-controls">${controls}</div>
    <details class="timeline" ${ui.openTimeline === j.id ? 'open' : ''}><summary>History (${(j.events || []).length})</summary>
      <ol data-testid="job-timeline">${(j.events || []).map((e) => `<li><strong>${escapeHtml(e.detail || e.action)}</strong><span class="muted small">${escapeHtml(e.actor || '')}${e.channel ? ` · ${escapeHtml(e.channel === 'whatsapp' ? 'WhatsApp' : e.channel === 'web' ? 'web app' : e.channel)}` : ''}</span></li>`).join('')}</ol>
    </details>
  </section>`;
}

function visitPlan(j, ui) {
  if (!j.amc_expiry) return '';
  const p = ui.plans && ui.plans[j.id];
  let body;
  if (!p || p.loading) body = '<p class="muted" data-testid="plan-loading"><span class="spinner" aria-hidden="true"></span> Working out the visit plan…</p>';
  else if (p.error) body = `<p class="notice notice-error" role="alert" data-testid="plan-error">${escapeHtml(p.error)}</p><button type="button" class="btn btn-ghost btn-small" data-action="reload-plan" data-job="${j.id}">${icon('rotate', { size: 16 })} Try again</button>`;
  else {
    const pl = p.plan;
    const nxt = pl.next_visit;
    body = `${nxt ? `<p class="plan-next" data-testid="plan-next">Next visit due <strong>${prettyDate(nxt.due_on)}</strong>. ${nxt.status === 'overdue' ? `<span class="tag tag-lapsed">Overdue: tell the ${nxt.escalate_to}</span>` : nxt.status === 'create_job_now' ? '<span class="tag tag-soon">Create the job now</span>' : `KaryaHub creates the job on ${prettyDate(nxt.create_job_on)}, ${pl.lead_days} days ahead.`}</p>` : '<p class="muted">No more visits in this contract.</p>'}
      <ul class="visits" data-testid="visit-list">${pl.visits.map((v) => `<li data-status="${v.status}"><span>Visit ${v.number} · ${prettyDate(v.due_on)}</span><span class="tag tag-${v.status}">${VISIT_LABELS[v.status] || v.status}</span></li>`).join('')}</ul>`;
  }
  return `<section class="plan" aria-labelledby="plan-title"><h2 class="section-title" id="plan-title">${icon('renewals', { size: 18 })} AMC service visits</h2><p class="muted small">A visit every 90 days until the contract ends on ${prettyDate(j.amc_expiry)}.</p>${body}</section>`;
}

export function job({ state, params, ui, allow = () => true }) {
  const j = state.jobs.find((x) => x.id === params.id);
  if (!j) return `<section class="page"><h1 id="page-title" tabindex="-1">Job not found</h1><p>This job isn't on this device any more.</p><a class="btn btn-ghost" href="#/jobs">Back to Jobs</a></section>`;
  const docs = state.documents.filter((d) => d.job_id === j.id);
  const sub = j.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  return `<section class="page">
    <a class="back" href="#/jobs">${icon('arrowLeft', { size: 18 })} Jobs</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">${escapeHtml(j.customer_name)}</h1><p class="muted">${j.id} · approved ${prettyDate(j.date)}</p></header>
    <dl class="detail" data-testid="job-detail">
      <div><dt>Phone</dt><dd>${escapeHtml(prettyPhone(j.phone)) || 'Not given'}</dd></div>
      <div><dt>Area</dt><dd>${escapeHtml(j.area) || 'Not given'}</dd></div>
      <div><dt>Equipment</dt><dd>${escapeHtml(j.equipment) || 'Not given'}</dd></div>
      <div><dt>Work</dt><dd>${escapeHtml(j.work_done)}</dd></div>
      <div><dt>AMC expiry</dt><dd>${j.amc_expiry ? prettyDate(j.amc_expiry) : 'Not given'}</dd></div>
      <div><dt>AMC value</dt><dd>${j.amc_value ? rupees(j.amc_value) : 'Not given'}</dd></div>
    </dl>
    <h2 class="section-title">Charges</h2>
    <ul class="lines">${j.lines.map((l) => `<li><span>${escapeHtml(l.description)}${l.qty > 1 ? ` x ${l.qty}` : ''}</span><span>${rupees(l.qty * l.rate)}</span></li>`).join('')}<li class="lines-total"><span>Before GST</span><span>${rupees(sub)}</span></li></ul>
    ${ui.toast && ui.toast.where === 'job' ? `<p class="notice ${ui.toast.error ? 'notice-error' : ''}" role="status">${escapeHtml(ui.toast.text)}</p>` : ''}
    ${allow('create_documents') ? `<div class="actions">
      <button type="button" class="btn btn-primary" data-action="create-doc" data-type="quote" data-job="${j.id}">${icon('file', { size: 18 })} Create quote</button>
      <button type="button" class="btn btn-secondary" data-action="create-doc" data-type="invoice" data-job="${j.id}">${icon('file', { size: 18 })} Create invoice</button>
    </div>` : '<p class="muted small" data-testid="docs-hidden">Quotes and invoices are made by the office.</p>'}
    ${proofOfWork(j, ui, allow)}
    ${visitPlan(j, ui)}
    ${docs.length && allow('create_documents') ? `<h2 class="section-title">Documents</h2><ul class="list">${docs.map((d) => `<li class="row-card"><a class="row-link" href="#/doc/${d.id}"><span class="row-main"><strong>${docTitle(d.type)} ${d.id}</strong><span class="muted">${prettyDate(d.date)}</span></span><span class="row-side"><strong>${rupees(d.total)}</strong>${icon('arrowRight', { size: 18 })}</span></a></li>`).join('')}</ul>` : ''}
  </section>`;
}
