const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** ₹ in Indian grouping, e.g. 100000 -> "₹1,00,000". */
export const rupees = (n) => `₹${inr.format(Math.round(Number(n) || 0))}`;
export const rupeesExact = (n) => `₹${inr2.format(Number(n) || 0)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
export function isValidISO(iso) {
  const p = parseISO(iso);
  if (!p) return false;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return dt.getUTCFullYear() === p.y && dt.getUTCMonth() === p.m - 1 && dt.getUTCDate() === p.d;
}
export function dayNumber(iso) {
  const p = parseISO(iso);
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86400000 : NaN;
}
export const daysBetween = (fromIso, toIso) => dayNumber(toIso) - dayNumber(fromIso);
export function addDays(iso, n) {
  const dt = new Date(dayNumber(iso) * 86400000 + n * 86400000);
  return dt.toISOString().slice(0, 10);
}
export function prettyDate(iso) {
  const p = parseISO(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : '';
}
export function prettyPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone || '';
}
export const duration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
