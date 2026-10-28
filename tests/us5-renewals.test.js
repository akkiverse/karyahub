import { describe, it, expect, afterEach } from 'vitest';
import { setup, digits } from './helpers.js';
import { DEMO_CUSTOMERS } from '../src/data/demo.js';

let t;
afterEach(() => t?.app.unmount());
const names = () => t.$$('[data-testid="renewals-list"] .renewal-main > strong').map((s) => s.textContent);
const filter = (f) => t.click(`[data-action="filter"][data-filter="${f}"]`);

describe('US-5 Renewals and reminders', () => {
  it('AC-5.1: the 30-day filter lists only customers expiring by 2027-01-31, soonest first', () => {
    t = setup({ hash: '#/renewals' });
    filter('30');
    const expected = DEMO_CUSTOMERS.filter((c) => c.amc_expiry >= '2027-01-01' && c.amc_expiry <= '2027-01-31').sort((a, b) => a.amc_expiry.localeCompare(b.amc_expiry)).map((c) => c.name);
    expect(expected.length).toBeGreaterThan(0);
    expect(names()).toEqual(expected);
  });

  it('AC-5.2: with the 90-day filter, Money at stake equals the sum of listed AMC values', () => {
    t = setup({ hash: '#/renewals' });
    filter('90');
    const listed = t.$$('[data-testid="renewals-list"] .amount').map((a) => digits(a.textContent));
    expect(listed.length).toBe(8);
    const total = digits(t.$('[data-testid="renewals-total"] strong').textContent);
    expect(total).toBe(listed.reduce((s, v) => s + v, 0));
    expect(total).toBe(99100);
  });

  it('AC-5.3: a customer whose AMC expired before today appears under Lapsed with a red label', () => {
    t = setup({ hash: '#/renewals' });
    expect(names()).not.toContain('Shree Ganesh Traders');
    filter('lapsed');
    expect(names()).toEqual(['Pooja Menon', 'Shree Ganesh Traders']);
    const label = t.$('[data-testid="lapsed-label"]');
    expect(label.textContent).toContain('Lapsed');
    expect(label.classList.contains('label-lapsed')).toBe(true);
    expect(t.$('.renewal').classList.contains('is-lapsed')).toBe(true);
  });

  it('AC-5.4: Send reminder previews the customer-side WhatsApp text and marks the customer "Reminded (demo)"', async () => {
    t = setup({ hash: '#/renewals' });
    t.click('[data-action="remind"][data-id="c01"]');
    await new Promise((r) => setTimeout(r, 0));
    const text = t.$('[data-testid="reminder-text"]').textContent;
    expect(text).toContain('Anita');
    expect(text).toContain('9 January 2027');
    expect(t.$('[data-testid="reminder-sheet"]').textContent).toContain('No message was sent');
    t.click('[data-action="close-sheet"]');
    expect(t.$('[data-customer="c01"] [data-testid="reminded"]').textContent).toContain('Reminded (demo)');
    expect(t.app.store.get().customers.find((c) => c.id === 'c01').reminded_at).toBe('2027-01-01');
  });
});
