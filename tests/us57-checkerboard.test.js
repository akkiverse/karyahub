import { describe, it, expect, afterEach } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';
import { meFor, REAL_BUSINESS } from './fake-accounts.js';
import { cleanPicture, cleanSignature, contentBox, borderShades } from '../src/data/cleanup.js';

// A made-up picture saved from an image generator: a logo (a coloured ring, a bar of text and a row of fine dots as a tagline)
// on a checkerboard of two greys that is drawn into the pixels, with soft joins, a few washed-out blotches and noise
// that dips below the darker grey. Nothing in it is see-through.
const W = 400;
const H = 400;
const LOGO = { x0: 90, y0: 150, x1: 330, y1: 250 };
function generated({ blotches = true, specks = true } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const gx = x + 5; // the grid does not line up with the edge, as in a real picture
      const gy = y + 9;
      const square = ((gx >> 4) + (gy >> 4)) % 2;
      let v = square ? 200 : 250; // as in the picture that was reported: a grey a fifth darker than the white
      const join = Math.min(gx % 16, 15 - (gx % 16), gy % 16, 15 - (gy % 16));
      if (join === 0) v = 226; // the soft join between two squares
      if (specks && random() < 0.004) v = 172 + Math.floor(random() * 14); // a darker dip
      data.set([v, v, v + (random() < 0.3 ? 1 : 0), 255], (y * W + x) * 4);
    }
  }
  if (blotches) { // washed-out patches
    for (const [cx, cy] of [[40, 40], [350, 70], [60, 340], [330, 350]]) {
      for (let y = cy - 14; y < cy + 14; y += 1) for (let x = cx - 14; x < cx + 14; x += 1) data.set([184, 184, 185, 255], (y * W + x) * 4);
    }
  }
  const put = (x, y, rgb) => data.set([...rgb, 255], (y * W + x) * 4);
  for (let y = LOGO.y0; y < LOGO.y1; y += 1) { // a ring
    for (let x = LOGO.x0; x < LOGO.x0 + 100; x += 1) {
      const d = Math.hypot(x - (LOGO.x0 + 50), y - 200);
      if (d < 50 && d > 36) put(x, y, [235, 130, 30]);
    }
  }
  for (let y = 170; y < 205; y += 1) for (let x = 210; x < LOGO.x1; x += 1) put(x, y, [20, 40, 100]); // a bar of text
  for (let k = 0; k < 8; k += 1) for (let y = 228; y < 232; y += 1) for (let x = 212 + k * 15; x < 216 + k * 15; x += 1) put(x, y, [60, 70, 90]); // a tagline's fine dots
  return { data, width: W, height: H };
}
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];
const share = (img, test) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (test(img.data[i])) n += 1; return n / (img.width * img.height); };

describe('US-57 A logo or signature with a drawn-in checkerboard (CR-0020)', () => {
  it('AC-57.1: a logo on a drawn-in checkerboard keeps no checkerboard and no speck', () => {
    const img = generated();
    expect(borderShades(img.data, W, H)).toMatchObject({ checker: true });
    const result = cleanPicture(img);
    expect(result.removed).toBe(true);
    expect(share(img, (a) => a >= 16)).toBeLessThan(0.2); // only the logo is left
    for (const [x, y] of [[5, 5], [200, 20], [40, 40], [350, 70], [60, 340], [330, 350], [20, 200]]) expect(alphaAt(img, x, y)).toBe(0); // paper, blotches and dips
    expect(alphaAt(img, 270, 190)).toBe(255); // the text bar
    expect(alphaAt(img, LOGO.x0 + 50, 200 - 43)).toBe(255); // the ring
  });

  it('AC-57.2: a signature or stamp on a drawn-in checkerboard is cleaned the same way and keeps its colours', () => {
    const img = generated();
    const result = cleanSignature(img);
    expect(result).toMatchObject({ removed: true, reason: '' });
    expect(share(img, (a) => a >= 16)).toBeLessThan(0.2);
    expect(alphaAt(img, 10, 10)).toBe(0);
    const i = (190 * W + 270) * 4;
    expect([...img.data.slice(i, i + 4)]).toEqual([20, 40, 100, 255]); // the ink is as it was, not tinted by the greys
  });

  it('AC-57.3: the empty margins are trimmed to the logo, however many specks the background left', () => {
    const img = generated();
    const { box, trimmed } = cleanPicture(img);
    expect(trimmed).toBe(true);
    expect(box.width).toBeLessThan(0.75 * W);
    expect(box.height).toBeLessThan(0.4 * H);
    expect(box.x).toBeLessThanOrEqual(LOGO.x0);
    expect(box.x + box.width).toBeGreaterThanOrEqual(LOGO.x1);
  });

  it('AC-57.3: specks alone cannot keep the margin, even when the background rule leaves them behind', () => {
    const data = new Uint8ClampedArray(W * H * 4); // a see-through picture with a logo and stray specks
    const put = (x, y) => data.set([20, 40, 100, 255], (y * W + x) * 4);
    for (let y = LOGO.y0; y < LOGO.y1; y += 1) for (let x = LOGO.x0; x < LOGO.x1; x += 1) put(x, y);
    for (const [x, y] of [[5, 5], [395, 8], [10, 390], [390, 395], [200, 6], [3, 200], [380, 120]]) { put(x, y); put(x + 1, y); }
    const box = contentBox(data, W, H);
    expect(box.x).toBeGreaterThan(70);
    expect(box.y).toBeGreaterThan(130);
    expect(box.x + box.width).toBeLessThan(350);
    expect(box.y + box.height).toBeLessThan(270);
  });

  it('AC-57.4: fine details near the logo (a tagline of small dots, a thin letter) stay inside the box', () => {
    const data = new Uint8ClampedArray(W * H * 4);
    const put = (x, y) => data.set([20, 40, 100, 255], (y * W + x) * 4);
    for (let y = 150; y < 200; y += 1) for (let x = 100; x < 300; x += 1) put(x, y);
    for (let k = 0; k < 6; k += 1) for (let y = 222; y < 225; y += 1) for (let x = 110 + k * 12; x < 113 + k * 12; x += 1) put(x, y); // dots 3 x 3, 22 px below the logo
    for (let y = 210; y < 235; y += 1) put(305, y); // a thin letter, one pixel wide
    const box = contentBox(data, W, H);
    expect(box.y + box.height).toBeGreaterThanOrEqual(225);
    expect(box.x + box.width).toBeGreaterThanOrEqual(306);
  });

  it('AC-57.4: the details of the made-up logo (its tagline) are kept', () => {
    const img = generated();
    cleanPicture(img);
    expect(alphaAt(img, 213, 229)).toBe(255);
    expect(alphaAt(img, 213 + 7 * 15, 229)).toBe(255);
  });

  it('AC-57.5: a bigger size changes only the picture: nothing else on the bill moves', async () => {
    localStorage.clear();
    setToday('2027-01-01');
    window.location.hash = '#/settings';
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    const business = { ...REAL_BUSINESS, logo_version: 'abc123def456', signature_version: 'sig123def456', bill_look: {} };
    const app = mountApp(root, { stepDelay: 0, syncDelay: 0, syncPoll: 0, syncRetry: [20, 20, 20], api: fakeApi(), me: meFor({ id: 'u-shree', name: 'Mina Rao', phone: '9811100001', role: 'owner' }, business) });
    try {
      const html = (name, value) => {
        const bar = root.querySelector(`input[name="${name}"]`);
        bar.value = String(value);
        bar.dispatchEvent(new Event('input', { bubbles: true }));
        return root.querySelector('[data-testid="look-preview"] .bill-paper').outerHTML;
      };
      const stripped = (markup) => markup.replace(/(<img[^>]*data-picture="(?:logo|signature)"[^>]*?) style="[^"]*"/g, '$1');
      const small = html('logo_size', 50);
      const big = html('logo_size', 200);
      expect(small).not.toBe(big); // the picture did change
      expect(stripped(small)).toBe(stripped(big)); // and nothing else did: no margin or padding follows it
      const style = (markup) => (markup.match(/data-picture="logo"[^>]*style="([^"]*)"/) || [])[1];
      expect(style(big).split(';').map((x) => x.split(':')[0])).toEqual(['max-width', 'max-height']); // only its own box
      const smallSign = html('signature_size', 50);
      const bigSign = html('signature_size', 200);
      expect(stripped(smallSign)).toBe(stripped(bigSign));
    } finally { app.unmount(); }
  });
});
