// =============================================================================
// avatars.js - show other people's profile photos everywhere (chat list, chat header,
// Friends, Followers, Following, Home). A photo is fetched ONCE per person (1 read from
// handles/{ID}), shrunk to a small 96 px picture and remembered on this device for 24 hours.
// Until it arrives (or when the person has no photo) the initials circle stays.
// =============================================================================
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const KEY = "ix_photos_v1", TTL = 24 * 3600 * 1000, MAX = 120;
let mem = null;
const load = () => { if (!mem) { try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { mem = {}; } } return mem; };
function save() {
  const m = load();
  const keys = Object.keys(m);
  if (keys.length > MAX) keys.sort((a, b) => m[a].t - m[b].t).slice(0, keys.length - MAX).forEach((k) => delete m[k]);
  try { localStorage.setItem(KEY, JSON.stringify(m)); }
  catch { Object.keys(m).sort((a, b) => m[a].t - m[b].t).slice(0, 30).forEach((k) => delete m[k]); try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} }
}
const isImg = (s) => typeof s === "string" && s.startsWith("data:image/");

function shrink(src, size = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = size;
        c.getContext("2d").drawImage(img, 0, 0, size, size);
        resolve(c.toDataURL("image/jpeg", 0.72));
      } catch { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

const inflight = new Map();
/** Resolves with a small data-URL, or "" when the person has no photo. */
export function fetchPhoto(uid, userId) {
  const e = load()[uid];
  if (e && Date.now() - e.t < TTL) return Promise.resolve(e.d);
  if (inflight.has(uid)) return inflight.get(uid);
  const p = (async () => {
    try {
      let id = userId;
      if (!id) { const d = await getDoc(doc(db, "directory", uid)); id = d.exists() ? d.data().userId : ""; }
      if (!id) return e ? e.d : "";
      const s = await getDoc(doc(db, "handles", id));
      const ph = s.exists() ? s.data().photo : "";
      const d = isImg(ph) ? await shrink(ph) : "";
      load()[uid] = { t: Date.now(), d }; save();
      return d;
    } catch { return e ? e.d : ""; }
    finally { inflight.delete(uid); }
  })();
  inflight.set(uid, p);
  return p;
}
export const cachedPhoto = (uid) => (load()[uid] || {}).d || "";

function setBg(el, d) { el.textContent = ""; el.classList.add("has-photo"); el.style.backgroundImage = 'url("' + d + '")'; }

/** Put the person's photo on an avatar element. known = a photo we already have (optional). */
export function applyPhoto(el, uid, userId, known) {
  if (!el || !uid) return;
  const c = isImg(known) ? known : cachedPhoto(uid);
  if (c) setBg(el, c);
  fetchPhoto(uid, userId).then((d) => { if (d && el.isConnected !== false) setBg(el, d); });
}
