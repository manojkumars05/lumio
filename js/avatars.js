// =============================================================================
// avatars.js - profile photos everywhere (chat list, chat header, Friends, Followers, Home).
// Cheap and up to date ("photoAt" method):
//  - Every photo change writes directory/{uid}.photoAt = now (see settings.js / home.js).
//  - On page load, and when you come back to the tab, ONE query asks: "which photos changed
//    since I last looked?". Only those few pictures are read. Nobody changed -> nothing to read.
//  - A person we have never seen is read once (directory/{uid}) and kept on this device.
// Until a photo arrives, the initials circle stays.
// =============================================================================
import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { isImgSrc, isCloudUrl, avatarUrl } from "./cloudinary.js";

const KEY = "ix_photos_v2", SINCE = "ix_photo_since", MAX = 300, PAGE = 30;
const isImg = isImgSrc;
let mem = null;
const load = () => { if (!mem) { try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { mem = {}; } } return mem; };
function save() {
  const m = load();
  const keys = Object.keys(m);
  if (keys.length > MAX) keys.sort((a, b) => m[a].t - m[b].t).slice(0, keys.length - MAX).forEach((k) => delete m[k]);
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}
function cache(uid, d) { load()[uid] = { d, t: Date.now() }; save(); }
export const cachedPhoto = (uid) => (load()[uid] || {}).d || "";

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
async function toSrc(ph) {
  if (isCloudUrl(ph)) return avatarUrl(ph);
  if (isImg(ph)) return shrink(ph);
  return "";
}

const initials = new WeakMap();   // avatar element -> its original letters
function setBg(el, d) {
  if (!initials.has(el)) initials.set(el, el.textContent);
  el.textContent = ""; el.classList.add("has-photo"); el.style.backgroundImage = 'url("' + d + '")';
  if (isCloudUrl(d) && d.includes(",f_auto,q_auto/")) {      // resized copy blocked? use the original
    const t = new Image();
    t.onerror = () => { el.style.backgroundImage = 'url("' + d.replace(/\/image\/upload\/[^/]*,f_auto,q_auto\//, "/image/upload/") + '")'; };
    t.src = d;
  }
}
function clearBg(el) {
  el.classList.remove("has-photo"); el.style.backgroundImage = "";
  if (initials.has(el)) el.textContent = initials.get(el);
}

const shown = new Map();   // uid -> Set of avatar elements on this page
function paint(uid, d) {
  const set = shown.get(uid); if (!set) return;
  set.forEach((el) => { if (!el.isConnected) { set.delete(el); return; } d ? setBg(el, d) : clearBg(el); });
}

const inflight = new Map();
function fetchOne(uid) {
  if (inflight.has(uid)) return inflight.get(uid);
  const p = (async () => {
    try {
      const s = await getDoc(doc(db, "directory", uid));
      const d = s.exists() ? await toSrc(s.data().photo || "") : "";
      cache(uid, d); paint(uid, d);
      return d;
    } catch { return ""; }
    finally { inflight.delete(uid); }
  })();
  inflight.set(uid, p);
  return p;
}

// Ask once: which photos changed since we last looked? (1 query, reads only the changed ones)
let checking = null, lastCheck = 0;
export function checkPhotoChanges() {
  if (checking) return checking;
  lastCheck = Date.now();
  checking = (async () => {
    try {
      const since = Number(localStorage.getItem(SINCE)) || (Date.now() - 10 * 60 * 1000);
      let newest = since, cursor = null;
      for (let page = 0; page < 5; page++) {
        const parts = [collection(db, "directory"), where("photoAt", ">", Timestamp.fromMillis(since)), orderBy("photoAt"), limit(PAGE)];
        if (cursor) parts.push(startAfter(cursor));
        const snap = await getDocs(query(...parts));
        for (const d of snap.docs) {
          const x = d.data();
          const at = x.photoAt && x.photoAt.toMillis ? x.photoAt.toMillis() : 0;
          if (at > newest) newest = at;
          const pic = await toSrc(x.photo || "");
          cache(d.id, pic); paint(d.id, pic);
        }
        if (snap.size < PAGE) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      localStorage.setItem(SINCE, String(newest > since ? newest : Date.now() - 60 * 1000));
    } catch (e) {
      console.warn("Photo check skipped:", e);
      checking = null;                     // try again next time
    }
  })();
  return checking;
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastCheck > 60 * 1000) { checking = null; checkPhotoChanges(); }
});

/** Show a person's photo on an avatar element. known = a photo we already have (optional). */
export function applyPhoto(el, uid, userId, known) {
  if (!el || !uid) return;
  let set = shown.get(uid);
  if (!set) { set = new Set(); shown.set(uid, set); }
  set.add(el);
  const c = isImg(known) ? known : cachedPhoto(uid);
  if (c) setBg(el, c);
  if (!load()[uid]) fetchOne(uid);      // first time we see this person: one read, then cached
}

/** Resolves with the person's small picture (or "" when they have none). */
export async function fetchPhoto(uid) {
  if (!load()[uid]) await fetchOne(uid);
  return cachedPhoto(uid);
}

/** Manual "refresh photos" button: checks again right away. Resolves with how many photos changed. */
export async function refreshPhotos() {
  checking = null;
  const before = Object.keys(load()).length;
  const snapshot = JSON.stringify(load());
  await checkPhotoChanges();
  return snapshot !== JSON.stringify(load());
}

checkPhotoChanges();
