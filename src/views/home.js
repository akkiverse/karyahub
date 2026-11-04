import { icon } from '../ui/icons.js';
import { rupees, prettyDate, daysBetween, escapeHtml } from '../format.js';
import { dueWithin, moneyAtStake } from '../domain/renewals.js';
import { today, deviceToday } from '../clock.js';
import { billFigures, gstThisMonth } from '../domain/bills.js';
import { W } from '../words.js';
import { homeBills, gstCard, billHref } from './bills.js';
import { sheetHtml } from './renewals.js';

export const HEADLINE = 'Never miss an AMC renewal again';
const STREAM_SIZE = 4;
const WATCH_SIZE = 5;

/** Each technician message with what KaryaHub made of it, newest first. */
function streamOf(state) {
  const all = state.messages || [];
  const out = [];
  all.forEach((m, i) => {
    if (m.from !== 'technician') return;
    const rest = all.slice(i + 1);
    const next = rest.findIndex((x) => x.from === 'technician');
    const mine = next < 0 ? rest : rest.slice(0, next);
    out.push({ m, process: mine.find((x) => x.kind === 'process'), card: mine.find((x) => x.kind === 'card') });
  });
  return out.reverse().slice(0, STREAM_SIZE);
}
const KIND = { voice: ['mic', W.streamVoice], image: ['image', W.streamPhoto], text: ['chat', W.streamText] };

function readStatus({ process, card }) {
  if (card) {
    if (card.status === 'approved') return ['ok', W.streamJobMade];
    return card.reader === 'quick' ? ['warn', W.streamReadNoAi] : ['warn', W.streamToCheck];
  }
  if (process && process.error) return ['bad', W.streamFailed];
  if (process && (process.steps || []).some((s) => s.status === 'running' || s.status === 'pending')) return ['warn', W.streamReading];
  return ['neutral', W.streamNoJob];
}

function streamRow(entry, state, can) {
  const { m, card } = entry;
  const [ic, kind] = KIND[m.kind] || KIND.text;
  const [tone, status] = readStatus(entry);
  const jobId = card && card.status === 'approved' ? card.job_id : '';
  const quote = jobId ? (state.documents || []).find((d) => d.job_id === jobId && d.type === 'quote' && !d.deleted) : null;
  let action = '';
  if (quote && can('create_documents')) action = `<a class="btn btn-ghost btn-small" href="${billHref(quote)}">${icon('file', { size: 16 })} ${W.streamOpenQuote}</a>`;
  else if (jobId && can('create_documents')) action = `<button type="button" class="btn btn-primary btn-small" data-action="create-doc" data-job="${escapeHtml(jobId)}" data-type="quote" data-testid="stream-quote">${icon('file', { size: 16 })} ${W.streamMakeQuote}</button>`;
  else if (card && card.status !== 'approved' && can('use_chat')) action = `<a class="btn btn-secondary btn-small" href="#/chat">${W.streamReview} ${icon('arrowRight', { size: 16 })}</a>`;
  else if (jobId && can('view_jobs')) action = `<a class="btn btn-ghost btn-small" href="#/jobs/${encodeURIComponent(jobId)}">${W.streamOpenJob}</a>`;
  const words = m.kind === 'image' && entry.process && entry.process.transcript ? entry.process.transcript : m.body;
  return `<li class="stream-row" data-testid="stream-row">
    <span class="stream-kind" aria-hidden="true">${icon(ic, { size: 18 })}</span>
    <div class="stream-main">
      <p class="stream-who"><strong>${escapeHtml(m.author || W.streamTechnician)}</strong><span class="muted small">${escapeHtml(kind)} · ${escapeHtml((m.at || '').slice(11, 16))}</span></p>
      <p class="stream-text">${escapeHtml(words || '')}</p>
      <div class="stream-foot"><span class="pill pill-${tone}" data-testid="stream-status">${escapeHtml(status)}</span>${action}</div>
    </div>
  </li>`;
}

function streamCard(state, can) {
  const rows = streamOf(state);
  return `<section class="panel stream" aria-labelledby="stream-title" data-testid="field-stream">
    <div class="panel-head"><h2 class="panel-title" id="stream-title">${W.streamTitle}</h2>${can('use_chat') ? `<a class="link-arrow small" href="#/chat">${W.streamOpen} ${icon('arrowRight', { size: 16 })}</a>` : ''}</div>
    ${rows.length ? `<ul class="stream-list">${rows.map((r) => streamRow(r, state, can)).join('')}</ul>` : `<p class="muted" data-testid="stream-empty">${state.settings.is_demo ? W.streamEmptyDemo : W.streamEmpty}</p>`}
  </section>`;
}

function urgency(days) {
  if (days <= 14) return ['bad', days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`];
  if (days <= 30) return ['warn', `${days} days left`];
  return ['neutral', `${days} days left`];
}

function renewalsCard(state, t, due90, total, buckets) {
  const bar = buckets.map((b, i) => `<span class="meter-seg seg-${i + 1}" style="flex-grow:${Math.max(b.value, 1)}" title="${b.label}: ${rupees(b.value)}"></span>`).join('');
  const watch = due90.slice(0, WATCH_SIZE);
  return `<article class="stake-card" aria-labelledby="stake-label" data-testid="money-at-stake">
    <div class="panel-head"><h2 class="panel-title">${W.renewalsDue}</h2><a class="link-arrow small" href="#/renewals">See all renewals ${icon('arrowRight', { size: 16 })}</a></div>
    <h3 id="stake-label" class="stake-label">Money at stake in the next 90 days</h3>
    <p class="stake-value" data-testid="stake-value" data-amount="${total}">${rupees(total)}</p>
    <p class="stake-sub">${due90.length} AMC contracts at ${escapeHtml(state.settings.business_name)}${state.settings.is_demo ? ' (demo)' : ''} end by ${prettyDate(addDaysLabel(t))}. Each one is a renewal you either win or lose.</p>
    ${total ? `<div class="meter" aria-hidden="true">${bar}</div>
    <ul class="meter-legend">${buckets.map((b, i) => `<li><span class="dot seg-${i + 1}"></span>${b.label}<strong>${rupees(b.value)}</strong></li>`).join('')}</ul>` : ''}
    ${watch.length ? `<ul class="watch" aria-label="Next renewals" data-testid="renewals-watch">${watch.map((c) => {
    const days = daysBetween(t, c.amc_expiry);
    const [tone, left] = urgency(days);
    return `<li class="watch-row" data-customer="${escapeHtml(c.id)}"><span class="watch-main"><strong>${escapeHtml(c.name)}</strong><span class="muted small">${escapeHtml(c.equipment || '')}</span></span><span class="pill pill-${tone}">${left}</span><strong class="watch-value">${rupees(c.amc_value)}</strong><button type="button" class="btn btn-ghost btn-small" data-action="remind" data-id="${escapeHtml(c.id)}" aria-label="${W.remindOn} ${escapeHtml(c.name)}">${icon('bell', { size: 16 })} ${c.reminded_at ? W.remindAgain : W.remind}</button></li>`;
  }).join('')}</ul>` : ''}
  </article>`;
}

function heroCard(state, t, next) {
  return `<div class="hero" data-testid="home-hero">
    <div class="hero-copy">
      <p class="kicker">For AC, RO and fire-safety service firms</p>
      <h1 id="page-title" tabindex="-1">${HEADLINE}</h1>
      <p class="lede">Your technicians already send voice notes and job-sheet photos on WhatsApp. KaryaHub turns them into job records, quotes and renewal reminders, without anyone opening a dashboard.</p>
      <a class="btn btn-primary btn-lg" href="#/chat" data-testid="see-how">See how it works ${icon('arrowRight')}</a>
    </div>
    <div class="hero-side" aria-hidden="true">
      ${next ? `<div class="hero-next"><span class="muted small">Next AMC to renew</span><strong>${escapeHtml(next.name)}</strong><span class="hero-next-when">in ${daysBetween(t, next.amc_expiry)} days · ${rupees(next.amc_value)}</span></div>` : ''}
      <p class="hero-note">Technicians send voice notes on WhatsApp to log the parts they used, and KaryaHub drafts the GST bill.</p>
    </div>
  </div>`;
}

export function home({ state, me, ui = {} }) {
  const t = today();
  const can = (perm) => Boolean(me && (me.permissions || []).includes(perm));
  const demo = Boolean(state.settings.is_demo);
  const billToday = demo ? t : deviceToday();
  const due90 = dueWithin(state.customers, t, 90);
  const total = moneyAtStake(due90);
  const buckets = [
    { label: 'Next 30 days', value: moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '31 to 60', value: moneyAtStake(dueWithin(state.customers, t, 60)) - moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '61 to 90', value: total - moneyAtStake(dueWithin(state.customers, t, 60)) },
  ];
  const todayRow = can('view_jobs') ? `<section class="today" aria-labelledby="today-title" data-testid="today-kpis">
      <div class="panel-head"><h2 class="section-title" id="today-title">${me ? `Good to see you, ${escapeHtml(me.name.split(' ')[0])}. ` : ''}Today at ${escapeHtml(state.settings.business_name)}</h2>${demo ? '<span class="muted small">Sample data</span>' : ''}</div>
      <ul class="kpis">
        <li class="kpi"><span class="kpi-label">${icon('jobs', { size: 16 })} Jobs recorded</span><span class="kpi-value" data-kpi="jobs">${state.jobs.length}</span><a class="kpi-sub" href="#/jobs">Open jobs</a></li>
        <li class="kpi"><span class="kpi-label">${icon('shield', { size: 16 })} Waiting for customer check</span><span class="kpi-value" data-kpi="waiting">${state.jobs.filter((j) => (j.state || 'WORK_DONE') === 'WORK_DONE').length}</span><span class="kpi-sub muted">Proof of work pending</span></li>
        <li class="kpi"><span class="kpi-label">${icon('renewals', { size: 16 })} Renewals in 30 days</span><span class="kpi-value" data-kpi="due30">${dueWithin(state.customers, t, 30).length}</span><span class="kpi-sub money">${rupees(buckets[0].value)} at stake</span></li>
        <li class="kpi"><span class="kpi-label">${icon('file', { size: 16 })} Estimates and bills</span><span class="kpi-value" data-kpi="docs">${state.documents.filter((d) => !d.deleted).length}</span><a class="kpi-sub" href="#/bills">See bills</a></li>
      </ul>
    </section>` : '';
  const left = [
    can('use_chat') || can('view_jobs') ? streamCard(state, can) : '',
    demo ? '' : started(state, me),
    todayRow,
  ].join('');
  const right = [
    can('manage_renewals') ? renewalsCard(state, t, due90, total, buckets) : '',
    can('create_documents') ? gstCard(gstThisMonth(state.documents, billToday), demo) : '',
  ].join('');
  const sheet = ui.sheet && can('manage_renewals') ? sheetHtml(ui.sheet, state) : '';
  return `
  <section class="home">
    ${demo ? heroCard(state, t, due90[0]) : '<h1 id="page-title" class="sr-only" tabindex="-1">Home</h1>'}
    ${can('create_documents') ? homeBills(billFigures(state.documents, billToday), demo) : ''}
    ${left || right ? `<div class="split-12 home-grid">${left ? `<div class="col-7 stack">${left}</div>` : ''}${right ? `<div class="col-5 stack">${right}</div>` : ''}</div>` : ''}

    ${demo ? `    <h2 class="section-title">What goes wrong today</h2>
    <ul class="problems" data-testid="problem-cards">
      <li class="problem">
        <span class="problem-icon">${icon('renewals')}</span>
        <h3>Lapsed renewals</h3>
        <p>AMC expiry dates live in a register or someone's head. When nobody calls in time, the customer quietly goes to another firm.</p>
      </li>
      <li class="problem">
        <span class="problem-icon">${icon('jobs')}</span>
        <h3>Re-typing job sheets</h3>
        <p>Technicians send voice notes and blurry photos. The office re-types them into Excel or billing software, late and with mistakes.</p>
      </li>
      <li class="problem">
        <span class="problem-icon">${icon('eyeOff')}</span>
        <h3>No view of field work</h3>
        <p>The owner can't see which jobs were done today, what was charged, or which customers are due, without phoning everyone.</p>
      </li>
    </ul>
` : ''}
    ${sheet}
  </section>`;
}
function addDaysLabel(t) {
  const d = new Date(Date.parse(`${t}T00:00:00Z`) + 90 * 86400000);
  return d.toISOString().slice(0, 10);
}

/** A real business with nothing recorded yet: three plain steps instead of a sales page. */
function started(state, me) {
  if (state.jobs.length) return '';
  const steps = [
    ['users', 'Add your team', 'Add technicians and office staff with their mobile numbers, one by one or from a file.', '#/admin', 'manage_team', 'Open Admin'],
    ['chat', 'Send the first job report', 'Type a technician\'s message in Chat and review the job KaryaHub reads from it.', '#/chat', 'use_chat', 'Open Chat'],
    ['settings', 'Check your business details', 'Your name, address and GSTIN appear on every quote, invoice and reminder.', '#/settings', 'manage_settings', 'Open Settings'],
  ].filter((x) => (me && me.permissions || []).includes(x[4]));
  if (!steps.length) return '';
  return `<section class="panel" data-testid="get-started" aria-labelledby="start-title">
    <div class="panel-head"><h2 class="panel-title" id="start-title">Get started</h2></div>
    <ol class="start-steps">${steps.map(([ic, t, d, href, , cta]) => `<li class="start-step"><span class="start-icon">${icon(ic, { size: 18 })}</span><div><h3>${t}</h3><p class="muted">${d}</p><a class="link-arrow" href="${href}">${cta} ${icon('arrowRight', { size: 16 })}</a></div></li>`).join('')}</ol>
  </section>`;
}
