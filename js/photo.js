// photo.js - shrink a picked image in the browser and return a small JPEG data-URL.
// (Firebase Storage is not used, so pictures are stored as tiny compressed text.)

/**
 * @param {File} file         image picked by the user
 * @param {object} o          { max: longest side in px, quality: 0-1, maxChars: size limit, square: crop to square }
 */
export async function imageToDataUrl(file, { max = 1024, quality = 0.75, maxChars = 600000, square = false } = {}) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const bmp = await loadImage(file);
  let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  let q = quality, out = canvas.toDataURL("image/jpeg", q);
  while (out.length > maxChars && q > 0.3) { q -= 0.1; out = canvas.toDataURL("image/jpeg", q); }
  if (out.length > maxChars) throw new Error("Image is too large. Try a smaller picture.");
  return out;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}
