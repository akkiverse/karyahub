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
            <span class="row-side"><span class="muted">${j.id} · ${prettyDate(j.date)}</span>${icon('arrowRight', { size: 18 })}</span></a></li>`)
          .join('')}</ul>`
      : `<div class="empty" data-testid="jobs-empty">${icon('jobs', { size: 32 })}<p><strong>No jobs yet, send a sample in Chat</strong></p><a class="btn btn-primary" href="#/chat">Open Chat</a></div>`}
  </section>`;
}

export function job({ state, params, ui }) {
  const j = state.jobs.find((x) => x.id === params.id);
  if (!j) return `<section class="page"><h1 id="page-title" tabindex="-1">Job not found</h1><p>This job isn't in the demo data any more. It may have been cleared by Reset demo.</p><a class="btn btn-ghost" href="#/jobs">Back to Jobs</a></section>`;
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
    <div class="actions">
      <button type="button" class="btn btn-primary" data-action="create-doc" data-type="quote" data-job="${j.id}">${icon('file', { size: 18 })} Create quote</button>
      <button type="button" class="btn btn-secondary" data-action="create-doc" data-type="invoice" data-job="${j.id}">${icon('file', { size: 18 })} Create invoice</button>
    </div>
    ${docs.length ? `<h2 class="section-title">Documents</h2><ul class="list">${docs.map((d) => `<li class="row-card"><a class="row-link" href="#/doc/${d.id}"><span class="row-main"><strong>${docTitle(d.type)} ${d.id}</strong><span class="muted">${prettyDate(d.date)}</span></span><span class="row-side"><strong>${rupees(d.total)}</strong>${icon('arrowRight', { size: 18 })}</span></a></li>`).join('')}</ul>` : ''}
  </section>`;
}
