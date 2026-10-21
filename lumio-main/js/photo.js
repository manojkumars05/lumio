// photo.js - shrink a picked image in the browser and return a small JPEG data-URL.
// (Firebase Storage is not used, so pictures are stored as tiny compressed text.)
//
// Hardened for phone screenshots:
//  - very long screenshots are decoded straight to a small size (a giant image can not be drawn
//    on a phone canvas, which used to give an all-white picture);
//  - transparent PNGs are flattened onto the app's dark colour, not white;
//  - the result is checked, and if it came out blank the picture is read a second way.

const BG = "#141233";   // flatten colour (matches the dark app)

/* ------------------------------------------------------------ decoding --- */
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that image."));
    r.readAsDataURL(file);
  });
}

/** Returns { src, w, h, release } - src is an <img> or ImageBitmap that is safe to draw. */
async function decode(file, targetMax, mode = "auto") {
  if (!file || !String(file.type).startsWith("image/")) throw new Error("Please choose an image file.");
  if (mode === "dataurl") {                       // second way of reading, used if the first came out blank
    const img = await loadImg(await readAsDataUrl(file));
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, release() {} };
  }
  const url = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(url);          // only after drawing is finished
  let img;
  try { img = await loadImg(url); } catch (e) { release(); throw e; }
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) { release(); throw new Error("Could not read that image."); }
  const huge = Math.max(nw, nh) > 4096 || nw * nh > 30e6;  // long scrolling screenshots, 100 MP photos
  if (huge && window.createImageBitmap) {
    const s = Math.min(1, (targetMax * 2) / Math.max(nw, nh));
    try {
      const bmp = await createImageBitmap(file, {
        resizeWidth: Math.max(1, Math.round(nw * s)), resizeHeight: Math.max(1, Math.round(nh * s)),
        resizeQuality: "high", imageOrientation: "from-image",
      });
      release();
      return { src: bmp, w: bmp.width, h: bmp.height, release() { try { bmp.close(); } catch {} } };
    } catch { /* fall back to the <img> */ }
  }
  return { src: img, w: nw, h: nh, release };
}

/* ------------------------------------------------------------- drawing --- */
/** Draw the (sx,sy,sw,sh) part of src into a new w x h canvas, halving step by step when shrinking a lot. */
function draw(src, sx, sy, sw, sh, w, h) {
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw / 2 > w && ch / 2 > h && cw > 64) {            // big reductions look better in steps
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(cw / 2)); t.height = Math.max(1, Math.round(ch / 2));
    const tc = t.getContext("2d");
    tc.imageSmoothingQuality = "high";
    tc.drawImage(cur, cx, cy, cw, ch, 0, 0, t.width, t.height);
    cur = t; cx = 0; cy = 0; cw = t.width; ch = t.height;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h);
  return c;
}
/** True when the canvas shows one flat colour only (white or dark) - i.e. drawing failed. */
function looksBlank(canvas) {
  try {
    const t = document.createElement("canvas"); t.width = t.height = 12;
    const x = t.getContext("2d"); x.drawImage(canvas, 0, 0, 12, 12);
    const d = x.getImageData(0, 0, 12, 12).data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v < min) min = v; if (v > max) max = v; }
    return max - min < 4;
  } catch { return false; }
}
function squeeze(canvas, quality, maxChars) {
  let q = quality, out = canvas.toDataURL("image/jpeg", q);
  while (out.length > maxChars && q > 0.3) { q -= 0.08; out = canvas.toDataURL("image/jpeg", q); }
  return out.length > maxChars ? "" : out;
}

/** Run job(decoded); if the picture came out blank, decode it the other way and run job again. */
async function withDecode(file, targetMax, job) {
  const first = await decode(file, targetMax);
  try {
    const r = await job(first, false);
    if (!r.blank) return r.out;
  } finally { first.release(); }
  const second = await decode(file, targetMax, "dataurl");
  try { return (await job(second, true)).out; } finally { second.release(); }
}

/* -------------------------------------------------------------- public --- */
/**
 * @param {File} file  image picked by the user
 * @param {object} o   { max: longest side in px, quality: 0-1, maxChars: size limit, square: crop to square }
 */
export async function imageToDataUrl(file, { max = 1024, quality = 0.75, maxChars = 600000, square = false } = {}) {
  return withDecode(file, max, async (d, retry) => {
    let sw = d.w, sh = d.h, sx = 0, sy = 0;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
    let scale = Math.min(1, max / Math.max(sw, sh));
    for (let round = 0; round < 5; round++) {
      const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
      const canvas = draw(d.src, sx, sy, sw, sh, w, h);
      if (!retry && round === 0 && looksBlank(canvas)) return { blank: true };
      const out = squeeze(canvas, quality, maxChars);
      if (out) return { out };
      scale *= 0.8;                                         // still too big: make it smaller
    }
    throw new Error("Image is too large. Try a smaller picture.");
  });
}

/**
 * Chat thumbnail: at most `width` wide and `maxHeight` tall. A tall screenshot is cropped to
 * its top part (a photo to its middle) so the bubble never becomes a huge tower; tapping the
 * photo opens the complete picture.
 */
export async function makeThumb(file, { width = 300, maxHeight = 380, quality = 0.62, maxChars = 36000 } = {}) {
  return withDecode(file, 1000, async (d, retry) => {
    const cap = maxHeight / width;
    let sw = d.w, sh = d.h, sx = 0, sy = 0;
    if (sh / sw > cap) {
      sh = Math.round(sw * cap);
      sy = d.h / d.w > 1.9 ? 0 : Math.round((d.h - sh) / 2);   // screenshots: top; photos: middle
    }
    let w = Math.min(width, sw);
    for (let round = 0; round < 5; round++) {
      const h = Math.max(1, Math.round((w * sh) / sw));
      const canvas = draw(d.src, sx, sy, sw, sh, Math.max(1, Math.round(w)), h);
      if (!retry && round === 0 && looksBlank(canvas)) return { blank: true };
      const out = squeeze(canvas, quality, maxChars);
      if (out) return { out };
      w *= 0.85;
    }
    throw new Error("Could not make a preview of this photo.");
  });
}
