import { daysBetween } from '../format.js';

/** Customers whose AMC ends between today and today + days (inclusive), soonest first. */
export function dueWithin(customers, today, days) {
  return customers
    .filter((c) => c.amc_expiry && daysBetween(today, c.amc_expiry) >= 0 && daysBetween(today, c.amc_expiry) <= days)
    .sort((a, b) => a.amc_expiry.localeCompare(b.amc_expiry));
}
/** Customers whose AMC ended before today, most recent first. */
export function lapsed(customers, today) {
  return customers.filter((c) => c.amc_expiry && daysBetween(today, c.amc_expiry) < 0).sort((a, b) => b.amc_expiry.localeCompare(a.amc_expiry));
}
export const moneyAtStake = (list) => list.reduce((sum, c) => sum + (Number(c.amc_value) || 0), 0);

export function reminderText(customer, business, today) {
  const first = customer.name.split(' ')[0];
  const ended = daysBetween(today, customer.amc_expiry) < 0;
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${customer.amc_expiry}T00:00:00Z`));
  const value = `₹${new Intl.NumberFormat('en-IN').format(customer.amc_value)}`;
  return ended
    ? `Namaste ${first} ji, your AC maintenance contract (AMC) with ${business} ended on ${date}. Reply YES to renew it for ${value} and we will book your next service visit. - ${business}`
    : `Namaste ${first} ji, your AC maintenance contract (AMC) with ${business} ends on ${date}. Reply YES to renew it for ${value} and keep your ${customer.equipment} serviced on time. - ${business}`;
}
