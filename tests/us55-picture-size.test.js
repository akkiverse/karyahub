import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { pictureSize, DEFAULT_LOOK } from '../src/domain/bills.js';

let t;
afterEach(() => { t?.app.unmount(); t = null; });
const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };

function open({ business = REAL_BUSINESS, api = fakeApi() } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = '#/settings';
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { ...FAST, api, me: meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, business) });
  return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)] };
}
const withPictures = (look = {}, which = ['logo', 'signature']) => ({
  ...REAL_BUSINESS, ...(which.includes('logo') ? { logo_version: 'abc123def456' } : {}), ...(which.includes('signature') ? { signature_version: 'sig123def456' } : {}), bill_look: look,
});
const slide = (x, name, value) => {
  const bar = x.$(`input[name="${name}"]`);
  bar.value = String(value);
  bar.dispatchEvent(new Event('input', { bubbles: true }));
};
const preview = (x) => x.$('[data-testid="look-preview"] .bill-paper');

describe('US-55 The size of the logo and of the signature (CR-0019)', () => {
  it('AC-55.1: a size bar appears for each picture that exists, and not before', () => {
    t = open({ business: withPictures({}, []) });
    expect(t.$('input[name="logo_size"]')).toBeNull();
    expect(t.$('input[name="signature_size"]')).toBeNull();
    t.app.unmount();
    t = open({ business: withPictures({}, ['logo']) });
    expect(t.$('input[name="logo_size"]')).toBeTruthy();
    expect(t.$('input[name="signature_size"]')).toBeNull();
    t.app.unmount();
    t = open({ business: withPictures({}, ['signature']) });
    expect(t.$('input[name="logo_size"]')).toBeNull();
    expect(t.$('input[name="signature_size"]')).toBeTruthy();
  });

  it('AC-55.1: each bar is a horizontal slider from 50% to 200% in steps of 5, at 100% as today, and shows its value', () => {
    t = open({ business: withPictures() });
    for (const [name, label] of [['logo_size', 'Logo size'], ['signature_size', 'Signature size']]) {
      const bar = t.$(`input[name="${name}"]`);
      expect(bar.type).toBe('range');
      expect([bar.min, bar.max, bar.step, bar.value]).toEqual(['50', '200', '5', '100']);
      expect(bar.getAttribute('aria-label')).toBe(label);
      expect(t.$(`[data-size-for="${name}"]`).textContent).toBe('100%');
      expect(bar.closest('.logo-field')).toBeTruthy(); // it sits with its own picture
    }
    expect(t.$('input[name="logo_size"]').closest('.logo-field')).not.toBe(t.$('input[name="signature_size"]').closest('.logo-field'));
  });

  it('AC-55.1: a saved size is shown on its bar', () => {
    t = open({ business: withPictures({ logo_size: 140, signature_size: 70 }) });
    expect(t.$('input[name="logo_size"]').value).toBe('140');
    expect(t.$('[data-size-for="signature_size"]').textContent).toBe('70%');
  });

  it('AC-55.2: moving a bar changes the picture on the live preview and the number beside it, before anything is saved', () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async (f) => f);
    t = open({ business: withPictures(), api });
    expect(preview(t).querySelector('.doc-logo').getAttribute('style')).toBe('max-width:120px;max-height:64px'); // as it always was
    expect(preview(t).querySelector('.sign img').getAttribute('style')).toBe('max-height:56px');
    slide(t, 'logo_size', 150);
    slide(t, 'signature_size', 50);
    expect(preview(t).querySelector('.doc-logo').getAttribute('style')).toBe('max-width:180px;max-height:96px');
    expect(preview(t).querySelector('.sign img').getAttribute('style')).toBe('max-height:28px');
    expect(t.$('[data-size-for="logo_size"]').textContent).toBe('150%');
    expect(t.$('[data-size-for="signature_size"]').textContent).toBe('50%');
    expect(api.saveBillLook).not.toHaveBeenCalled();
  });

  it('AC-55.2: Save bill look sends both sizes', async () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async (f) => f);
    t = open({ business: withPictures(), api });
    slide(t, 'logo_size', 175);
    slide(t, 'signature_size', 60);
    t.$('form[data-form="bill-look"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="look-notice"]'));
    expect(api.saveBillLook.mock.calls[0][0]).toMatchObject({ logo_size: 175, signature_size: 60 });
  });

  it('AC-55.2: without a picture there is no size to send (the server keeps what it has)', async () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async (f) => f);
    t = open({ business: withPictures({}, []), api });
    t.$('form[data-form="bill-look"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="look-notice"]'));
    expect(api.saveBillLook.mock.calls[0][0]).not.toHaveProperty('logo_size');
    expect(api.saveBillLook.mock.calls[0][0]).not.toHaveProperty('signature_size');
  });

  it('AC-55.3 and AC-55.4: the bill uses the saved size, and the gaps around the pictures are not part of it', () => {
    t = open({ business: withPictures({ logo_size: 200, signature_size: 125 }) });
    expect(preview(t).querySelector('.doc-logo').getAttribute('style')).toBe('max-width:240px;max-height:128px');
    expect(preview(t).querySelector('.sign img').getAttribute('style')).toBe('max-height:70px');
    // the gaps live in the stylesheet (margin-bottom, padding), so the inline style carries only the picture's own size
    expect(preview(t).querySelector('.doc-logo').getAttribute('style')).not.toMatch(/margin|padding/);
    expect(preview(t).querySelector('.sign img').getAttribute('style')).not.toMatch(/margin|padding/);
  });

  it('AC-55.6: a business with no saved size is at 100%, and a nonsense size is read as 100%', () => {
    expect(DEFAULT_LOOK.logo_size).toBe(100);
    expect(DEFAULT_LOOK.signature_size).toBe(100);
    for (const bad of [undefined, null, '', 'big', NaN, 0, 49, 201, -50, Infinity]) expect(pictureSize({ logo_size: bad }, 'logo_size')).toBe(100);
    expect(pictureSize({}, 'logo_size')).toBe(100);
    expect(pictureSize(undefined, 'logo_size')).toBe(100);
    expect([pictureSize({ x: 50 }, 'x'), pictureSize({ x: 200 }, 'x'), pictureSize({ x: '125' }, 'x')]).toEqual([50, 200, 125]);
  });

  it('AC-55.6: the server refusing a size is shown to the owner in plain words', async () => {
    const api = fakeApi();
    api.saveBillLook = vi.fn(async () => { const { ApiError } = await import('../src/api/client.js'); throw new ApiError('Pick a size for the logo from 50% to 200%.', { code: 'validation_error', status: 422 }); });
    t = open({ business: withPictures(), api });
    t.$('form[data-form="bill-look"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await until(() => t.$('[data-testid="look-notice"]'));
    expect(t.$('[data-testid="look-notice"]').textContent).toContain('Pick a size for the logo from 50% to 200%.');
  });
});
