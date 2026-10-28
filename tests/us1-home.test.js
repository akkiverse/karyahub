import { describe, it, expect, afterEach } from 'vitest';
import { setup, sendSample, digits } from './helpers.js';
import { DEMO_CUSTOMERS } from '../src/data/demo.js';
import { daysBetween } from '../src/format.js';

let t;
afterEach(() => t?.app.unmount());

describe('US-1 Problem story', () => {
  it('AC-1.1: Home shows the headline and three problem cards', () => {
    t = setup();
    expect(t.$('h1').textContent).toBe('Never miss an AMC renewal again');
    const cards = t.$$('[data-testid="problem-cards"] h3').map((h) => h.textContent);
    expect(cards).toEqual(['Lapsed renewals', 'Re-typing job sheets', 'No view of field work']);
  });

  it('AC-1.2: Money at stake in the next 90 days equals the sum of demo AMCs expiring within 90 days', async () => {
    t = setup();
    const expected = DEMO_CUSTOMERS.filter((c) => { const d = daysBetween('2027-01-01', c.amc_expiry); return d >= 0 && d <= 90; }).reduce((s, c) => s + c.amc_value, 0);
    expect(expected).toBe(99100);
    expect(t.$('#stake-label').textContent).toBe('Money at stake in the next 90 days');
    expect(digits(t.$('[data-testid="stake-value"]').textContent)).toBe(expected);
    expect(t.$('[data-testid="stake-value"]').textContent).toBe('₹99,100');
    // The delight moment: approving a new AMC updates the Home total.
    await sendSample(t, 's-ramesh');
    t.click('[data-action="approve"]');
    t.go('#/');
    expect(digits(t.$('[data-testid="stake-value"]').textContent)).toBe(expected + 6500);
  });

  it('AC-1.3: "See how it works" opens the Chat screen', () => {
    t = setup();
    const link = t.$('[data-testid="see-how"]');
    expect(link.textContent).toContain('See how it works');
    expect(link.getAttribute('href')).toBe('#/chat');
    window.location.hash = link.getAttribute('href');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(t.$('[data-testid="chat-phone"]')).not.toBeNull();
    expect(document.title).toContain('Chat');
  });
});
