// cloudinary.js - upload pictures (profile photos, chat photos) to Cloudinary and build small
// versions of them. Only the https link is saved in Firestore, never the picture itself.
import { CLOUD_NAME, UPLOAD_PRESET } from "./cloudinary-config.js";

const HOST = "https://res.cloudinary.com/";

/** True for a picture we can show: a Cloudinary link or an old data-URL (photos saved before). */
export const isImgSrc = (v) => typeof v === "string" && (v.startsWith("data:image/") || v.startsWith(HOST));
export const isCloudUrl = (v) => typeof v === "string" && v.startsWith(HOST);

export const cloudinaryReady = () => !/^YOUR_/.test(CLOUD_NAME) && !/^YOUR_/.test(UPLOAD_PRESET);

/** data-URL -> Blob (so the compressed JPEG can be uploaded as a file). */
export async function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) throw new Error("Could not read that image.");
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || "image/jpeg" });
}

/**
 * Upload one picture (Blob / File / data-URL). Returns { url, publicId, bytes }.
 * `folder` is only a label, e.g. "profile" or "chat" (the preset's own folder is used if it has one).
 */
export async function uploadImage(file, folder = "") {
  if (!cloudinaryReady()) throw new Error("Cloudinary is not set up. Fill js/cloudinary-config.js.");
  const blob = typeof file === "string" ? await dataUrlToBlob(file) : file;
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("upload_preset", UPLOAD_PRESET);
  if (folder) fd.append("tags", folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || !data || !data.secure_url) {
    throw new Error((data && data.error && data.error.message) || "Could not upload the picture.");
  }
  return { url: data.secure_url, publicId: data.public_id || "", bytes: data.bytes || blob.size || 0 };
}

/** Same picture, resized by Cloudinary: cldUrl(url, "w_300,h_380,c_limit"). Other links are returned unchanged. */
export function cldUrl(url, transform) {
  if (!isCloudUrl(url) || !transform) return url;
  return url.replace("/image/upload/", `/image/upload/${transform},f_auto,q_auto/`);
}
export const thumbUrl = (url) => cldUrl(url, "w_300,h_380,c_limit");
export const avatarUrl = (url, size = 96) => cldUrl(url, `w_${size},h_${size},c_fill,g_face`);
