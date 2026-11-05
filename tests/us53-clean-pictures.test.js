import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { cleanPicture, borderShades } from '../src/data/cleanup.js';
import { preparePicture } from '../src/data/logo.js';

/** A width x height RGBA picture: every pixel is `fill(x, y)` as [r, g, b, a]. */
function picture(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(fill(x, y), (y * width + x) * 4);
  return { data, width, height };
}
const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const BLUE = [20, 40, 200, 255];
/** The grey-and-white "transparent" checkerboard a website draws, with a blue 40 px logo in the middle. */
const checker = (shade = 204) => picture(120, 120, (x, y) => (x >= 40 && x < 80 && y >= 40 && y < 80 ? BLUE : ((x >> 3) + (y >> 3)) % 2 ? [shade, shade, shade, 255] : [255, 255, 255, 255]));

describe('US-53 A fake-transparent logo or stamp is cleaned and fills its space (CR-0019)', () => {
  it('AC-53.1: a checkerboard edge is removed from the edges inwards, and the logo stays', () => {
    const img = checker();
    expect(borderShades(img.data, img.width, img.height)).not.toBeNull();
    const result = cleanPicture(img);
    expect(result.removed).toBe(true);
    expect(at(img, 0, 0)[3]).toBe(0); // a white square
    expect(at(img, 8, 0)[3]).toBe(0); // a grey square
    expect(at(img, 119, 119)[3]).toBe(0);
    expect(at(img, 60, 60)).toEqual(BLUE); // the logo is untouched
    expect(at(img, 40, 40)).toEqual(BLUE);
  });

  it('AC-53.1: the soft in-between shades where the two checker colours meet go too', () => {
    const img = picture(120, 120, (x, y) => (x >= 40 && x < 80 && y >= 40 && y < 80 ? BLUE : x % 8 === 7 ? [230, 230, 230, 255] : ((x >> 3) + (y >> 3)) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255]));
    cleanPicture(img);
    expect(at(img, 7, 3)[3]).toBe(0); // a 230 grey between a white and a grey square
    expect(at(img, 15, 20)[3]).toBe(0);
  });

  it('AC-53.1: a plain white box is removed, but white inside the logo that does not touch the outside stays', () => {
    const ring = picture(100, 100, (x, y) => {
      const inner = x >= 40 && x < 60 && y >= 40 && y < 60;
      const outer = x >= 30 && x < 70 && y >= 30 && y < 70;
      return inner ? [255, 255, 255, 255] : outer ? BLUE : [255, 255, 255, 255];
    });
    const result = cleanPicture(ring);
    expect(result.removed).toBe(true);
    expect(at(ring, 2, 2)[3]).toBe(0);
    expect(at(ring, 50, 50)).toEqual([255, 255, 255, 255]); // the white centre of the ring is part of the logo
    expect(at(ring, 35, 50)).toEqual(BLUE);
  });

  it('AC-53.1: checkerboard enclosed by the logo (inside a ring) goes too, but a plain white centre stays', () => {
    const ring = (inside) => picture(120, 120, (px, py) => {
      const outer = px >= 30 && px < 90 && py >= 30 && py < 90;
      const inner = px >= 45 && px < 75 && py >= 45 && py < 75;
      if (inner) return inside(px, py);
      if (outer) return BLUE;
      return ((px >> 3) + (py >> 3)) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255];
    });
    const checkered = ring((px, py) => (((px >> 3) + (py >> 3)) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255]));
    cleanPicture(checkered);
    expect(at(checkered, 50, 50)[3]).toBe(0); // checkerboard inside the ring, both shades
    expect(at(checkered, 58, 50)[3]).toBe(0);
    expect(at(checkered, 35, 60)).toEqual(BLUE); // the ring itself stays
    const solid = ring(() => [255, 255, 255, 255]);
    cleanPicture(solid);
    expect(at(solid, 60, 60)).toEqual([255, 255, 255, 255]); // white inside the badge is part of the logo
    expect(at(solid, 1, 1)[3]).toBe(0); // while the outside checkerboard is gone
  });

  it('AC-53.2: the empty edges are trimmed with a small border, so the logo fills its space', () => {
    const img = checker();
    const { box, trimmed } = cleanPicture(img);
    expect(trimmed).toBe(true);
    expect(box.width).toBeLessThan(60);
    expect(box.height).toBeLessThan(60);
    expect(box.x).toBeLessThanOrEqual(40);
    expect(box.x + box.width).toBeGreaterThanOrEqual(80); // the whole logo is inside
    expect(box.y + box.height).toBeGreaterThanOrEqual(80);
  });

  it('AC-53.2: a picture that is already transparent is only trimmed, nothing is removed', () => {
    const img = picture(100, 100, (x, y) => (x >= 30 && x < 70 && y >= 30 && y < 70 ? BLUE : [0, 0, 0, 0]));
    const result = cleanPicture(img);
    expect(result.removed).toBe(false);
    expect(result.trimmed).toBe(true);
    expect(at(img, 50, 50)).toEqual(BLUE);
  });

  it('AC-53.3: a coloured background, a photo, or a nearly all-white picture is never cleaned', () => {
    const red = picture(80, 80, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? BLUE : [200, 30, 30, 255]));
    expect(cleanPicture(red)).toMatchObject({ removed: false, trimmed: false });
    expect(at(red, 0, 0)[3]).toBe(255);
    const noise = picture(80, 80, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 71) % 256, (x * 5 + y * 29) % 256, 255]);
    expect(cleanPicture(noise)).toMatchObject({ removed: false, trimmed: false });
    const blank = picture(80, 80, () => [255, 255, 255, 255]);
    expect(cleanPicture(blank).removed).toBe(false); // the "background" would be the whole picture
    expect(at(blank, 40, 40)[3]).toBe(255);
    const dark = picture(80, 80, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? [255, 255, 255, 255] : [30, 30, 30, 255]));
    expect(cleanPicture(dark).removed).toBe(false); // a dark background is a choice, not a fake checkerboard
  });

  it('AC-53.3: a light-grey detail that is not one of the background shades stays', () => {
    const img = picture(100, 100, (x, y) => (x >= 40 && x < 60 && y >= 40 && y < 60 ? [180, 180, 180, 255] : [255, 255, 255, 255]));
    cleanPicture(img);
    expect(at(img, 50, 50)).toEqual([180, 180, 180, 255]); // grey text on white is not erased
    expect(at(img, 1, 1)[3]).toBe(0);
  });

  it('AC-53.1: preparePicture cleans and trims, and tells the caller; with clean off it does neither', async () => {
    const run = async (options) => {
      const pixels = checker();
      let cleanedOnWork = false;
      const made = [];
      const canvasOf = (width, height) => {
        const canvas = {
          width, height, draws: [], calls: [],
          getContext: () => ({
            drawImage: (...args) => canvas.draws.push(args),
            getImageData: () => (made[0] === canvas ? { data: pixels.data } : { data: new Uint8ClampedArray(cleanedOnWork ? [0, 0, 0, 0, 20, 40, 200, 255] : [20, 40, 200, 255]) }),
            putImageData: () => { cleanedOnWork = true; },
          }),
          toDataURL: (type) => { canvas.calls.push(type); return `data:${type};base64,AAAA`; },
        };
        made.push(canvas);
        return canvas;
      };
      const onCleaned = vi.fn();
      const url = await preparePicture({ size: 5000 }, { decode: async () => ({ width: 120, height: 120 }), canvasOf, onCleaned, ...options });
      return { url, made, onCleaned };
    };
    const cleaned = await run({});
    expect(cleaned.onCleaned).toHaveBeenCalledWith({ removed: true, trimmed: true });
    const [source, sx, sy, sw, sh] = cleaned.made.at(-1).draws.at(-1);
    expect(source).toBe(cleaned.made[0]); // drawn from the cleaned working canvas
    expect(sw).toBeLessThan(60);
    expect(sh).toBeLessThan(60);
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBeGreaterThan(0);
    expect(cleaned.url.startsWith('data:image/png;')).toBe(true); // it is see-through now, so a PNG
    const kept = await run({ clean: false });
    expect(kept.onCleaned).not.toHaveBeenCalled();
    expect(kept.made.at(-1).draws.at(-1).slice(1, 5)).toEqual([0, 0, 120, 120]); // the whole picture, as chosen
  });
});

// ---------- the screens ----------
const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';
let t;
afterEach(() => { t?.app.unmount(); t = null; });
function open(api, logoImage) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = '#/settings';
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20], api, logoImage, me: meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, REAL_BUSINESS) });
  return { app, root, $: (s) => root.querySelector(s) };
}
const choose = (x, selector, name) => {
  const input = x.$(selector);
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('US-53 the owner is told, and can keep the original (CR-0019)', () => {
  it('AC-53.4 and AC-53.5: a cleaned logo says so, and "Keep my original" saves it without cleaning', async () => {
    const api = fakeApi();
    api.saveLogo = vi.fn(async () => ({ ...REAL_BUSINESS, logo_version: 'abc123def456', bill_look: {} }));
    const convert = vi.fn(async (file, options) => { if (options.clean) options.onCleaned({ removed: true, trimmed: true }); return PNG_URL; });
    t = open(api, convert);
    choose(t, 'input[name="logo"]', 'logo.png');
    await until(() => t.$('[data-testid="keep-original"]'));
    expect(t.$('[data-testid="look-notice"]').textContent).toContain('removed the background around your logo and trimmed its empty edges');
    expect(convert.mock.calls[0][1]).toMatchObject({ clean: true });
    t.$('[data-action="bill-keep-original"]').click();
    await until(() => !t.$('[data-testid="keep-original"]'));
    expect(convert.mock.calls.at(-1)[1]).toMatchObject({ clean: false });
    expect(t.$('[data-testid="look-notice"]').textContent).toBe('Saved. The logo now shows on your estimates and bills.');
    expect(api.saveLogo).toHaveBeenCalledTimes(2);
  });

  it('AC-53.5: a cleaned signature says so too, and nothing is said when nothing was cleaned', async () => {
    const api = fakeApi();
    api.saveSignature = vi.fn(async () => ({ ...REAL_BUSINESS, signature_version: 'sig123def456', bill_look: {} }));
    let clean = true;
    const convert = vi.fn(async (file, options) => { if (clean && options.clean) options.onCleaned({ removed: true, trimmed: false }); return PNG_URL; });
    t = open(api, convert);
    choose(t, 'input[data-action="pick-signature"]', 'sign.png');
    await until(() => t.$('[data-testid="keep-original"]'));
    expect(t.$('[data-testid="look-notice"]').textContent).toContain('removed the background around your signature');
    clean = false;
    choose(t, 'input[data-action="pick-signature"]', 'sign2.png');
    await until(() => !t.$('[data-testid="keep-original"]'));
    expect(t.$('[data-testid="look-notice"]').textContent).toBe('Saved. The signature now shows on your estimates and bills.');
  });
});
