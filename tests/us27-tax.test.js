import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compute, TaxInputError, gstinOk, stateOfGstin, stateLabel, numberInWords, STATES } from '../src/domain/tax.js';

const FIXTURE = JSON.parse(readFileSync('tests/fixtures/gst_cases.json', 'utf8'));

describe('US-27 tax engine (the phone copy)', () => {
  it.each(FIXTURE.cases.map((c) => [c.name, c]))('AC-27.9: the phone gives the shared figures: %s', (_name, c) => {
    if (c.error) {
      let caught = null;
      try {
        compute(c.bill);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(TaxInputError);
      expect({ code: caught.code, line: caught.line }).toEqual(c.error);
    } else {
      expect(compute(c.bill)).toEqual(c.expected);
    }
  });

  it('AC-27.8: GSTIN pattern and check character', () => {
    for (const [text, ok] of FIXTURE.gstin) expect(gstinOk(text)).toBe(ok);
  });

  it('AC-27.6: place of supply from the GSTIN, printed as name (code)', () => {
    expect(stateOfGstin('27AAPFU0939F1ZV')).toBe('27');
    expect(stateLabel('33')).toBe('Tamil Nadu (33)');
    expect(Object.keys(STATES)).toContain('38');
  });

  it('AC-30.2: totals in words, Indian style', () => {
    for (const [n, words] of FIXTURE.words) expect(numberInWords(n)).toBe(words);
  });
});
