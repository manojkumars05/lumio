import { serverTimestamp as srvTs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// =============================================================================
// home.js - home page: greeting + birthday banner (no Firebase reads beyond the
// profile that every page already loads once).
// =============================================================================

import { getProfileCached, renderUserChip, requireAuth } from "./auth.js";

/** True when today (device date) is the user's birthday. dob is "YYYY-MM-DD". */
function isBirthdayToday(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || "");
  if (!m) return false;
  const now = new Date();
  const month = Number(m[2]);
  let day = Number(m[3]);
  // Born on 29 Feb: celebrate on 28 Feb in years that have no 29 Feb.
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (month === 2 && day === 29 && !leap(now.getFullYear())) day = 28;
  return now.getMonth() + 1 === month && now.getDate() === day;
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Hello";
}

document.getElementById("greetWord").textContent = greetingWord();

// Show the banner instantly from the cached copy (saved on the last visit)...
try {
  const c = JSON.parse(localStorage.getItem("lumio_user") || "null");
  if (c && isBirthdayToday(c.dob)) document.getElementById("birthday").hidden = false;
} catch {}

// ...then confirm with the real profile.
const user = await requireAuth();
const profile = await getProfileCached(user);   // no Firestore read if loaded in the last 10 minutes
renderUserChip(user, profile);
document.getElementById("birthday").hidden = !isBirthdayToday(profile.dob);

// =============================================================================
// Bell (notifications), "Your friends", "People you may know".
// Reads kept low: friends + unread messages come from data already on this device;
// follower notices are fetched at most every 2 minutes; suggestions at most every 6 hours.
// =============================================================================
import { db } from "./firebase-config.js";
import {
  collection, query, orderBy, limit, getDocs, doc, setDoc, writeBatch, documentId, startAt,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { follow, getFollowing, cachedFollowing } from "./follow.js";
import { applyPhoto } from "./avatars.js";

const uid = user.uid;
const $ = (id) => document.getElementById(id);
const lsGet = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const initialsOf = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

function avatar(name, photo, p) {
  const a = document.createElement("span");
  a.className = "avatar";
  a.setAttribute("aria-hidden", "true");
  if (typeof photo === "string" && /^(data:image\/|https:\/\/res\.cloudinary\.com\/)/.test(photo)) {
    a.classList.add("has-photo");
    a.style.backgroundImage = "url(" + photo + ")";
  } else a.textContent = initialsOf(name);
  if (p && p.uid) applyPhoto(a, p.uid, p.id, photo);   // everyone's profile photo, not only yours
  return a;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const contacts = () => lsGet("lumio_contacts_" + uid, []);

/* -------------------------------------------------------- your friends --- */
function renderFriends() {
  // People you chat with + people you follow (no duplicates).
  const seen = new Set(), list = [];
  [...contacts(), ...cachedFollowing(uid)].forEach((c) => { if (c.uid && !seen.has(c.uid)) { seen.add(c.uid); list.push(c); } });
  list.splice(15);
  const row = $("friendsRow");
  row.replaceChildren();
  $("friendsEmpty").hidden = list.length > 0;
  list.forEach((c) => {
    const a = el("a", "ix-friend");
    a.href = "chat.html?open=" + encodeURIComponent(c.uid);
    a.append(avatar(c.name, c.photo, c), el("span", "nm", String(c.name || "User").split(/\s+/)[0]));
    row.append(a);
  });
}

// Publish my own card so other people can see me in their suggestions (only when it changed).
async function syncDirectory() {
  if (!profile.userId || !profile.name) return;
  const photo = /^https:\/\/res\.cloudinary\.com\//.test(profile.photo || "") ? profile.photo : "";
  const sig = [profile.name, profile.userId, profile.username || "", photo].join("|");
  const prev = lsGet("ix_dir_" + uid, "");
  if (prev === sig) return;
  const prevPhoto = String(prev).split("|")[3] || "";
  const data = { name: profile.name, userId: profile.userId, username: profile.username || "", photo };
  if (photo !== prevPhoto) data.photoAt = srvTs();      // the photo changed: friends' screens will pick it up
  try {
    await setDoc(doc(db, "directory", uid), data, { merge: true });
    lsSet("ix_dir_" + uid, sig);
  } catch (e) { console.warn("Could not update the directory:", e); }
}

/* ------------------------------------------------------------- the bell --- */
const NOTIF_KEY = "ix_notifs_" + uid;
let notifs = lsGet(NOTIF_KEY, { at: 0, items: [] });   // follower notices: { id, name, ms, read }
let highlight = new Set();                              // notices that were unread when the panel opened

function nameOf(uid2, fallbackId) {
  const c = contacts().find((x) => x.uid === uid2);
  return (c && c.name) || fallbackId || "Someone";
}
function entries() {
  const msgs = lsGet("ix_inbox_" + uid, []).map((m) => ({
    kind: "message", ms: m.ms || 0, uid: m.uid, name: nameOf(m.uid, m.id), unread: m.unread, text: m.text,
  }));
  const follows = (notifs.items || []).map((n) => ({ kind: "follow", ms: n.ms || 0, id: n.id, name: n.name, read: n.read }));
  return [...msgs, ...follows].sort((a, b) => b.ms - a.ms).slice(0, 25);
}
function unreadCount() {
  const m = lsGet("ix_inbox_" + uid, []).reduce((n, x) => n + (x.unread || 0), 0);
  const f = (notifs.items || []).filter((n) => !n.read).length;
  return m + f;
}
function paintBadge() {
  const n = unreadCount();
  const b = $("bellBadge");
  b.textContent = n > 99 ? "99+" : String(n);
  b.hidden = n === 0;
}
function paintList() {
  const box = $("bellList");
  box.replaceChildren();
  const list = entries();
  if (!list.length) { box.append(el("div", "bell-empty", "No notifications yet.")); return; }
  list.forEach((e) => {
    let row;
    if (e.kind === "message") {
      row = el("a", "bell-item new");
      row.href = "chat.html?open=" + encodeURIComponent(e.uid);
      const t = el("div", "bell-text");
      t.append(el("strong", "", "New message from " + e.name),
               el("small", "", (e.unread > 1 ? e.unread + " new messages \u00b7 " : "") + (e.text || "Open chat")));
      row.append(avatar(e.name, "", contacts().find((x) => x.uid === e.uid) || { uid: e.uid }), t);
    } else {
      row = el("div", "bell-item" + (highlight.has(e.id) || !e.read ? " new" : ""));
      const t = el("div", "bell-text");
      t.append(el("strong", "", e.name + " started following you"), el("small", "", "New follower"));
      row.append(avatar(e.name, "", { uid: e.id }), t);
    }
    box.append(row);
  });
}

async function loadFollowNotices(force) {
  if (!force && Date.now() - (notifs.at || 0) < 2 * 60 * 1000) return;      // fresh: 0 reads
  try {
    const snap = await getDocs(query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(20)));
    const items = [];
    snap.forEach((d) => {
      const x = d.data();
      items.push({ id: d.id, name: x.fromName || "Someone", read: x.read === true,
                   ms: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now() });
    });
    notifs = { at: Date.now(), items };
    lsSet(NOTIF_KEY, notifs);
    paintBadge();
    if (!$("bellPanel").hidden) paintList();
  } catch (e) { console.warn("Notifications unavailable:", e); }
}

async function markFollowRead() {
  const unread = (notifs.items || []).filter((n) => !n.read);
  if (!unread.length) return;
  highlight = new Set(unread.map((n) => n.id));
  unread.forEach((n) => { n.read = true; });
  lsSet(NOTIF_KEY, notifs);
  try {
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "users", uid, "notifications", n.id), { read: true }));
    await batch.commit();
  } catch (e) { console.warn("Could not mark notifications as read:", e); }
}

function closeBell() {
  $("bellPanel").hidden = true;
  $("bellBtn").setAttribute("aria-expanded", "false");
  highlight = new Set();
  paintBadge();
}
$("bellBtn").addEventListener("click", (ev) => {
  ev.stopPropagation();
  const open = $("bellPanel").hidden;
  if (!open) return closeBell();
  paintList();
  $("bellPanel").hidden = false;
  $("bellBtn").setAttribute("aria-expanded", "true");
  markFollowRead().then(paintBadge);
});
document.addEventListener("click", (e) => { if (!$("bellPanel").hidden && !e.target.closest(".bell-wrap")) closeBell(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("bellPanel").hidden) closeBell(); });
window.addEventListener("ix:inbox", () => { paintBadge(); if (!$("bellPanel").hidden) paintList(); });

/* ----------------------------------------------------------------- start --- */
renderFriends();
getFollowing(uid, false, 30 * 60 * 1000).then(renderFriends);   // refreshed at most every 30 min
paintBadge();
loadFollowNotices(false);
window.addEventListener("ix:followers", () => loadFollowNotices(true));   // new follower: refresh the bell once
syncDirectory();
