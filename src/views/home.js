import { icon } from '../ui/icons.js';
import { rupees, prettyDate, prettyPhone, daysBetween, escapeHtml } from '../format.js';
import { dueWithin, moneyAtStake } from '../domain/renewals.js';
import { today as demoDate, deviceToday } from '../clock.js';
import { billFigures, billList, gstThisMonth, isV2, numberText, statusOf, totalOf } from '../domain/bills.js';
import { summary } from '../domain/inventory.js';
import { jobRef } from '../ids.js';
import { W } from '../words.js';
import { homeBills, gstCard, billHref, statusChip } from './bills.js';
import { sheetHtml } from './renewals.js';

export const HEADLINE = 'Bill, track stock, and manage field jobs';
const STREAM_SIZE = 4;
const WATCH_SIZE = 5;
const RECENT_SIZE = 6;
const KANBAN_SIZE = 6;
const e = escapeHtml;

// ---------- the hero banner ----------
const STEPS = [[W.heroStep1, W.heroStep1Sub], [W.heroStep2, W.heroStep2Sub], [W.heroStep3, W.heroStep3Sub]];

function heroSide(state, t, due90, can) {
  if (!can('manage_renewals')) return `<p class="hero-note">${W.heroNote}</p>`;
  const next = due90[0];
  const dots = due90.slice(0, 4);
  const reminded = dots.filter((c) => c.reminded_at).length;
  return `<div class="hero-side" data-testid="hero-side">
    <div class="hero-next"><span><span class="hero-next-label">${W.heroPriority}</span><strong class="hero-next-when">${next ? `in ${daysBetween(t, next.amc_expiry)} days` : W.heroNothingDue}</strong></span>${next ? `<span class="pill pill-ok">${e(next.name)}${next.equipment ? ` · ${e(next.equipment)}` : ''}</span>` : ''}</div>
    <div class="hero-lower">
      <p class="hero-note">${W.heroNote}</p>
      <a class="hero-remind" href="#/renewals"><span class="hero-remind-tick" aria-hidden="true">${icon('check', { size: 22 })}</span><span class="hero-dots" aria-hidden="true">${dots.map((c) => `<i class="${c.reminded_at ? 'is-on' : ''}"></i>`).join('')}</span><span class="hero-remind-name">${W.heroReminders}</span><span class="sr-only">${reminded} of ${dots.length} next renewals reminded</span></a>
    </div>
  </div>`;
}

function hero({ state, t, due90, can, demo, view }) {
  const field = can('use_chat') || can('view_jobs');
  return `<section class="hero" data-testid="home-hero">
    <div class="hero-top"><span class="hero-badge">${icon('sparkle', { size: 14 })} ${W.heroBadge}</span><button type="button" class="hero-hide" data-action="home-hero" data-hide="true" data-testid="hero-hide">${W.heroHide}</button></div>
    <div class="hero-body">
      <div class="hero-copy">
        <h1 id="page-title" tabindex="-1">${field ? HEADLINE : W.heroHeadlineNoField} <span class="hero-fade">${W.heroFade}</span></h1>
        <p class="lede">${field ? W.heroLede : W.heroLedeNoField}</p>
        <div class="actions">
          ${can('create_documents') ? `<a class="btn btn-primary btn-lg" href="#/bills/new" data-testid="hero-new-bill">${W.heroNewBill} ${icon('arrowRight', { size: 18 })}</a>
          <button type="button" class="btn btn-dark btn-lg" data-action="home-view" data-view="${view === 'kanban' ? 'table' : 'kanban'}" data-scroll="true" data-testid="hero-view">${icon('jobs', { size: 18 })} ${view === 'kanban' ? W.heroToTable : W.heroToKanban}</button>` : ''}
          ${demo ? `<a class="btn btn-ghost btn-lg" href="#/chat" data-testid="see-how">See how it works ${icon('arrowRight', { size: 18 })}</a>` : ''}
        </div>
      </div>
      ${field ? heroSide(state, t, due90, can) : ''}
    </div>
    ${field ? `<ol class="hero-steps">${STEPS.map(([a, b], i) => `<li><span class="hero-step-no" aria-hidden="true">${i + 1}</span><span><strong>${a}</strong><span class="hero-step-sub">${b}</span></span></li>`).join('')}</ol>` : ''}
  </section>`;
}

// ---------- recent bills and job sheets, as a table or a board ----------
function jobTotal(job) {
  return (job.lines || []).reduce((sum, l) => sum + Math.round(Number(l.qty || 1) * Number(l.rate || 0) * 100), 0);
}
function linesText(lines) {
  const list = lines || [];
  if (!list.length) return '';
  return `${list[0].description || ''}${list.length > 1 ? ` + ${list.length - 1} more` : ''}`;
}
const dayLabel = (iso, today) => {
  if (!iso) return '';
  const days = daysBetween(iso, today);
  if (days === 0) return W.today;
  if (days === 1) return W.yesterday;
  return prettyDate(iso);
};

/** Bills, and jobs that have no bill or estimate yet, newest first. */
function recentEntries(state, today, can) {
  const docs = state.documents || [];
  const bills = billList(docs, { kind: 'invoice' }, today).rows.map((d) => ({
    id: d.id, kind: 'bill', doc: d, status: statusOf(d, today), date: d.date, number: numberText(d), name: (d.customer || {}).name || '', phone: (d.customer || {}).phone || '', what: linesText(d.lines), total: totalOf(d), href: billHref(d),
  }));
  const jobs = !can('view_jobs') ? [] : (state.jobs || []).filter((j) => !docs.some((d) => d.job_id === j.id && !d.deleted)).map((j) => ({
    id: j.id, kind: 'job', status: 'to_bill', date: j.date, number: jobRef(state, j.id), name: j.customer_name || '', phone: j.phone || '', what: j.work_done || linesText(j.lines), total: jobTotal(j), href: `#/jobs/${encodeURIComponent(j.id)}`,
  }));
  return [...bills, ...jobs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
const chipOf = (entry) => (entry.kind === 'job' ? `<span class="pill pill-neutral">${W.toBill}</span>` : statusChip(entry.status));

function rowAction(entry, can, demo) {
  if (!can('create_documents')) return '';
  if (entry.kind === 'job') return `<button type="button" class="btn btn-ghost btn-small" data-action="create-doc" data-job="${e(entry.id)}" data-type="invoice" data-testid="recent-bill">${W.billIt}</button>`;
  const d = entry.doc;
  if (isV2(d) && d.number && ['saved', 'sent', 'paid', 'overdue'].includes(entry.status)) return `<button type="button" class="btn btn-ghost btn-small row-send" data-action="bill-send" data-doc="${e(d.id)}" data-testid="recent-share" aria-label="${W.sendOn} ${e(d.number)}">${W.share}</button>`;
  return `<a class="btn btn-ghost btn-small" href="${entry.href}">${W.open}</a>`;
}

function recentTable(entries, today, can, demo) {
  const rows = entries.slice(0, RECENT_SIZE);
  const cards = rows.map((x) => `<li class="row-card"><a class="row-link" href="${x.href}" data-testid="recent-row"><span class="row-main"><strong class="mono">${e(x.number)}</strong><span class="muted">${e(x.name)} · ${e(dayLabel(x.date, today))}</span></span><span class="row-side"><strong class="mono">${x.total === null ? '' : rupees(x.total / 100)}</strong>${chipOf(x)}</span></a></li>`).join('');
  const table = rows.map((x) => `<tr data-entry="${e(x.id)}"><td><a class="cell-main mono row-name" href="${x.href}">${e(x.number)}</a><span class="cell-sub">${e(dayLabel(x.date, today))}</span></td><td><span class="cell-main">${e(x.name)}</span>${x.phone ? `<span class="cell-sub mono">${e(prettyPhone(x.phone))}</span>` : ''}</td><td class="col-items"><span class="clip">${e(x.what)}</span></td><td class="num"><strong class="mono">${x.total === null ? '' : rupees(x.total / 100)}</strong></td><td>${chipOf(x)}</td><td class="num">${rowAction(x, can, demo)}</td></tr>`).join('');
  return `<ul class="list bill-cards" data-testid="recent-cards">${cards}</ul>
    <div class="table-wrap"><table class="bill-table recent-table" data-testid="recent-table"><thead><tr><th scope="col">${W.colBillNo}</th><th scope="col">${W.customer}</th><th scope="col" class="col-items">${W.colJobItems}</th><th scope="col" class="num">${W.colAmount}</th><th scope="col">Status</th><th scope="col" class="num">${W.colShare}</th></tr></thead><tbody>${table}</tbody></table></div>`;
}

function recentBoard(entries, today, can) {
  const groups = [
    ...(can('view_jobs') ? [['to_bill', W.toBill, (x) => x.kind === 'job']] : []),
    ['draft', W.draft, (x) => x.status === 'draft'],
    ['unpaid', W.chipUnpaid, (x) => x.status === 'saved' || x.status === 'sent'],
    ['overdue', W.overdue, (x) => x.status === 'overdue'],
    ['paid', W.paid, (x) => x.status === 'paid'],
  ];
  return `<div class="kanban" data-testid="recent-board" tabindex="0" role="group" aria-label="${W.viewKanban}">${groups.map(([key, label, test]) => {
    const list = entries.filter(test);
    const sum = list.reduce((s, x) => s + (x.total || 0), 0);
    return `<section class="kan-col kan-${key}" data-column="${key}" aria-label="${label}">
      <header class="kan-head"><span class="kan-title">${label} <span class="kan-count">${list.length}</span></span><span class="kan-sum mono">${rupees(sum / 100)}</span></header>
      ${list.length ? `<ul class="kan-list">${list.slice(0, KANBAN_SIZE).map((x) => `<li><a class="kan-card" href="${x.href}" data-testid="kan-card"><span class="kan-top"><strong class="mono">${e(x.number)}</strong><strong class="mono">${x.total === null ? '' : rupees(x.total / 100)}</strong></span><span class="kan-name">${e(x.name)}</span>${x.what ? `<span class="kan-what">${e(x.what)}</span>` : ''}<span class="kan-date">${e(dayLabel(x.date, today))}</span></a></li>`).join('')}</ul>${list.length > KANBAN_SIZE ? `<a class="kan-more" href="#/bills">+ ${list.length - KANBAN_SIZE} more</a>` : ''}` : `<p class="kan-empty">${W.kanEmpty}</p>`}
    </section>`;
  }).join('')}</div>`;
}

function recentPanel({ state, today, can, demo, view }) {
  const entries = recentEntries(state, today, can);
  const seg = (v, label) => `<button type="button" class="seg ${view === v ? 'is-active' : ''}" data-action="home-view" data-view="${v}" aria-pressed="${view === v}">${label}</button>`;
  const title = can('view_jobs') ? W.recentTitle : W.recentTitleNoJobs;
  return `<section class="panel recent" id="home-recent" aria-labelledby="recent-title" data-testid="home-recent">
    <div class="recent-head">
      <div><h2 class="panel-title" id="recent-title">${title}</h2><p class="muted small">${W.recentSub}</p></div>
      <div class="recent-tools"><div class="segs" role="group" aria-label="${W.viewAs}" data-testid="recent-switch">${seg('table', W.viewTable)}${seg('kanban', W.viewKanban)}</div><a class="btn btn-ghost btn-small" href="#/bills">${W.allBills} ${icon('arrowRight', { size: 16 })}</a></div>
    </div>
    ${entries.length ? (view === 'kanban' ? recentBoard(entries, today, can) : recentTable(entries, today, can, demo)) : `<p class="muted" data-testid="recent-empty">${W.recentEmpty}</p>`}
  </section>`;
}

// ---------- the right-hand column ----------
function checklist(state, me, ui, can) {
  const s = state.settings;
  const biz = me.business || {};
  const team = ui.homeTeam; // how many people the business has, when known
  const steps = [
    can('manage_team') && { done: team > 1, title: W.checkTeam, text: W.checkTeamSub, href: '#/admin', cta: W.checkTeamCta },
    can('manage_settings') && { done: Boolean(s.business_name && s.address && (s.gstin || biz.gst_registration === 'unregistered')), title: W.checkBusiness, text: W.checkBusinessSub, href: '#/settings', cta: W.checkBusinessCta },
    can('manage_settings') && can('use_chat') && { done: false, title: W.checkWhatsapp, text: W.checkWhatsappSub, href: '#/settings', cta: W.checkWhatsappCta }, // done once K6 connects a number
  ].filter(Boolean);
  if (!steps.length || steps.every((x) => x.done)) return '';
  const done = steps.filter((x) => x.done).length;
  return `<section class="panel checklist" data-testid="get-started" aria-labelledby="start-title">
    <div class="panel-head"><h2 class="panel-title" id="start-title">${W.checkTitle}</h2><span class="pill pill-ok" data-testid="check-count">${done} of ${steps.length} done</span></div>
    <ol class="check-list">${steps.map((x, i) => `<li class="check-item ${x.done ? 'is-done' : ''}" data-done="${x.done}"><span class="check-dot" aria-hidden="true">${x.done ? icon('check', { size: 14 }) : i + 1}</span><div><h3>${x.title}${x.done ? '<span class="sr-only"> (done)</span>' : ''}</h3><p class="muted small">${x.text}</p>${x.done ? '' : `<a class="link-arrow small" href="${x.href}">${x.cta} ${icon('arrowRight', { size: 14 })}</a>`}</div></li>`).join('')}</ol>
  </section>`;
}

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
  const docOf = (type) => (jobId ? (state.documents || []).find((d) => d.job_id === jobId && d.type === type && !d.deleted) : null);
  const bill = docOf('invoice');
  const quote = docOf('quote');
  let action = '';
  if (jobId && can('create_documents')) {
    if (bill) action = `<a class="link-arrow small" href="${billHref(bill)}">${W.streamOpenBill} ${icon('arrowRight', { size: 14 })}</a>`;
    else if (quote) action = `<a class="link-arrow small" href="${billHref(quote)}">${W.streamOpenQuote} ${icon('arrowRight', { size: 14 })}</a>`;
    else action = `<button type="button" class="link-arrow small link-plain" data-action="create-doc" data-job="${e(jobId)}" data-type="invoice" data-testid="stream-bill">${icon('file', { size: 14 })} ${W.streamMakeBill} ${icon('arrowRight', { size: 14 })}</button><button type="button" class="link-arrow small link-plain link-quiet" data-action="create-doc" data-job="${e(jobId)}" data-type="quote" data-testid="stream-quote">${W.streamMakeQuote}</button>`;
  } else if (card && card.status !== 'approved' && can('use_chat')) action = `<a class="link-arrow small" href="#/chat">${W.streamReview} ${icon('arrowRight', { size: 14 })}</a>`;
  else if (jobId && can('view_jobs')) action = `<a class="link-arrow small" href="#/jobs/${encodeURIComponent(jobId)}">${W.streamOpenJob} ${icon('arrowRight', { size: 14 })}</a>`;
  const words = m.kind === 'image' && entry.process && entry.process.transcript ? entry.process.transcript : m.body;
  return `<li class="stream-row" data-testid="stream-row">
    <p class="stream-who"><strong>${e(m.author || W.streamTechnician)}</strong><span class="muted small">${e((m.at || '').slice(11, 16))}</span></p>
    <p class="stream-text">${e(words || '')}</p>
    <div class="stream-foot"><span class="stream-kind small muted">${icon(ic, { size: 14 })} ${e(kind)}</span><span class="pill pill-${tone}" data-testid="stream-status">${e(status)}</span></div>
    ${action ? `<div class="stream-acts">${action}</div>` : ''}
  </li>`;
}

function streamCard(state, can) {
  const rows = streamOf(state);
  return `<section class="panel stream" aria-labelledby="stream-title" data-testid="field-stream">
    <div class="panel-head"><h2 class="panel-title" id="stream-title">${W.streamTitle}</h2>${can('use_chat') ? `<a class="link-arrow small" href="#/chat">${W.streamOpen} ${icon('arrowRight', { size: 14 })}</a>` : ''}</div>
    ${rows.length ? `<ul class="stream-list">${rows.map((r) => streamRow(r, state, can)).join('')}</ul>` : `<p class="muted" data-testid="stream-empty">${state.settings.is_demo ? W.streamEmptyDemo : W.streamEmpty}</p>`}
  </section>`;
}

// ---------- AMC renewals ----------
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
    <p class="stake-sub">${due90.length} AMC contracts at ${e(state.settings.business_name)}${state.settings.is_demo ? ' (demo)' : ''} end by ${prettyDate(addDaysLabel(t))}. Each one is a renewal you either win or lose.</p>
    ${total ? `<div class="meter" aria-hidden="true">${bar}</div>
    <ul class="meter-legend">${buckets.map((b, i) => `<li><span class="dot seg-${i + 1}"></span>${b.label}<strong>${rupees(b.value)}</strong></li>`).join('')}</ul>` : ''}
    ${watch.length ? `<ul class="watch" aria-label="Next renewals" data-testid="renewals-watch">${watch.map((c) => {
    const days = daysBetween(t, c.amc_expiry);
    const [tone, left] = urgency(days);
    return `<li class="watch-row" data-customer="${e(c.id)}"><span class="watch-main"><strong>${e(c.name)}</strong><span class="muted small">${e(c.equipment || '')}</span></span><span class="pill pill-${tone}">${left}</span><strong class="watch-value">${rupees(c.amc_value)}</strong><button type="button" class="btn btn-ghost btn-small" data-action="remind" data-id="${e(c.id)}" aria-label="${W.remindOn} ${e(c.name)}">${icon('bell', { size: 16 })} ${c.reminded_at ? W.remindAgain : W.remind}</button></li>`;
  }).join('')}</ul>` : ''}
  </article>`;
}

// ---------- the page ----------
export function home({ state, me, ui = {} }) {
  const t = demoDate();
  const can = (perm) => Boolean(me && (me.permissions || []).includes(perm));
  const demo = Boolean(state.settings.is_demo);
  const billToday = demo ? t : deviceToday();
  const view = ui.homeView === 'kanban' ? 'kanban' : 'table';
  const due90 = dueWithin(state.customers, t, 90);
  const total = moneyAtStake(due90);
  const buckets = [
    { label: 'Next 30 days', value: moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '31 to 60', value: moneyAtStake(dueWithin(state.customers, t, 60)) - moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '61 to 90', value: total - moneyAtStake(dueWithin(state.customers, t, 60)) },
  ];
  const stock = can('manage_inventory') ? summary(state) : null;
  const recent = can('create_documents') ? recentPanel({ state, today: billToday, can, demo, view }) : '';
  const todayRow = can('view_jobs') ? `<section class="today" aria-labelledby="today-title" data-testid="today-kpis">
      <div class="panel-head"><h2 class="section-title" id="today-title">${me ? `Good to see you, ${e(me.name.split(' ')[0])}. ` : ''}Today at ${e(state.settings.business_name)}</h2>${demo ? '<span class="muted small">Sample data</span>' : ''}</div>
      <ul class="kpis">
        <li class="kpi"><span class="kpi-label">${icon('jobs', { size: 16 })} Jobs recorded</span><span class="kpi-value" data-kpi="jobs">${state.jobs.length}</span><a class="kpi-sub" href="#/jobs">Open jobs</a></li>
        <li class="kpi"><span class="kpi-label">${icon('shield', { size: 16 })} Waiting for customer check</span><span class="kpi-value" data-kpi="waiting">${state.jobs.filter((j) => (j.state || 'WORK_DONE') === 'WORK_DONE').length}</span><span class="kpi-sub muted">Proof of work pending</span></li>
        <li class="kpi"><span class="kpi-label">${icon('renewals', { size: 16 })} Renewals in 30 days</span><span class="kpi-value" data-kpi="due30">${dueWithin(state.customers, t, 30).length}</span><span class="kpi-sub money">${rupees(buckets[0].value)} at stake</span></li>
        <li class="kpi"><span class="kpi-label">${icon('file', { size: 16 })} Estimates and bills</span><span class="kpi-value" data-kpi="docs">${state.documents.filter((d) => !d.deleted).length}</span><a class="kpi-sub" href="#/bills">See bills</a></li>
      </ul>
    </section>` : '';
  // The board needs the width, so it takes the whole row; the table sits beside the checklist as in the design.
  const left = [
    view === 'table' ? recent : '',
    can('manage_renewals') ? renewalsCard(state, t, due90, total, buckets) : '',
    todayRow,
  ].join('');
  const right = [
    checklist(state, me, ui, can),
    can('use_chat') || can('view_jobs') ? streamCard(state, can) : '',
    can('create_documents') ? gstCard(gstThisMonth(state.documents, billToday), demo) : '',
  ].join('');
  const sent = ui.bills && ui.bills.notice && !ui.bills.notice.undo ? ui.bills.notice : null;
  const sheet = ui.sheet && can('manage_renewals') ? sheetHtml(ui.sheet, state) : '';
  return `
  <section class="home">
    ${ui.heroHidden ? `<div class="hero-shown"><h1 id="page-title" class="sr-only" tabindex="-1">Home</h1><button type="button" class="hero-hide" data-action="home-hero" data-hide="false" data-testid="hero-show">${W.heroShow}</button></div>` : hero({ state, t, due90, can, demo, view })}
    ${sent ? `<p class="notice ${sent.error ? 'notice-error' : ''}" role="status" data-testid="bills-notice">${e(sent.text)}</p>` : ''}
    ${can('create_documents') ? homeBills(billFigures(state.documents, billToday), demo, stock) : ''}
    ${view === 'kanban' ? recent : ''}
    ${left || right ? `<div class="split-12 home-grid">${left ? `<div class="col-8 stack">${left}</div>` : ''}${right ? `<div class="col-4 stack">${right}</div>` : ''}</div>` : ''}

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
