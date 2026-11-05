// Clean a logo or stamp picture of its background and empty edges, in the browser (CR-0019, US-53).
//
// A picture saved from a website often has the grey-and-white "transparent" checkerboard drawn into its pixels, so
// it is not transparent at all; others have a plain white box around them. When the edge of the picture is made of
// light, colourless shades (one for a plain box, two or a few more for a checkerboard and its soft joins), that
// background is removed from the edges inwards (a shape of the same colour
// inside the logo, not touching the outside, stays). The empty edges are then trimmed so the logo fills its space.
// Anything else (a coloured background, a photo, a logo that touches the edge) is left alone.

const LIGHT = 170; // the background is light: every channel at least this
const SPREAD = 16; // and colourless: its channels differ by at most this
const DOMINANT = 0.12; // a shade must make up this much of the edge to count as the background
const COVERED = 0.85; // and the background shades together this much of it
const TOLERANCE = 12; // how far from the background shades a pixel may be and still count as background
const SOLID = 16; // a pixel with at least this much opacity is part of the picture
const MIN_REMOVED = 0.02; // less than this is not a background worth removing
const CHECKER_GAP = 20; // two edge shades this far apart are a checkerboard
const MIN_PATCH = 24; // an enclosed patch smaller than this is left alone
const MAX_REMOVED = 0.98; // more than this means the "background" is the picture, so nothing is removed

const level = (r, g, b) => (r + g + b) / 3;
const colourless = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) <= SPREAD;

/** The light, colourless shades the picture's edge is made of ({low, high, checker}), or null if it is not a clean background. */
export function borderShades(data, width, height) {
  const buckets = new Map();
  let seen = 0;
  let edge = 0;
  const take = (x, y) => {
    const i = (y * width + x) * 4;
    edge += 1;
    if (data[i + 3] < SOLID) return;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    buckets.set(key, (buckets.get(key) || 0) + 1);
    seen += 1;
  };
  for (let x = 0; x < width; x += 1) { take(x, 0); take(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { take(0, y); take(width - 1, y); }
  if (seen < edge * 0.5) return null; // the edge is already mostly transparent
  const shades = [];
  let covered = 0;
  for (const [key, count] of buckets) {
    if (count / seen < DOMINANT) continue;
    const r = ((key >> 8) << 4) + 8;
    const g = (((key >> 4) & 15) << 4) + 8;
    const b = ((key & 15) << 4) + 8;
    if (Math.min(r, g, b) < LIGHT || !colourless(r, g, b)) return null; // a coloured or dark edge is not a background to remove
    shades.push(level(r, g, b));
    covered += count;
  }
  if (!shades.length || covered / seen < COVERED) return null; // any number of light shades is fine: a checkerboard's soft joins add some
  const lightest = Math.max(...shades);
  const darkest = Math.min(...shades);
  // two clearly different shades on the edge (a white and a grey) mean a checkerboard, not a plain box
  return { low: Math.max(0, darkest - TOLERANCE), high: Math.min(255, lightest + TOLERANCE), checker: lightest - darkest >= CHECKER_GAP };
}

/** A test for "this pixel is one of the background shades" (or already see-through). */
const shadeTest = (data, low, high) => (p) => {
  const i = p * 4;
  if (data[i + 3] < SOLID) return true;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (!colourless(r, g, b)) return false;
  const v = level(r, g, b);
  return v >= low && v <= high;
};

/** Which pixels are background: those joined to the edge through pixels of the background shades. */
export function backgroundMask(data, width, height, { low, high }) {
  const mask = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  const isBackground = shadeTest(data, low, high);
  const push = (p) => { if (!mask[p] && isBackground(p)) { mask[p] = 1; stack[top] = p; top += 1; } };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }
  while (top > 0) {
    top -= 1;
    const p = stack[top];
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < width * (height - 1)) push(p + width);
  }
  return mask;
}

/**
 * Checkerboard that the edge flood could not reach, because a logo's own ring or letter encloses it. A patch of
 * background shades that holds both the light and the dark shade of the checkerboard in turn is checkerboard; a
 * patch of one shade (white inside a coloured badge) is part of the logo and stays. Adds such patches to `mask`.
 */
export function enclosedCheckerboard(data, width, height, mask, { low, high }) {
  const isBackground = shadeTest(data, low, high);
  const middle = (low + high) / 2;
  const seen = new Uint8Array(width * height);
  const patch = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || seen[start] || !isBackground(start)) continue;
    let size = 0;
    let dark = 0;
    let top = 0;
    seen[start] = 1;
    stack[top] = start;
    top += 1;
    while (top > 0) {
      top -= 1;
      const p = stack[top];
      patch[size] = p;
      size += 1;
      const i = p * 4;
      if (level(data[i], data[i + 1], data[i + 2]) < middle) dark += 1;
      const x = p % width;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < width * (height - 1) ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && !mask[q] && !seen[q] && isBackground(q)) { seen[q] = 1; stack[top] = q; top += 1; }
      }
    }
    const darkShare = dark / size;
    if (size >= MIN_PATCH && darkShare >= 0.2 && darkShare <= 0.8) for (let k = 0; k < size; k += 1) mask[patch[k]] = 1;
  }
}

/** The smallest box holding every solid pixel, with a small border; null when nothing is solid. */
export function contentBox(data, width, height, mask = null) {
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if ((mask && mask[p]) || data[p * 4 + 3] < SOLID) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const pad = Math.max(2, Math.round(0.03 * Math.max(x1 - x0 + 1, y1 - y0 + 1)));
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  const right = Math.min(width, x1 + 1 + pad);
  const bottom = Math.min(height, y1 + 1 + pad);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Remove the background of `image` ({data, width, height}, changed in place) and find the box to keep.
 * Returns {removed, box, trimmed}: whether a background was removed, the box of the picture to keep (the whole
 * picture when there is nothing to trim) and whether that box is smaller than the picture.
 */
export function cleanPicture(image) {
  const { data, width, height } = image;
  const whole = { x: 0, y: 0, width, height };
  if (!data || data.length !== width * height * 4 || width < 4 || height < 4) return { removed: false, box: whole, trimmed: false };
  let mask = null;
  const shades = borderShades(data, width, height);
  if (shades) {
    const found = backgroundMask(data, width, height, shades);
    if (shades.checker) enclosedCheckerboard(data, width, height, found, shades);
    let count = 0;
    for (let p = 0; p < found.length; p += 1) count += found[p];
    const share = count / found.length;
    if (share >= MIN_REMOVED && share <= MAX_REMOVED) mask = found;
  }
  if (mask) for (let p = 0; p < mask.length; p += 1) if (mask[p]) data[p * 4 + 3] = 0;
  const box = contentBox(data, width, height);
  const trimmed = Boolean(box) && (box.width < width * 0.95 || box.height < height * 0.95);
  return { removed: Boolean(mask), box: trimmed ? box : whole, trimmed };
}
