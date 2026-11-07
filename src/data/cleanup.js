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
const CHECKER_TOLERANCE = 32; // a drawn-in checkerboard is blotchy: its darker squares dip further below its grey (US-57)
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
  const checker = lightest - darkest >= CHECKER_GAP;
  return { low: Math.max(0, darkest - (checker ? CHECKER_TOLERANCE : TOLERANCE)), high: Math.min(255, lightest + TOLERANCE), checker };
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

const MAIN_BLOB = 0.00005; // a shape this much of the picture (at least 24 px) is part of the picture itself, not a speck
const NEAR = 0.04; // a small shape within this much of the picture's size from the main shapes is a detail (a dot, a thin letter)

/**
 * The smallest box holding the picture, with a small border; null when nothing is solid. Specks (a few stray pixels
 * far from the picture, left by a blotchy background or JPEG noise) do not count, so they cannot keep the empty
 * margin: small shapes count only when they are close to the main shapes, so dots, thin letters and a tagline stay (US-57).
 */
export function contentBox(data, width, height, mask = null) {
  const size = width * height;
  const label = new Int32Array(size); // 0 = not solid or not visited, else the shape's number
  const stack = new Int32Array(size);
  const shapes = [null]; // per shape: [area, x0, y0, x1, y1]
  for (let start = 0; start < size; start += 1) {
    if (label[start] || (mask && mask[start]) || data[start * 4 + 3] < SOLID) continue;
    const id = shapes.length;
    const shape = [0, width, height, -1, -1];
    shapes.push(shape);
    label[start] = id;
    let top = 0;
    stack[top] = start;
    top += 1;
    while (top > 0) {
      top -= 1;
      const p = stack[top];
      const x = p % width;
      const y = (p - x) / width;
      shape[0] += 1;
      if (x < shape[1]) shape[1] = x;
      if (y < shape[2]) shape[2] = y;
      if (x > shape[3]) shape[3] = x;
      if (y > shape[4]) shape[4] = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (label[q] || (mask && mask[q]) || data[q * 4 + 3] < SOLID) continue;
          label[q] = id;
          stack[top] = q;
          top += 1;
        }
      }
    }
  }
  if (shapes.length === 1) return null;
  const mainArea = Math.max(24, MAIN_BLOB * size);
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let k = 1; k < shapes.length; k += 1) {
    const [area, a, b, c, d] = shapes[k];
    if (area < mainArea) continue;
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
  }
  if (x1 < 0) { // nothing big: a tiny picture, or all fine detail; keep every solid pixel
    for (let k = 1; k < shapes.length; k += 1) {
      const [, a, b, c, d] = shapes[k];
      x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    }
  } else {
    const near = Math.max(8, Math.round(NEAR * Math.max(x1 - x0 + 1, y1 - y0 + 1)));
    const [m0, n0, m1, n1] = [x0 - near, y0 - near, x1 + near, y1 + near];
    for (let k = 1; k < shapes.length; k += 1) {
      const [area, a, b, c, d] = shapes[k];
      if (area >= mainArea || a < m0 || b < n0 || c > m1 || d > n1) continue; // a speck outside the reach is left out
      x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    }
  }
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

// ---------------------------------------------------------------------------------------------------------------
// A signature or stamp on paper (CR-0019, US-54).
//
// A photo or scan of a signature is not a flat white box: the paper is tinted, lit unevenly and a little noisy, so
// the background rules above find no clean shade and remove nothing. Here the paper is measured locally instead:
// the picture is cut into cells and the paper of a cell is its light end (ink is thin, paper is most of the cell),
// then smoothed between cells. How much darker a pixel is than its own paper decides how much of it stays: the
// paper goes fully see-through, solid ink stays solid, and soft pen edges stay soft (no hard edge, no halo). The
// colour of the ink is worked out so that, laid back on that paper, it looks exactly as it did.
// ---------------------------------------------------------------------------------------------------------------
const PAPER_LIGHT = 140; // the paper is light: its average channel is at least this
const PAPER_PERCENTILE = 0.9; // the paper of a cell is its 90th percentile (ink is the darker tenth or less)
const INK_FLOOR = 0.14; // less darker than the paper than this is paper (camera noise, JPEG blotches, shading)
const INK_FULL = 0.85; // this much darker than the paper is solid ink
const MAX_INK = 0.6; // more of the picture than this is ink: it is a filled picture, not ink on paper
const MIN_INK = 0.0005; // less than this: there is no ink to keep
const SEE_THROUGH = 0.3; // this share already see-through: the picture needs no paper removed
const SHADOW = 0.65; // the paper under a shadow is at least this much of the picture's usual paper
const REACH = 2; // a cell takes the lightest paper within this many cells, so a big solid stamp is not mistaken for paper

/** The paper colour of each cell of a grid laid over the picture: {cell, cols, rows, paper: Float32Array(cols*rows*3)}. */
export function paperMap(data, width, height) {
  const cell = Math.min(96, Math.max(16, Math.round(Math.max(width, height) / 20)));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const paper = new Float32Array(cols * rows * 3);
  const hist = new Uint32Array(256 * 3);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      hist.fill(0);
      const x1 = Math.min(width, (cx + 1) * cell);
      const y1 = Math.min(height, (cy + 1) * cell);
      let count = 0;
      for (let y = cy * cell; y < y1; y += 1) {
        for (let x = cx * cell; x < x1; x += 1) {
          const i = (y * width + x) * 4;
          hist[data[i]] += 1;
          hist[256 + data[i + 1]] += 1;
          hist[512 + data[i + 2]] += 1;
          count += 1;
        }
      }
      const target = Math.max(1, Math.floor(count * PAPER_PERCENTILE));
      for (let ch = 0; ch < 3; ch += 1) {
        let seen = 0;
        let v = 0;
        for (; v < 255; v += 1) { seen += hist[ch * 256 + v]; if (seen >= target) break; }
        paper[(cy * cols + cx) * 3 + ch] = Math.max(1, v);
      }
    }
  }
  // Under a big solid stamp a whole cell is ink: it takes the paper of the cells around it, and no cell is taken to
  // be much darker than the picture's usual paper (a shadow, not ink).
  const usual = [0, 1, 2].map((ch) => {
    const values = [];
    for (let k = ch; k < paper.length; k += 3) values.push(paper[k]);
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.8)];
  });
  const reached = new Float32Array(paper.length);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      for (let ch = 0; ch < 3; ch += 1) {
        let best = 0;
        for (let y = Math.max(0, cy - REACH); y <= Math.min(rows - 1, cy + REACH); y += 1) {
          for (let x = Math.max(0, cx - REACH); x <= Math.min(cols - 1, cx + REACH); x += 1) best = Math.max(best, paper[(y * cols + x) * 3 + ch]);
        }
        reached[(cy * cols + cx) * 3 + ch] = Math.max(best, usual[ch] * SHADOW);
      }
    }
  }
  return { cell, cols, rows, paper: reached };
}

/** For each pixel column (or row), the two cells whose paper it blends and how far it is towards the second. */
const blendAxis = (length, cell, count) => {
  const first = new Int32Array(length);
  const second = new Int32Array(length);
  const toward = new Float32Array(length);
  for (let p = 0; p < length; p += 1) {
    const g = Math.min(count - 1, Math.max(0, (p + 0.5) / cell - 0.5));
    const a = Math.floor(g);
    first[p] = a;
    second[p] = Math.min(count - 1, a + 1);
    toward[p] = g - a;
  }
  return { first, second, toward };
};

/**
 * Make the paper of `image` ({data, width, height}) see-through and keep the ink, in place. Returns
 * {applied, reason}: `reason` says why nothing was changed ('small', 'see-through', 'dark', 'filled' or 'no-ink').
 */
export function inkToTransparent(image) {
  const { data, width, height } = image;
  if (!data || data.length !== width * height * 4 || width < 8 || height < 8) return { applied: false, reason: 'small' };
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < SOLID) clear += 1;
  if (clear / (width * height) >= SEE_THROUGH) return { applied: false, reason: 'see-through' };
  const { cell, cols, rows, paper } = paperMap(data, width, height);
  let light = 0;
  for (let k = 0; k < paper.length; k += 1) light += paper[k];
  if (light / paper.length < PAPER_LIGHT) return { applied: false, reason: 'dark' };
  const xs = blendAxis(width, cell, cols);
  const ys = blendAxis(height, cell, rows);
  const out = new Uint8ClampedArray(data.length);
  let solid = 0;
  const pr = [0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    const ya = ys.first[y] * cols;
    const yb = ys.second[y] * cols;
    const fy = ys.toward[y];
    for (let x = 0; x < width; x += 1) {
      const fx = xs.toward[x];
      const a0 = (ya + xs.first[x]) * 3;
      const a1 = (ya + xs.second[x]) * 3;
      const b0 = (yb + xs.first[x]) * 3;
      const b1 = (yb + xs.second[x]) * 3;
      const i = (y * width + x) * 4;
      let darkest = 0;
      for (let ch = 0; ch < 3; ch += 1) {
        const top = paper[a0 + ch] + (paper[a1 + ch] - paper[a0 + ch]) * fx;
        const bottom = paper[b0 + ch] + (paper[b1 + ch] - paper[b0 + ch]) * fx;
        pr[ch] = Math.max(1, top + (bottom - top) * fy);
        darkest = Math.max(darkest, 1 - data[i + ch] / pr[ch]);
      }
      const keep = Math.min(1, Math.max(0, (darkest - INK_FLOOR) / (INK_FULL - INK_FLOOR)));
      if (keep <= 0) continue; // paper: stays see-through (the buffer starts at zero)
      for (let ch = 0; ch < 3; ch += 1) out[i + ch] = (data[i + ch] - pr[ch] * (1 - keep)) / keep;
      out[i + 3] = Math.round(keep * 255);
      if (keep > 0.5) solid += 1;
    }
  }
  const share = solid / (width * height);
  if (share > MAX_INK) return { applied: false, reason: 'filled' };
  if (share < MIN_INK) return { applied: false, reason: 'no-ink' };
  data.set(out);
  return { applied: true, reason: '' };
}

/**
 * Clean a signature or stamp: a drawn-in checkerboard by the flat rules of `cleanPicture`; otherwise ink on paper first
 * (a photo or scan), and when that does not apply the flat background rules. Returns {removed, box, trimmed, reason}; `reason` says why a picture that
 * still has its background was left alone ('dark', 'filled', 'no-ink'), and is '' otherwise.
 */
export function cleanSignature(image) {
  const { data, width, height } = image;
  // A drawn-in checkerboard is not paper: its two greys would read as faint ink, so the flat rule takes it first (US-57).
  const edge = borderShades(data, width, height);
  if (edge && edge.checker) {
    const flat = cleanPicture(image);
    if (flat.removed) return { ...flat, reason: '' };
  }
  const ink = inkToTransparent(image);
  if (ink.applied) {
    const box = contentBox(data, width, height);
    const whole = { x: 0, y: 0, width, height };
    const trimmed = Boolean(box) && (box.width < width * 0.95 || box.height < height * 0.95);
    return { removed: true, box: trimmed ? box : whole, trimmed, reason: '' };
  }
  const flat = cleanPicture(image);
  const left = !flat.removed && ['dark', 'filled', 'no-ink'].includes(ink.reason) ? ink.reason : '';
  return { ...flat, reason: left };
}
