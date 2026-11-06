import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { ApiError, ApiUnreachable } from '../src/api/client.js';
import { preparePicture, TOO_BIG, CANT_USE, TOO_DETAILED, MAX_INPUT_BYTES } from '../src/data/logo.js';

let t;
let warn;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { t?.app.unmount(); t = null; warn.mockRestore(); });
const FAST = { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20] };
const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';

function open({ business = REAL_BUSINESS, api = fakeApi(), logoImage } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = '#/settings';
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { ...FAST, api, logoImage, me: meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, business) });
  return { app, root, api, $: (s) => root.querySelector(s), $$: (s) => [...root.querySelectorAll(s)] };
}
const choose = (x, selector, name = 'p.png') => {
  const input = x.$(selector);
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const notice = (x) => x.$('[data-testid="look-notice"]');
const consoleLines = () => warn.mock.calls.map((c) => String(c[0]));

/** A canvas that answers with `pixels` and counts what is drawn, enough for preparePicture. */
const canvasWith = (pixels, { failRead = false } = {}) => (width, height) => ({
  width, height,
  getContext: () => ({
    drawImage() {},
    getImageData: () => { if (failRead) throw new Error('canvas is tainted'); return { data: pixels, width, height }; },
    putImageData() {},
  }),
  toDataURL: (type) => `data:${type};base64,AAAA`,
});
const lightPixels = () => { const d = new Uint8ClampedArray(8 * 8 * 4); for (let p = 0; p < 64; p += 1) d.set([250, 250, 250, 255], p * 4); return d; };

describe('US-56 Clear warnings and logs when a logo or signature fails (CR-0019)', () => {
  describe('AC-56.1: each failure while adding a picture says what happened', () => {
    it('too big: the plain message, and a console line with the size', async () => {
      await expect(preparePicture({ size: MAX_INPUT_BYTES + 1, type: 'image/png' }, { kind: 'logo' })).rejects.toThrow(TOO_BIG);
      expect(consoleLines()).toContain('[karyahub] picture: too-big');
      expect(warn.mock.calls[0][1]).toMatchObject({ kind: 'logo', type: 'image/png', bytes: MAX_INPUT_BYTES + 1 });
    });

    it('not a picture the browser can read: the plain message, and the reason in the console', async () => {
      const decode = async () => { const e = new Error('bad'); e.name = 'InvalidStateError'; throw e; };
      await expect(preparePicture({ size: 10, type: 'image/png' }, { decode, kind: 'signature' })).rejects.toThrow(CANT_USE);
      expect(consoleLines()).toContain('[karyahub] picture: unreadable');
      expect(warn.mock.calls[0][1]).toMatchObject({ kind: 'signature', why: 'InvalidStateError' });
    });

    it('too detailed to keep sharp: the plain message, and a console line', async () => {
      const big = 'x'.repeat(1_500_000);
      const canvasOf = (width, height) => ({ width, height, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4).fill(7) }), putImageData() {} }), toDataURL: (type) => `data:${type};base64,${big}` });
      await expect(preparePicture({ size: 10 }, { decode: async () => ({ width: 40, height: 40 }), canvasOf, clean: false })).rejects.toThrow(TOO_DETAILED);
      expect(consoleLines()).toContain('[karyahub] picture: too-detailed');
    });

    it('on the screen: each of them reaches the owner as an alert, and nothing is saved', async () => {
      for (const [error, words] of [[new Error(TOO_BIG), TOO_BIG], [new Error(CANT_USE), CANT_USE], [new Error(TOO_DETAILED), TOO_DETAILED]]) {
        const api = fakeApi();
        api.saveSignature = vi.fn();
        t = open({ api, logoImage: async () => { throw error; } });
        choose(t, 'input[data-action="pick-signature"]');
        await until(() => notice(t));
        expect(notice(t).textContent).toBe(words);
        expect(notice(t).classList.contains('notice-error')).toBe(true);
        expect(notice(t).getAttribute('role')).toBe('alert');
        expect(api.saveSignature).not.toHaveBeenCalled();
        t.app.unmount();
        t = null;
      }
    });

    it('the server refuses it: its own reason is shown and the console has a line', async () => {
      const api = fakeApi();
      api.saveLogo = vi.fn(async () => { throw new ApiError('Use a PNG, JPEG or WebP picture of up to 1 MB for the logo.', { code: 'validation_error', status: 422 }); });
      t = open({ api, logoImage: async () => PNG_URL });
      choose(t, 'input[name="logo"]');
      await until(() => notice(t));
      expect(notice(t).textContent).toBe('Use a PNG, JPEG or WebP picture of up to 1 MB for the logo.');
      expect(notice(t).classList.contains('notice-error')).toBe(true);
      expect(consoleLines()).toContain('[karyahub] picture: save-failed');
      expect(warn.mock.calls.at(-1)[1]).toMatchObject({ kind: 'logo', why: 'validation_error' });
    });

    it('there is no connection: the offline words are shown, not a blank or a crash', async () => {
      const api = fakeApi();
      api.saveSignature = vi.fn(async () => { throw new ApiUnreachable(); });
      t = open({ api, logoImage: async () => PNG_URL });
      choose(t, 'input[data-action="pick-signature"]');
      await until(() => notice(t));
      expect(notice(t).classList.contains('notice-error')).toBe(true);
      expect(notice(t).textContent.length).toBeGreaterThan(10);
      expect(notice(t).textContent).not.toMatch(/undefined|\[object/);
      expect(consoleLines()).toContain('[karyahub] picture: save-failed');
    });
  });

  describe('AC-56.2: if cleaning the background fails, the picture is still saved', () => {
    it('preparePicture saves the picture as chosen, says the cleaning failed, and logs why', async () => {
      const onWarn = vi.fn();
      const onCleaned = vi.fn();
      const url = await preparePicture({ size: 10, type: 'image/png' }, { decode: async () => ({ width: 8, height: 8 }), canvasOf: canvasWith(lightPixels(), { failRead: true }), kind: 'signature', onWarn, onCleaned });
      expect(url.startsWith('data:image/png;')).toBe(true); // a picture came out
      expect(onCleaned).not.toHaveBeenCalled();
      expect(onWarn).toHaveBeenCalledWith({ code: 'clean-failed' });
      expect(consoleLines()).toContain('[karyahub] picture: clean-failed');
      expect(warn.mock.calls.find((c) => c[0].includes('clean-failed'))[1]).toMatchObject({ kind: 'signature', why: 'canvas is tainted' });
      expect(consoleLines()).toContain('[karyahub] picture: pixels-unreadable'); // and the safe choice: it stays a PNG
    });

    it('on the screen: saved, with a warning in amber that says the background could not be removed', async () => {
      const api = fakeApi();
      api.saveSignature = vi.fn(async () => ({ ...REAL_BUSINESS, signature_version: 'sig1', bill_look: {} }));
      t = open({ api, logoImage: async (file, options) => { options.onWarn({ code: 'clean-failed' }); return PNG_URL; } });
      choose(t, 'input[data-action="pick-signature"]');
      await until(() => notice(t));
      expect(api.saveSignature).toHaveBeenCalledOnce();
      expect(notice(t).textContent).toContain('Saved.');
      expect(notice(t).textContent).toContain("We couldn't remove the background of this picture, so it is saved exactly as you chose it.");
      expect(notice(t).classList.contains('notice-warn')).toBe(true);
      expect(notice(t).classList.contains('notice-error')).toBe(false);
    });

    it('a picture whose background was left alone says why (dark, filled, no ink)', async () => {
      const words = { dark: 'dark or coloured', filled: 'Most of the picture is filled in', 'no-ink': 'could not find any ink' };
      for (const [reason, text] of Object.entries(words)) {
        const api = fakeApi();
        api.saveSignature = vi.fn(async () => ({ ...REAL_BUSINESS, signature_version: 'sig1', bill_look: {} }));
        t = open({ api, logoImage: async (file, options) => { options.onWarn({ code: 'background-kept', reason }); return PNG_URL; } });
        choose(t, 'input[data-action="pick-signature"]');
        await until(() => notice(t));
        expect(notice(t).textContent).toContain(text);
        expect(notice(t).classList.contains('notice-warn')).toBe(true);
        t.app.unmount();
        t = null;
      }
    });

    it('a dark picture through the real preparePicture: kept as chosen, with the reason in the console', async () => {
      const dark = new Uint8ClampedArray(8 * 8 * 4);
      for (let p = 0; p < 64; p += 1) dark.set([40, 40, 50, 255], p * 4);
      const onWarn = vi.fn();
      await preparePicture({ size: 10, type: 'image/png' }, { decode: async () => ({ width: 8, height: 8 }), canvasOf: canvasWith(dark), kind: 'signature', onWarn });
      expect(onWarn).toHaveBeenCalledWith({ code: 'background-kept', reason: 'dark' });
      expect(consoleLines()).toContain('[karyahub] picture: background-kept');
    });

    it('a logo is never warned about its background (it works as before)', async () => {
      const dark = new Uint8ClampedArray(8 * 8 * 4);
      for (let p = 0; p < 64; p += 1) dark.set([40, 40, 50, 255], p * 4);
      const onWarn = vi.fn();
      await preparePicture({ size: 10 }, { decode: async () => ({ width: 8, height: 8 }), canvasOf: canvasWith(dark), kind: 'logo', onWarn });
      expect(onWarn).not.toHaveBeenCalled();
      expect(consoleLines().filter((l) => l.includes('background-kept'))).toEqual([]);
    });
  });

  describe('AC-56.3: a saved picture that cannot be shown is flagged', () => {
    const withBoth = { ...REAL_BUSINESS, logo_version: 'abc123def456', signature_version: 'sig123def456', bill_look: {} };

    it('Bill look: the broken signature is replaced by a warning that says to choose the file again', () => {
      t = open({ business: withBoth });
      const img = t.$('[data-testid="signature-preview"]');
      img.dispatchEvent(new Event('error')); // the browser could not decode it
      const flag = t.$('[data-testid="picture-missing"]');
      expect(flag).toBeTruthy();
      expect(flag.textContent).toBe("We couldn't show your signature. Choose the file again.");
      expect(flag.getAttribute('role')).toBe('alert');
      expect(img.hidden).toBe(true);
      expect(consoleLines()).toContain('[karyahub] picture: not-shown');
      expect(warn.mock.calls.at(-1)[1]).toEqual({ kind: 'signature' });
    });

    it('Bill look: the broken logo says logo, and the warning is only added once', () => {
      t = open({ business: withBoth });
      const img = t.$('[data-testid="logo-preview"]');
      img.dispatchEvent(new Event('error'));
      img.dispatchEvent(new Event('error'));
      const flags = t.$$('[data-testid="picture-missing"]');
      expect(flags).toHaveLength(1);
      expect(flags[0].textContent).toBe("We couldn't show your logo. Choose the file again.");
    });

    it('the bill paper flags a broken logo or signature too', () => {
      t = open({ business: withBoth });
      const paper = t.$('[data-testid="look-preview"] .bill-paper');
      paper.querySelector('.doc-logo').dispatchEvent(new Event('error'));
      paper.querySelector('.sign img').dispatchEvent(new Event('error'));
      expect(paper.querySelectorAll('[data-testid="picture-missing"]')).toHaveLength(2);
    });

    it('a picture that shows fine raises nothing', () => {
      t = open({ business: withBoth });
      expect(t.$('[data-testid="picture-missing"]')).toBeNull();
      expect(consoleLines().filter((l) => l.includes('not-shown'))).toEqual([]);
    });

    it('an image that is not a logo or signature is not touched', () => {
      t = open({ business: withBoth });
      const other = document.createElement('img');
      t.root.appendChild(other);
      other.dispatchEvent(new Event('error'));
      expect(t.$('[data-testid="picture-missing"]')).toBeNull();
    });
  });

  it('AC-56.6: nothing personal or bulky goes to the console: no picture content, only kind, type, size and reason', async () => {
    await expect(preparePicture({ size: MAX_INPUT_BYTES + 5, type: 'image/png', name: 'my-signature.png' }, { kind: 'signature' })).rejects.toThrow();
    await expect(preparePicture({ size: 10, type: 'image/jpeg', name: 'my-signature.png' }, { decode: async () => { throw new Error('x'); }, kind: 'signature' })).rejects.toThrow();
    const everything = JSON.stringify(warn.mock.calls);
    expect(everything).not.toContain('my-signature'); // not even the file name
    expect(everything).not.toContain('base64');
  });
});
