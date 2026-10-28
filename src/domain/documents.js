export const GST_RATE = 0.18;
const round2 = (n) => Math.round(n * 100) / 100;

export const lineIsValid = (l) => Number.isFinite(Number(l.qty)) && Number(l.qty) > 0 && Number.isFinite(Number(l.rate)) && Number(l.rate) >= 0;

/** GST at 18%, shown as CGST 9% + SGST 9% (intra-state supply), total rounded to the rupee. */
export function computeTotals(lines) {
  const valid = lines.filter(lineIsValid);
  const subtotal = round2(valid.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0));
  const cgst = round2(subtotal * 0.09);
  const sgst = round2(subtotal * 0.09);
  const exact = round2(subtotal + cgst + sgst);
  const total = Math.round(exact);
  return { subtotal, cgst, sgst, roundOff: round2(total - exact), total, invalid: lines.length - valid.length };
}

export function docNumber(type, n) {
  return `${type === 'invoice' ? 'INV' : 'QT'}-2027-${String(n).padStart(4, '0')}`;
}
export const docTitle = (type) => (type === 'invoice' ? 'Invoice' : 'Quotation');
