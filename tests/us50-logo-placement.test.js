import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';

const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';
let t;
afterEach(() => { t?.app.unmount(); t = null; });

const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };
const ownerOf = (business) => meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, business);

/** Settings, opened as a real business's owner; `business` may already have a logo and a saved look. */
function open({ business = REAL_BUSINESS, api = fakeApi(), logoImage } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = '#/settings';
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { ...FAST, api, me: ownerOf(business), logoImage });
  return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)] };
}
const withLogo = (look = {}) => ({ ...REAL_BUSINESS, logo_version: 'abc123def456', bill_look: look });
const pick = (x, value) => {
  const radio = x.$(`input[name="logo_position"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};
const paper = (x) => x.$('[data-testid="look-preview"] .bill-paper');

describe('US-50 The logo, and where it goes on a bill (CR-0019)', () => {
  it('AC-50.1: the logo sits in Bill look beside the signature, not under Business details', () => {
    t = open({ business: withLogo() });
    const form = t.$('form[data-form="bill-look"]');
    const logo = form.querySelector('[data-testid="logo-field"]');
    expect(logo).toBeTruthy();
    expect(logo.querySelector('input[name="logo"]')).toBeTruthy();
    expect(logo.querySelector('[data-action="bill-remove-logo"]')).toBeTruthy();
    const signature = [...form.querySelectorAll('.logo-field')].find((x) => x.textContent.includes('Signature'));
    expect(signature).toBeTruthy();
    expect(logo.compareDocumentPosition(signature) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the logo comes first
    expect(t.$('form[data-form="business-profile"]').closest('section').querySelector('[data-testid="logo-field"]')).toBeNull();
  });

  it('AC-50.3: with no logo there is no placement question, only a hint to add one first', () => {
    t = open();
    expect(t.$('[data-testid="logo-hint"]').textContent).toContain('Add one, then choose where it goes');
    expect(t.$('[data-testid="logo-position"]')).toBeNull();
    expect(t.$('input[name="logo_position"]')).toBeNull();
  });

  it('AC-50.2: the owner is asked where the logo goes, the preview moves it, and Save keeps it', async () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async (f) => f);
    t = open({ business: withLogo(), api });
    const legend = t.$('[data-testid="logo-position"] legend').textContent;
    expect(legend).toBe('Where should the logo go?');
    expect(t.$$('input[name="logo_position"]').map((i) => i.value)).toEqual(['left', 'center', 'right']);
    expect(t.$('input[name="logo_position"]:checked').value).toBe('left'); // the way it always was
    pick(t, 'center');
    expect(t.$('[data-testid="look-preview"] .doc-logo-row .doc-logo')).toBeTruthy();
    pick(t, 'right');
    expect(t.$('[data-testid="look-preview"] .doc-meta .doc-logo-right .doc-logo')).toBeTruthy();
    expect(t.$('[data-testid="look-preview"] .doc-logo-row')).toBeNull();
    t.$('form[data-form="bill-look"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="look-notice"]'));
    expect(api.saveBillLook.mock.calls[0][0]).toMatchObject({ logo_position: 'right' });
  });

  it('AC-50.2: adding a logo keeps what was typed in the form but not saved yet', async () => {
    const logoImage = vi.fn(async () => PNG_URL);
    const api = fakeApi();
    api.saveLogo = vi.fn(async () => ({ ...REAL_BUSINESS, logo_version: 'abc123def456', bill_look: {} }));
    t = open({ api, logoImage });
    const prefix = t.$('input[name="prefix"]');
    prefix.value = 'AB';
    prefix.dispatchEvent(new Event('input', { bubbles: true }));
    const input = t.$('input[name="logo"]');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'logo.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => t.$('[data-testid="logo-position"]')); // the question appears once there is a logo
    expect(t.$('input[name="prefix"]').value).toBe('AB');
    expect(t.$('[data-testid="look-notice"]').textContent).toContain('logo now shows on your estimates and bills');
  });

  it('AC-50.4: on the paper the logo is above the name (left), a row of its own (centre) or above the heading (right)', () => {
    t = open({ business: withLogo() });
    // left, as it always was: inside the first block of the header, above the business name
    expect(paper(t).querySelector('.doc-head > div:first-child > .doc-logo')).toBeTruthy();
    expect(paper(t).querySelector('.doc-logo-row')).toBeNull();
    pick(t, 'center');
    const row = paper(t).querySelector('.doc-logo-row');
    expect(row.querySelector('.doc-logo')).toBeTruthy();
    expect(row.compareDocumentPosition(paper(t).querySelector('.doc-head')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // before the header
    expect(paper(t).querySelectorAll('.doc-logo')).toHaveLength(1);
    pick(t, 'right');
    expect(paper(t).querySelector('.doc-head .doc-meta .doc-logo-right .doc-logo')).toBeTruthy();
    expect(paper(t).querySelectorAll('.doc-logo')).toHaveLength(1);
  });

  it('AC-50.4: on A4 modern the logo sits on a white chip, so a dark logo stays readable on the coloured header', () => {
    t = open({ business: withLogo({ layout: 'a4_modern' }) });
    expect(paper(t).className).toContain('layout-a4_modern');
    expect(paper(t).querySelector('.doc-head .doc-logo')).toBeTruthy();
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.bill-paper\.layout-a4_modern \.doc-head \.doc-logo \{[^}]*background: #FFFFFF;[^}]*border-radius/);
  });

  it('AC-50.6: on the small receipt the logo is always centred, whatever was chosen', () => {
    t = open({ business: withLogo({ layout: 'receipt_80', logo_position: 'right' }) });
    expect(paper(t).className).toContain('layout-receipt_80');
    expect(paper(t).querySelector('.doc-logo-row .doc-logo')).toBeTruthy();
    expect(paper(t).querySelector('.doc-logo-right')).toBeNull();
    expect(t.$('[data-testid="logo-position"]').textContent).toContain('On the small receipt the logo is always in the centre');
  });

  it('AC-50.7: a look saved before this change shows the logo top left', () => {
    t = open({ business: withLogo({ layout: 'a4_classic', colour: '#0F766E', prefix: 'AC' }) }); // no logo_position saved
    expect(t.$('input[name="logo_position"]:checked').value).toBe('left');
    expect(paper(t).querySelector('.doc-head > div:first-child > .doc-logo')).toBeTruthy();
  });
});

describe('US-51 Pick the state by name when adding a business (CR-0019)', () => {
  const openBusinesses = async () => {
    t = setup({ signedInAs: 'platform', hash: '#/businesses', api: fakeApi() });
    await until(() => t.$('[data-testid="business-list"]'));
  };

  it('AC-51.1: the form asks for a State from a list of names, with no code box, Maharashtra first', async () => {
    await openBusinesses();
    const f = t.$('form[data-form="add-business"]');
    expect(f.querySelector('input[name="state_code"]')).toBeNull();
    const select = f.querySelector('select[name="state"]');
    const names = [...select.options].map((o) => o.textContent);
    expect(select.value).toBe('Maharashtra');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(expect.arrayContaining(['Karnataka', 'Delhi', 'Tamil Nadu', 'Maharashtra']));
    expect(names.some((n) => /\d/.test(n))).toBe(false); // names only: nobody has to see or type a code
    expect(f.textContent).not.toContain('State code');
  });

  it('AC-51.2: the chosen state name is sent, and no code is', async () => {
    await openBusinesses();
    const f = t.$('form[data-form="add-business"]');
    for (const [k, v] of Object.entries({ name: 'Cool Breeze', owner_name: 'Ravi Kale', owner_phone: '98 222 00002' })) f.elements[k].value = v;
    f.elements.state.value = 'Karnataka';
    f.requestSubmit();
    await until(() => t.$('[data-testid="biz-credentials"]'));
    const sent = t.api.accountCalls.find((c) => c.name === 'createBusiness').args[0];
    expect(sent.state).toBe('Karnataka');
    expect('state_code' in sent).toBe(false);
  });

  it('AC-51.2: after a refused attempt the chosen state is still chosen', async () => {
    await openBusinesses();
    const f = t.$('form[data-form="add-business"]');
    for (const [k, v] of Object.entries({ name: 'Cool Breeze', owner_name: 'Ravi Kale', owner_phone: '9811100001' })) f.elements[k].value = v; // a number that is already in use
    f.elements.state.value = 'Goa';
    f.requestSubmit();
    await until(() => t.$('[data-testid="biz-error"]'));
    expect(t.$('form[data-form="add-business"] select[name="state"]').value).toBe('Goa');
  });
});
