import { icon } from '../ui/icons.js';
import { rupees, prettyDate, daysBetween, escapeHtml } from '../format.js';
import { dueWithin, moneyAtStake } from '../domain/renewals.js';
import { today } from '../clock.js';

export const HEADLINE = 'Never miss an AMC renewal again';

export function home({ state }) {
  const t = today();
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
    <div class="hero">
      <p class="kicker">For AC, RO and fire-safety service firms</p>
      <h1 id="page-title" tabindex="-1">${HEADLINE}</h1>
      <p class="lede">Your technicians already send voice notes and job-sheet photos on WhatsApp. KaryaHub turns them into job records, quotes and renewal reminders, without anyone opening a dashboard.</p>
      <a class="btn btn-primary btn-lg" href="#/chat" data-testid="see-how">See how it works ${icon('arrowRight')}</a>
    </div>

    <article class="stake-card" aria-labelledby="stake-label" data-testid="money-at-stake">
      <h2 id="stake-label" class="stake-label">Money at stake in the next 90 days</h2>
      <p class="stake-value" data-testid="stake-value" data-amount="${total}">${rupees(total)}</p>
      <p class="stake-sub">${due90.length} AMC contracts at ${escapeHtml(state.settings.business_name)} (demo) end by ${prettyDate(addDaysLabel(t))}. Each one is a renewal you either win or lose.</p>
      <div class="meter" aria-hidden="true">${bar}</div>
      <ul class="meter-legend">${buckets.map((b, i) => `<li><span class="dot seg-${i + 1}"></span>${b.label}<strong>${rupees(b.value)}</strong></li>`).join('')}</ul>
      ${next.length ? `<ul class="next-list" aria-label="Next renewals">${next
        .map((c) => `<li><span>${escapeHtml(c.name)}</span><span class="muted">in ${daysBetween(t, c.amc_expiry)} days</span><strong>${rupees(c.amc_value)}</strong></li>`)
        .join('')}</ul>` : ''}
      <a class="link-arrow" href="#/renewals">See all renewals ${icon('arrowRight', { size: 16 })}</a>
    </article>

    <h2 class="section-title">What goes wrong today</h2>
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
  </section>`;
}
function addDaysLabel(t) {
  const d = new Date(Date.parse(`${t}T00:00:00Z`) + 90 * 86400000);
  return d.toISOString().slice(0, 10);
}
