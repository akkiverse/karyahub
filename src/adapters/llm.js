// LLM adapter. Interface: extractJob(text) -> Promise<{ found, job?, missing? }>, readImage(media) -> Promise<{ text }>
import { AdapterError, READ_FAILED, notConfigured } from './errors.js';
import { configuredKeys } from '../config.js';
import { SAMPLES } from '../data/demo.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const BRANDS = ['Voltas', 'Daikin', 'LG', 'Samsung', 'Blue Star', 'Carrier', 'Hitachi', 'Lloyd', 'Panasonic', 'Whirlpool', 'Godrej', "O'General", 'Haier', 'Mitsubishi'];
const WORK = [
  [/gas (refill|charging|top.?up)/i, 'Gas refill'],
  [/(install|installation)/i, 'Installation'],
  [/(filter )?clean(ing)?|wet service|jet wash/i, 'Cleaning and service'],
  [/(pcb|repair|fix|capacitor|compressor)/i, 'Repair'],
  [/(service|servicing|maintenance)/i, 'General service'],
];
const pad = (n) => String(n).padStart(2, '0');

/** Heuristic extraction used by the mock LLM for free text. The live LLM replaces this. */
export function heuristicExtract(text) {
  const t = String(text || '');
  const nameMatch =
    /\b(?:for|at|visited|customer[:\s]+|cust[:\s]+|mr\.?|mrs\.?|ms\.?|shri|smt\.?)\s*(?:(?:mr|mrs|ms|dr)\.?\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})/.exec(t) ||
    /^([A-Z][a-z]+\s[A-Z][a-z]+)\b/.exec(t);
  const name = nameMatch ? nameMatch[1].replace(/^(Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+/, '').replace(/\s(Ji|Sir|Madam)$/i, '') : '';
  const digits = (t.match(/(?:\+?91[\s-]?)?(\d[\d\s-]{8,13}\d)/g) || []).map((p) => p.replace(/\D/g, '').slice(-10)).find((d) => d.length === 10 && /^[6-9]/.test(d));
  const brand = BRANDS.find((b) => new RegExp(`\\b${b.replace("'", "'?")}\\b`, 'i').test(t));
  const tons = /(\d(?:\.\d)?)\s*(?:t\b|ton|tonne)/i.exec(t);
  const kind = /window/i.test(t) ? 'window AC' : /cassette/i.test(t) ? 'cassette AC' : 'split AC';
  const equipment = brand || tons ? [brand, tons ? `${tons[1]}T` : '', kind].filter(Boolean).join(' ') : '';
  const work = (WORK.find(([re]) => re.test(t)) || [null, ''])[1];
  let expiry = '';
  const d1 = /till\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i.exec(t);
  const d2 = /till\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i.exec(t);
  if (d1 && MONTHS[d1[2].toLowerCase()]) expiry = `${d1[3]}-${pad(MONTHS[d1[2].toLowerCase()])}-${pad(d1[1])}`;
  else if (d2) expiry = `${d2[3].length === 2 ? `20${d2[3]}` : d2[3]}-${pad(d2[2])}-${pad(d2[1])}`;
  const amc = /amc[^.]*?(?:rs\.?|₹|value|for|,)\s*([\d,]{3,})/i.exec(t);
  const charge = /(?:charge|charged|rs\.?|₹)\s*([\d,]{3,})/i.exec(t);
  const lines = [];
  if (work && charge) lines.push({ description: equipment ? `${work}, ${equipment}` : work, qty: 1, rate: Number(charge[1].replace(/,/g, '')) });
  if (!name) return { found: false, missing: ['customer_name'] };
  return {
    found: true,
    job: {
      customer_name: name,
      phone: digits || '',
      area: (/\bin\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(t) || [])[1] || '',
      equipment,
      work_done: work || 'Service visit',
      parts: '',
      amc_expiry: expiry,
      amc_value: amc ? Number(amc[1].replace(/,/g, '')) : 0,
      lines: lines.length ? lines : [{ description: work || 'Service visit', qty: 1, rate: 0 }],
    },
  };
}

export const mockLlm = {
  name: 'mock',
  async extractJob(text, { fail = false } = {}) {
    if (fail) throw new AdapterError(READ_FAILED, { service: 'LLM', code: 'simulated_failure' });
    const sample = SAMPLES.find((s) => s.mock_transcript === text);
    if (sample) return { found: true, job: JSON.parse(JSON.stringify(sample.mock_extraction)) };
    return heuristicExtract(text);
  },
  async readImage(media, { fail = false } = {}) {
    if (fail) throw new AdapterError(READ_FAILED, { service: 'LLM', code: 'simulated_failure' });
    if (!media || !media.mock_transcript) throw new AdapterError(READ_FAILED, { service: 'LLM', code: 'no_image' });
    return { text: media.mock_transcript };
  },
};

export const liveLlm = {
  name: 'live',
  async extractJob() {
    if (!configuredKeys.LLM_API_KEY) throw notConfigured('LLM');
    throw new AdapterError('The live LLM adapter is not part of the demo build.', { service: 'LLM', code: 'not_built' });
  },
  async readImage() {
    if (!configuredKeys.LLM_API_KEY) throw notConfigured('LLM');
    throw new AdapterError('The live LLM adapter is not part of the demo build.', { service: 'LLM', code: 'not_built' });
  },
};
