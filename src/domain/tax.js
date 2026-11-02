// The tax engine's JavaScript copy (CR-0012, ADR-0016), for showing figures while typing.
// The server's backend/karyahub/domain/tax.py is the truth and stores its own figures; this file follows it
// line for line with exact BigInt maths, and both run tests/fixtures/gst_cases.json (AC-27.9).
import STATES from '../../backend/karyahub/domain/india_states.json';

export { STATES };
export const GST_RATES = ['0', '0.25', '3', '5', '18', '40'];
export const REGISTRATIONS = ['regular', 'composition', 'unregistered'];
const MAX_PAISE = 1_000_000_000_000n;
const MAX_QTY = 10_000_000n;

const DECIMAL = /^\d+(\.\d+)?$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const MESSAGES = {
  bad_qty: 'Give a quantity above 0.',
  bad_rate: 'Give a price of 0 or more.',
  bad_gst_rate: 'Pick a GST rate: 0, 0.25, 3, 5, 18 or 40 %.',
  bad_discount: "A discount is 0 to 100 %, or up to the line's amount.",
  bad_bill_discount: "The bill discount is 0 to 100 %, or up to the bill's amount.",
  bad_registration: 'Pick the GST registration: Regular, Composition or Not registered.',
  bad_place: 'Pick the place of supply.',
};

export class TaxInputError extends Error {
  constructor(code, line = null) {
    super(MESSAGES[code]);
    this.code = code;
    this.line = line;
  }
}

/** num ÷ den rounded half up, for num ≥ 0 and den > 0 (BigInt). */
export const halfUp = (num, den) => (2n * num + den) / (2n * den);

/** An exact decimal (a number or text such as "1.5") as a whole BigInt of 10^-places, or null. */
export function scaled(value, places) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const text = String(value).trim();
  if (!DECIMAL.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  if (frac.length > places) return null;
  return BigInt(whole + frac.padEnd(places, '0'));
}

/** 1800n → "18", 25n → "0.25". */
export function rateText(rateCenti) {
  const whole = rateCenti / 100n;
  const frac = rateCenti % 100n;
  return frac === 0n ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`.replace(/0+$/, '');
}

function gstRate(value, line) {
  const rate = scaled(value, 2);
  if (rate === null || !GST_RATES.includes(rateText(rate))) throw new TaxInputError('bad_gst_rate', line);
  return rate;
}

function discountOf(discount, amount, code, line) {
  if (!discount) return 0n;
  if (typeof discount !== 'object' || !['percent', 'amount'].includes(discount.kind)) throw new TaxInputError(code, line);
  if (discount.kind === 'percent') {
    const pct = scaled(discount.value ?? 0, 2);
    if (pct === null || pct > 10_000n) throw new TaxInputError(code, line);
    return halfUp(amount * pct, 10_000n);
  }
  const paise = scaled(discount.value ?? 0, 0);
  if (paise === null || paise > amount) throw new TaxInputError(code, line);
  return paise;
}

/** Spread total over amounts in proportion: shares rounded down, the last line with an amount takes the rest. */
function spread(total, amounts) {
  const shares = amounts.map(() => 0n);
  const base = amounts.reduce((s, a) => s + a, 0n);
  if (total === 0n || base === 0n) return shares;
  const withAmount = amounts.map((a, i) => (a > 0n ? i : -1)).filter((i) => i >= 0);
  for (const i of withAmount.slice(0, -1)) shares[i] = (total * amounts[i]) / base;
  shares[withAmount.at(-1)] = total - shares.reduce((s, a) => s + a, 0n);
  let excess = 0n;
  for (const i of [...withAmount].reverse()) {
    shares[i] += excess;
    excess = shares[i] > amounts[i] ? shares[i] - amounts[i] : 0n;
    shares[i] -= excess;
  }
  return shares;
}

export function taxMode(registration, businessState, placeOfSupply) {
  if (registration === 'composition') return 'composition';
  if (registration === 'unregistered') return 'none';
  return placeOfSupply === businessState ? 'intra' : 'inter';
}

/** Work out a bill's figures (paise as Numbers). Throws TaxInputError for a figure that can't be used. */
export function compute(bill) {
  const registration = bill.registration ?? 'regular';
  if (!REGISTRATIONS.includes(registration)) throw new TaxInputError('bad_registration');
  const businessState = String(bill.business_state || '');
  const place = String(bill.place_of_supply || businessState);
  if (registration === 'regular' && (!(place in STATES) || !(businessState in STATES))) throw new TaxInputError('bad_place');
  const mode = taxMode(registration, businessState, place);
  const taxed = mode === 'intra' || mode === 'inter';

  const work = (bill.lines || []).map((line, i) => {
    const qty = scaled(line.qty, 3);
    if (qty === null || qty <= 0n || qty > MAX_QTY * 1000n) throw new TaxInputError('bad_qty', i);
    const rate = scaled(line.rate, 0);
    if (rate === null || rate > MAX_PAISE) throw new TaxInputError('bad_rate', i);
    const gst = gstRate(line.gst_rate ?? 0, i);
    const amount = halfUp(qty * rate, 1000n);
    return { amount, discount: discountOf(line.discount, amount, 'bad_discount', i), gst, mrp: Boolean(line.price_includes_gst) };
  });

  const after = work.map((w) => w.amount - w.discount);
  const billDiscount = discountOf(bill.bill_discount, after.reduce((s, a) => s + a, 0n), 'bad_bill_discount', null);
  const shares = spread(billDiscount, after);

  const summary = new Map();
  const lines = work.map((w, i) => {
    const net = after[i] - shares[i];
    const taxable = taxed && w.mrp ? halfUp(net * 10_000n, 10_000n + w.gst) : net;
    let cgst = 0n;
    let sgst = 0n;
    let igst = 0n;
    if (mode === 'intra') cgst = sgst = halfUp(taxable * w.gst, 20_000n);
    else if (mode === 'inter') igst = halfUp(taxable * w.gst, 10_000n);
    if (taxed) {
      const row = summary.get(w.gst) || { gst_rate: rateText(w.gst), taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n };
      row.taxable += taxable;
      row.cgst += cgst;
      row.sgst += sgst;
      row.igst += igst;
      summary.set(w.gst, row);
    }
    return { amount: w.amount, line_discount: w.discount, bill_discount: shares[i], taxable, gst_rate: rateText(w.gst), cgst, sgst, igst };
  });

  const sum = (key) => lines.reduce((s, l) => s + l[key], 0n);
  const totals = { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst') };
  const exact = totals.taxable + totals.cgst + totals.sgst + totals.igst;
  const total = halfUp(exact, 100n) * 100n;
  const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));
  return {
    tax_mode: mode,
    place_of_supply: place,
    lines: lines.map(num),
    summary: [...summary.keys()].sort((a, b) => (a < b ? -1 : 1)).map((k) => num(summary.get(k))),
    totals: num({ ...totals, bill_discount: billDiscount, round_off: total - exact, total, in_words: rupeesInWords(Number(total / 100n)) }),
  };
}

// ---------- words, states and GSTIN ----------
const ONES = 'Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen'.split(' ');
const TENS = '_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety'.split(' ');
const belowHundred = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
function belowThousand(n) {
  const parts = n >= 100 ? [`${ONES[Math.floor(n / 100)]} Hundred`] : [];
  if (n % 100) parts.push(belowHundred(n % 100));
  return parts.join(' ');
}

/** Indian style: 2655 → "Two Thousand Six Hundred Fifty-Five"; 100000 → "One Lakh". */
export function numberInWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

export const rupeesInWords = (rupees) => `Rupees ${numberInWords(rupees)} only`;

/** "Maharashtra (27)", as a bill prints the place of supply. */
export const stateLabel = (code) => (STATES[code] ? `${STATES[code]} (${code})` : '');

/** 15 characters in the GSTIN pattern, a known state and the right check character. */
export function gstinOk(gstin) {
  const text = String(gstin || '').trim().toUpperCase();
  if (!GSTIN.test(text) || !(text.slice(0, 2) in STATES)) return false;
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const product = B36.indexOf(text[i]) * (i % 2 ? 2 : 1);
    total += Math.floor(product / 36) + (product % 36);
  }
  return text[14] === B36[(36 - (total % 36)) % 36];
}

export const stateOfGstin = (gstin) => (gstinOk(gstin) ? String(gstin).trim().slice(0, 2) : '');
