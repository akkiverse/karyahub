// Turn a picture the owner chose into a small logo (a PNG data URL no bigger than 256 px), in the browser.
const MAX_SIDE = 256;
const MAX_BYTES = 200 * 1024;

export async function resizeLogo(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const [type, quality] of [['image/png'], ['image/jpeg', 0.9], ['image/jpeg', 0.7]]) {
    const url = canvas.toDataURL(type, quality);
    if (url.length * 0.75 <= MAX_BYTES) return url;
  }
  throw new Error('That picture is too detailed for a logo. Choose a simpler one.');
}
