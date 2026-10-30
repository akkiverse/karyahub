import { icon } from '../ui/icons.js';
import { rupees, prettyDate, daysBetween, escapeHtml } from '../format.js';
import { dueWithin, moneyAtStake } from '../domain/renewals.js';
import { today } from '../clock.js';

export const HEADLINE = 'Never miss an AMC renewal again';

export function home({ state, me }) {
  const t = today();
  const demo = Boolean(state.settings.is_demo);
  const due90 = dueWithin(state.customers, t, 90);
  const total = moneyAtStake(due90);
  const buckets = [
    { label: 'Next 30 days', value: moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '31 to 60', value: moneyAtStake(dueWithin(state.customers, t, 60)) - moneyAtStake(dueWithin(state.customers, t, 30)) },
    { label: '61 to 90', value: total - moneyAtStake(dueWithin(state.customers, t, 60)) },
  ];
  const bar = buckets
    .map((b, i) => `<span class="meter-seg seg-${i + 1}" style="flex-grow:${Math.max(b.value, 1)}" title="${b.label}: ${rupees(b.value)}"></span>`)
    .join('');
  const next = due90.slice(0, 3);
  return `
  <section class="home">
    ${demo ? `    <div class="hero">
      <p class="kicker">For AC, RO and fire-safety service firms</p>
      <h1 id="page-title" tabindex="-1">${HEADLINE}</h1>
      <p class="lede">Your technicians already send voice notes and job-sheet photos on WhatsApp. KaryaHub turns them into job records, quotes and renewal reminders, without anyone opening a dashboard.</p>
      <a class="btn btn-primary btn-lg" href="#/chat" data-testid="see-how">See how it works ${icon('arrowRight')}</a>
    </div>

` : '<h1 id="page-title" class="sr-only" tabindex="-1">Home</h1>'}
    <article class="stake-card" aria-labelledby="stake-label" data-testid="money-at-stake">
      <h2 id="stake-label" class="stake-label">Money at stake in the next 90 days</h2>
      <p class="stake-value" data-testid="stake-value" data-amount="${total}">${rupees(total)}</p>
      <p class="stake-sub">${due90.length} AMC contracts at ${escapeHtml(state.settings.business_name)}${state.settings.is_demo ? ' (demo)' : ''} end by ${prettyDate(addDaysLabel(t))}. Each one is a renewal you either win or lose.</p>
      <div class="meter" aria-hidden="true">${bar}</div>
      <ul class="meter-legend">${buckets.map((b, i) => `<li><span class="dot seg-${i + 1}"></span>${b.label}<strong>${rupees(b.value)}</strong></li>`).join('')}</ul>
      ${next.length ? `<ul class="next-list" aria-label="Next renewals">${next
        .map((c) => `<li><span>${escapeHtml(c.name)}</span><span class="muted">in ${daysBetween(t, c.amc_expiry)} days</span><strong>${rupees(c.amc_value)}</strong></li>`)
        .join('')}</ul>` : ''}
      <a class="link-arrow" href="#/renewals">See all renewals ${icon('arrowRight', { size: 16 })}</a>
    </article>

    <section class="today" aria-labelledby="today-title" data-testid="today-kpis">
      <div class="panel-head"><h2 class="section-title" id="today-title">${me ? `Good to see you, ${escapeHtml(me.name.split(' ')[0])}. ` : ''}Today at ${escapeHtml(state.settings.business_name)}</h2>${demo ? '<span class="muted small">Sample data</span>' : ''}</div>
      <ul class="kpis">
        <li class="kpi"><span class="kpi-label">${icon('jobs', { size: 16 })} Jobs recorded</span><span class="kpi-value" data-kpi="jobs">${state.jobs.length}</span><a class="kpi-sub" href="#/jobs">Open jobs</a></li>
        <li class="kpi"><span class="kpi-label">${icon('shield', { size: 16 })} Waiting for customer check</span><span class="kpi-value" data-kpi="waiting">${state.jobs.filter((j) => (j.state || 'WORK_DONE') === 'WORK_DONE').length}</span><span class="kpi-sub muted">Proof of work pending</span></li>
        <li class="kpi"><span class="kpi-label">${icon('renewals', { size: 16 })} Renewals in 30 days</span><span class="kpi-value" data-kpi="due30">${dueWithin(state.customers, t, 30).length}</span><span class="kpi-sub money">${rupees(buckets[0].value)} at stake</span></li>
        <li class="kpi"><span class="kpi-label">${icon('file', { size: 16 })} Quotes and invoices</span><span class="kpi-value" data-kpi="docs">${state.documents.length}</span><span class="kpi-sub muted">Sent on WhatsApp (simulated)</span></li>
      </ul>
    </section>

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
` : started(state, me)}
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
    <div class="panel-head"><h2 class="section-title" id="start-title">Get started</h2></div>
    <ol class="start-steps">${steps.map(([ic, t, d, href, , cta]) => `<li class="start-step"><span class="problem-icon">${icon(ic)}</span><div><h3>${t}</h3><p class="muted">${d}</p><a class="link-arrow" href="${href}">${cta} ${icon('arrowRight', { size: 16 })}</a></div></li>`).join('')}</ol>
  </section>`;
}
