import { describe, it, expect, vi } from 'vitest';
import { cleanSignature, cleanPicture, inkToTransparent, paperMap } from '../src/data/cleanup.js';
import { preparePicture } from '../src/data/logo.js';

// A made-up photo or scan of a signature: a wavy pen stroke with soft edges on "paper" of a given kind.
function signature({ width = 640, height = 240, paper, ink = [20, 30, 120] }) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const paperAt = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paper(x, y, width, random);
      const centre = height / 2 + Math.sin(x / 25) * height * 0.25;
      const cover = Math.max(0, Math.min(1, (3.5 - Math.abs(y - centre)) / 2)); // 0 paper .. 1 ink, soft at the edge
      const i = (y * width + x) * 4;
      data[i] = r * (1 - cover) + ink[0] * cover;
      data[i + 1] = g * (1 - cover) + ink[1] * cover;
      data[i + 2] = b * (1 - cover) + ink[2] * cover;
      data[i + 3] = 255;
      paperAt.push([r, g, b, cover]);
    }
  }
  return { data, width, height, paperAt };
}
const PAPERS = {
  'a clean white scan': () => [255, 255, 255],
  'a scan with JPEG noise': (x, y, w, random) => { const n = Math.round((random() - 0.5) * 8); return [250 + n, 250 + n, 250 + n]; },
  'a phone photo of warm paper, lit from one side': (x, y, w) => { const s = 215 + 35 * (x / w); return [s, s - 6, s - 18]; },
  'a phone photo with shading and noise': (x, y, w, random) => { const s = 200 + 50 * (x / w) + (random() - 0.5) * 10; return [s, s - 4, s - 14]; },
};
const alphaOf = (img) => Array.from({ length: img.width * img.height }, (_, p) => img.data[p * 4 + 3]);
const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('US-54 A signature or stamp from a photo or scan becomes see-through (CR-0019)', () => {
  for (const [name, paper] of Object.entries(PAPERS)) {
    it(`AC-54.1: ${name} loses its paper and keeps only the ink`, () => {
      const img = signature({ paper });
      expect(cleanPicture(structuredClone({ ...img, data: new Uint8ClampedArray(img.data) })).removed).toBe(name.includes('clean white') || name.includes('JPEG noise'));
      const result = cleanSignature(img);
      expect(result.removed).toBe(true);
      expect(result.reason).toBe('');
      const alpha = alphaOf(img);
      const clear = alpha.filter((a) => a === 0).length / alpha.length;
      const solid = alpha.filter((a) => a > 127).length / alpha.length;
      expect(clear).toBeGreaterThan(0.95); // the paper is gone
      expect(solid).toBeGreaterThan(0.01); // the ink is there
      expect(solid).toBeLessThan(0.05); // and only the ink
      expect(at(img, 2, 2)[3]).toBe(0);
      expect(at(img, 637, 237)[3]).toBe(0);
    });
  }

  it('AC-54.1: the older rule for a flat white background does not manage a photo of paper (why this was needed)', () => {
    const img = signature({ paper: PAPERS['a phone photo of warm paper, lit from one side'] });
    expect(cleanPicture(img).removed).toBe(false);
    expect(alphaOf(img).every((a) => a === 255)).toBe(true); // a solid box, as the founder saw
  });

  it('AC-54.2: soft pen edges stay soft, with no halo, and the ink keeps its colour', () => {
    for (const ink of [[20, 30, 120], [10, 10, 10], [180, 20, 30]]) {
      const img = signature({ paper: PAPERS['a phone photo with shading and noise'], ink });
      const { paperAt } = img;
      cleanSignature(img);
      let soft = 0;
      let centres = 0;
      for (let p = 0; p < img.width * img.height; p += 1) {
        const [pr, pg, pb, cover] = paperAt[p];
        const [r, g, b, a] = at(img, p % img.width, Math.floor(p / img.width));
        if (a > 0 && a < 255) soft += 1; // a soft edge exists
        if (cover === 1) { // the middle of the stroke: the ink's own colour, solid
          centres += 1;
          expect(a).toBe(255);
          expect(Math.abs(r - ink[0]) + Math.abs(g - ink[1]) + Math.abs(b - ink[2])).toBeLessThanOrEqual(12);
        }
        if (a >= 200) expect(cover).toBeGreaterThan(0.3); // nothing solid where there is only paper (no halo)
        if (a > 0) { // laid back on its own paper, a kept pixel looks as it did (within the picture's noise)
          const k = a / 255;
          const looks = [r * k + pr * (1 - k), g * k + pg * (1 - k), b * k + pb * (1 - k)];
          const was = [pr * (1 - cover) + ink[0] * cover, pg * (1 - cover) + ink[1] * cover, pb * (1 - cover) + ink[2] * cover];
          expect(Math.max(...looks.map((v, i) => Math.abs(v - was[i])))).toBeLessThan(40);
        }
      }
      expect(soft).toBeGreaterThan(200);
      expect(centres).toBeGreaterThan(200);
    }
  });

  it('AC-54.2: a big solid stamp stays solid; it is not taken for paper', () => {
    const disk = (x, y) => ((x - 150) ** 2 + (y - 150) ** 2 < 110 ** 2 ? [190, 25, 35] : [244, 242, 236]);
    const data = new Uint8ClampedArray(300 * 300 * 4);
    for (let y = 0; y < 300; y += 1) for (let x = 0; x < 300; x += 1) data.set([...disk(x, y), 255], (y * 300 + x) * 4);
    const img = { data, width: 300, height: 300 };
    expect(cleanSignature(img).removed).toBe(true);
    const [r, g, b, a] = at(img, 150, 150); // the middle of the disk keeps its colour and is (all but) fully solid
    expect(Math.abs(r - 190) + Math.abs(g - 25) + Math.abs(b - 35)).toBeLessThanOrEqual(8);
    expect(a).toBeGreaterThanOrEqual(245);
    expect(at(img, 80, 150)[3]).toBeGreaterThanOrEqual(245);
    expect(at(img, 3, 3)[3]).toBe(0); // the paper corner
  });

  it('AC-54.3: the empty margins are trimmed so the signature fills its space', () => {
    const img = signature({ paper: PAPERS['a clean white scan'] });
    const result = cleanSignature(img);
    expect(result.trimmed).toBe(true);
    expect(result.box.width).toBeLessThanOrEqual(640);
    expect(result.box.height).toBeLessThan(0.75 * 240); // the wave uses about two thirds of the height
    for (let p = 0; p < img.width * img.height; p += 1) { // every kept pixel is inside the box
      if (img.data[p * 4 + 3] < 16) continue;
      const x = p % img.width;
      const y = Math.floor(p / img.width);
      expect(x >= result.box.x && x < result.box.x + result.box.width && y >= result.box.y && y < result.box.y + result.box.height).toBe(true);
    }
  });

  it('AC-54.4: a dark background is left alone, with its reason', () => {
    const img = signature({ paper: () => [40, 40, 50] });
    const before = new Uint8ClampedArray(img.data);
    const result = cleanSignature(img);
    expect(result).toMatchObject({ removed: false, reason: 'dark' });
    expect(img.data).toEqual(before);
  });

  it('AC-54.4: a coloured background is left alone', () => {
    const img = signature({ paper: () => [60, 120, 190], ink: [250, 250, 250] });
    const before = new Uint8ClampedArray(img.data);
    const result = cleanSignature(img);
    expect(result.removed).toBe(false);
    expect(['dark', 'filled']).toContain(result.reason); // either way the owner is told and nothing is lost
    expect(img.data).toEqual(before);
  });

  it('AC-54.4: a picture that is mostly ink is left alone, with its reason', () => {
    const data = new Uint8ClampedArray(200 * 200 * 4);
    let seed = 5;
    for (let p = 0; p < 200 * 200; p += 1) {
      seed = (seed * 16807) % 2147483647;
      const ink = seed / 2147483647 < 0.65; // dense speckle: 65% black, so the cell's paper is still the white
      data.set(ink ? [10, 10, 10, 255] : [250, 250, 250, 255], p * 4);
    }
    const img = { data, width: 200, height: 200 };
    expect(inkToTransparent(img)).toMatchObject({ applied: false, reason: 'filled' });
  });

  it('AC-54.4: blank paper with no ink is left alone, with its reason', () => {
    const img = signature({ paper: PAPERS['a clean white scan'], ink: [255, 255, 255] });
    expect(cleanSignature(img)).toMatchObject({ removed: false, reason: 'no-ink' });
  });

  it('AC-54.4: a picture that is already see-through is not touched by the ink rule (it is only trimmed)', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4); // all see-through ...
    for (let y = 40; y < 60; y += 1) for (let x = 20; x < 80; x += 1) data.set([10, 10, 10, 255], (y * 100 + x) * 4); // ... but a bar
    const img = { data, width: 100, height: 100 };
    expect(inkToTransparent(img)).toMatchObject({ applied: false, reason: 'see-through' });
    expect(cleanSignature(img)).toMatchObject({ removed: false, trimmed: true });
  });

  it('AC-54.1: paperMap measures the paper of each cell, lighter than the ink on it', () => {
    const img = signature({ paper: PAPERS['a phone photo of warm paper, lit from one side'] });
    const { cols, rows, paper } = paperMap(img.data, img.width, img.height);
    expect(paper.length).toBe(cols * rows * 3);
    expect(paper[0]).toBeGreaterThan(205); // left: 215 less a little
    expect(paper[(cols - 1) * 3]).toBeGreaterThan(paper[0]); // right is lit more
  });

  it('AC-54.5: a signature goes through the signature rule and a logo through the logo rule', async () => {
    // a 3x3 "picture" per call; what matters is which cleaner ran, seen in what the callbacks get
    const run = async (kind, pixels) => {
      const onCleaned = vi.fn();
      const onWarn = vi.fn();
      const image = { data: pixels, width: 8, height: 8 };
      const canvasOf = (width, height) => ({
        width, height,
        getContext: () => ({ drawImage() {}, getImageData: () => image, putImageData() {} }),
        toDataURL: (type) => `data:${type};base64,AAAA`,
      });
      await preparePicture({ size: 10 }, { decode: async () => ({ width: 8, height: 8 }), canvasOf, kind, onCleaned, onWarn });
      return { onCleaned, onWarn };
    };
    const dark = () => { const d = new Uint8ClampedArray(8 * 8 * 4); for (let p = 0; p < 64; p += 1) d.set([40, 40, 50, 255], p * 4); return d; };
    const asSignature = await run('signature', dark());
    expect(asSignature.onWarn).toHaveBeenCalledWith({ code: 'background-kept', reason: 'dark' }); // the signature rule says why
    const asLogo = await run('logo', dark());
    expect(asLogo.onWarn).not.toHaveBeenCalled(); // the logo is cleaned exactly as before (AC-54.6)
    expect(asLogo.onCleaned).not.toHaveBeenCalled();
  });

  it('AC-54.6: the logo rule is the one it always was', () => {
    const checker = { data: new Uint8ClampedArray(120 * 120 * 4), width: 120, height: 120 };
    for (let y = 0; y < 120; y += 1) for (let x = 0; x < 120; x += 1) checker.data.set(x >= 40 && x < 80 && y >= 40 && y < 80 ? [20, 40, 200, 255] : ((x >> 3) + (y >> 3)) % 2 ? [204, 204, 204, 255] : [255, 255, 255, 255], (y * 120 + x) * 4);
    expect(cleanPicture(checker)).toMatchObject({ removed: true });
    expect(at(checker, 0, 0)[3]).toBe(0);
    expect(at(checker, 60, 60)).toEqual([20, 40, 200, 255]);
  });
});
