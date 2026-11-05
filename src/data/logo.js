// Turn a picture the owner chose into a sharp logo, signature or stamp (a data URL), in the browser (CR-0019, US-52).
//
// Any PNG, JPEG or WebP of up to 10 MB is accepted. It is scaled down (never up) to at most 800 px on its longest
// side, with smoothing, so it stays sharp when printed. A picture with see-through parts stays a PNG, which keeps
// them see-through: if that PNG is still too big it is made smaller, never turned into a JPEG (JPEG has no
// transparency, so the background would turn into a solid box). A solid picture is a PNG when that is small enough
// (crisp edges for a stamp or line art) and a high-quality JPEG when it is not.
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 800;
export const MAX_BYTES = 900 * 1024; // what is sent; the server keeps up to 1 MB
export const PNG_PREFERRED_BYTES = 350 * 1024;
export const SMALLEST_SIDE = 160;
export const TOO_BIG = 'That picture is bigger than 10 MB. Choose a smaller one.';
export const CANT_USE = "That picture couldn't be used. Choose a PNG, JPEG or WebP.";
export const TOO_DETAILED = 'That picture is too detailed to keep sharp. Choose a simpler one.';

/** The picture's size when its longest side is at most `max`; a smaller picture is left as it is. */
export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const bytesOf = (url) => Math.floor((url.length - url.indexOf(',') - 1) * 0.75);

/** True when any pixel is not fully solid, so the picture must stay a PNG. */
export function hasTransparency(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export async function preparePicture(file, { decode = (f) => createImageBitmap(f), canvasOf = makeCanvas } = {}) {
  if (file.size > MAX_INPUT_BYTES) throw new Error(TOO_BIG);
  let bitmap;
  try { bitmap = await decode(file); } catch { throw new Error(CANT_USE); }
  for (let side = MAX_SIDE; side >= SMALLEST_SIDE; side = Math.floor(side * 0.75)) {
    const { width, height } = fitSize(bitmap.width, bitmap.height, side);
    const canvas = canvasOf(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const png = canvas.toDataURL('image/png');
    if (hasTransparency(ctx, width, height)) {
      if (bytesOf(png) <= MAX_BYTES) return png;
      continue; // smaller, and still a PNG
    }
    if (bytesOf(png) <= PNG_PREFERRED_BYTES) return png;
    for (const quality of [0.92, 0.85]) {
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      if (bytesOf(jpeg) <= MAX_BYTES) return jpeg;
    }
    if (bytesOf(png) <= MAX_BYTES) return png;
  }
  throw new Error(TOO_DETAILED);
}

export const resizeLogo = preparePicture; // the name the app has always used for it
