// =============================================================================
// chat.js - Messages page.
// - Chat list: search, All / Unread filter, last message + unread badge (cached on the device)
// - Messages: last 40 are live, older ones load on demand (pagination)
// - Photos: Camera / Gallery, compressed, thumbnail in the chat, full photo on tap,
//   deleted automatically after the hours set in the admin panel
// - Themes: chat background + message colours (saved on the account and cached)
// - Report: long-press (or the menu) on someone else's message
// =============================================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, setDoc, updateDoc, arrayUnion, deleteField, doc, getDoc, getDocs, increment,
  query, orderBy, limit, startAfter, where, onSnapshot, serverTimestamp, writeBatch, documentId,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cacheUser, ensureUsername, getProfileCached, logout } from "./auth.js";
import { ensureUserId, findByUserId, normalizeId } from "./handle.js";
import { imageToDataUrl } from "./photo.js";
import { uploadImage, thumbUrl, isImgSrc, dataUrlToBlob } from "./cloudinary.js";
import { applyPhoto } from "./avatars.js";

const $ = (id) => document.getElementById(id);
const PAGE = 40;                              // messages loaded at once
const CONTACT_TTL = 6 * 60 * 60 * 1000;       // re-check a contact's name every 6 hours
const SETTINGS_TTL = 60 * 60 * 1000;          // re-read the admin settings every hour

let me = null, unsub = null, unsubInbox = null, contacts = [];
let activeUid = null;
let firstChatSnap = true;
let replyTo = null;
let filterText = "", unreadOnly = false;
let typingUntil = 0, lastTypingVal = 0, lastTypingSent = 0;
let meta = {};                                // uid -> { text, sender, ms, unread, theirSeenMs }
let autoDeleteHours = 24;
const baseTitle = document.title;

// messages of the open chat
let store = new Map();                        // id -> message
let lastMsgs = [];                            // sorted list shown on screen
let cursorDoc = null, hasMore = false, loadingOlder = false, olderLoaded = false;

const storeKey = () => "lumio_contacts_" + me.uid;
const chatIdFor = (other) => [me.uid, other].sort().join("_");
const contactOf = (uid) => contacts.find((c) => c.uid === uid);
const isImg = isImgSrc;   // Cloudinary link, or an old data-URL
function lsGet(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function saveContacts() { lsSet(storeKey(), contacts); }

let metaTimer = 0;
function saveMeta() {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(() => { if (me) lsSet("ix_meta_" + me.uid, meta); }, 400);
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = text; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function paintAvatar(el, name, c) {
  el.textContent = (name || "?").charAt(0).toUpperCase();
  el.style.backgroundImage = "";
  el.classList.remove("has-photo");
  if (c && c.uid) applyPhoto(el, c.uid, c.id, c.photo);   // show their profile photo
}

/* ---------------------------------------------------------------- viewport --- */
function fitViewport() {
  const vv = window.visualViewport;
  if (vv) document.documentElement.style.setProperty("--app-h", vv.height + "px");
  window.scrollTo(0, 0);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitViewport);
  window.visualViewport.addEventListener("scroll", () => window.scrollTo(0, 0));
}
fitViewport();

/* ------------------------------------------------------------------ themes --- */
const CHAT_THEMES = {
  default:  { name: "Default",  bg: "",                                                   text: "", mute: "", swatch: "linear-gradient(135deg,#0f0b24,#1b1240)" },
  midnight: { name: "Midnight", bg: "#070514",                                            text: "", mute: "", swatch: "#070514" },
  ocean:    { name: "Ocean",    bg: "linear-gradient(180deg,#06243a,#0b4a63)",            text: "", mute: "", swatch: "linear-gradient(135deg,#06243a,#0b4a63)" },
  forest:   { name: "Forest",   bg: "linear-gradient(180deg,#0b2a1f,#14452f)",            text: "", mute: "", swatch: "linear-gradient(135deg,#0b2a1f,#14452f)" },
  sunset:   { name: "Sunset",   bg: "linear-gradient(180deg,#3a1030,#5a2a1c)",            text: "", mute: "", swatch: "linear-gradient(135deg,#3a1030,#5a2a1c)" },
  rose:     { name: "Rose",     bg: "linear-gradient(180deg,#3a1022,#5b1d3a)",            text: "", mute: "", swatch: "linear-gradient(135deg,#3a1022,#5b1d3a)" },
  light:    { name: "Light",    bg: "#eceffd",                                            text: "#1c1840", mute: "#5b5688", swatch: "#eceffd" },
};
const MSG_THEMES = {
  default: { name: "Default", me: "#6c4cf0", them: "#241c55" },
  ocean:   { name: "Ocean",   me: "#0ea5e9", them: "#12354a" },
  forest:  { name: "Forest",  me: "#16a34a", them: "#17382a" },
  sunset:  { name: "Sunset",  me: "#f97316", them: "#4a2318" },
  rose:    { name: "Rose",    me: "#ec4899", them: "#4a1830" },
  mono:    { name: "Mono",    me: "#475569", them: "#1e293b" },
};
let theme = { chat: "default", msg: "default" };

function applyTheme() {
  const ct = CHAT_THEMES[theme.chat] || CHAT_THEMES.default;
  const mt = MSG_THEMES[theme.msg] || MSG_THEMES.default;
  const room = $("room");
  room.style.setProperty("--room-bg", ct.bg || "transparent");
  room.style.setProperty("--room-mute", ct.mute || "var(--c-mute)");
  room.style.setProperty("--room-text", ct.text || "var(--c-text)");
  room.style.setProperty("--c-me", mt.me);
  room.style.setProperty("--c-them", mt.them);
}
function loadThemeFromCache(uid) {
  const t = lsGet("ix_theme_" + uid, null);
  if (t && CHAT_THEMES[t.chat] && MSG_THEMES[t.msg]) theme = { chat: t.chat, msg: t.msg };
  applyTheme();
}
function adoptServerTheme(profile) {
  const chat = CHAT_THEMES[profile.chatTheme] ? profile.chatTheme : "default";
  const msg = MSG_THEMES[profile.msgTheme] ? profile.msgTheme : "default";
  if (chat !== theme.chat || msg !== theme.msg) {
    theme = { chat, msg };
    lsSet("ix_theme_" + me.uid, theme);
    applyTheme();
  }
}
function buildThemeSheet() {
  const mk = (boxId, defs, key, swatchOf) => {
    const box = $(boxId);
    box.innerHTML = "";
    Object.entries(defs).forEach(([id, d]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (theme[key] === id ? " on" : "");
      b.setAttribute("aria-label", d.name);
      b.title = d.name;
      b.style.background = swatchOf(d);
      b.innerHTML = "<span>" + d.name + "</span>";
      b.addEventListener("click", () => {
        theme[key] = id;
        lsSet("ix_theme_" + me.uid, theme);
        applyTheme();
        buildThemeSheet();
        themeDirty = true;
      });
      box.appendChild(b);
    });
  };
  mk("chatThemes", CHAT_THEMES, "chat", (d) => d.swatch);
  mk("msgThemes", MSG_THEMES, "msg", (d) => "linear-gradient(135deg," + d.me + " 50%," + d.them + " 50%)");
}
let themeDirty = false;
async function saveThemeToAccount() {
  if (!themeDirty) return;
  themeDirty = false;
  cacheUser({ uid: me.uid, chatTheme: theme.chat, msgTheme: theme.msg });
  try { await updateDoc(doc(db, "users", me.uid), { chatTheme: theme.chat, msgTheme: theme.msg }); }
  catch (e) { console.warn("Could not save theme to the account:", e); }
}
$("themeBtn").addEventListener("click", () => { buildThemeSheet(); $("themeModal").hidden = false; });
function closeThemes() { $("themeModal").hidden = true; saveThemeToAccount(); }
$("themeDone").addEventListener("click", closeThemes);
$("themeModal").addEventListener("click", (e) => { if (e.target.id === "themeModal") closeThemes(); });

/* ---------------------------------------------------------- admin settings --- */
async function loadAutoDeleteHours() {
  const c = lsGet("ix_settings", null);
  if (c && Number.isInteger(c.autoDeleteHours)) autoDeleteHours = c.autoDeleteHours;
  if (c && Date.now() - (c.at || 0) < SETTINGS_TTL) return;
  try {
    const snap = await getDoc(doc(db, "settings", "app"));
    const h = snap.exists() ? snap.data().autoDeleteHours : null;
    autoDeleteHours = Number.isInteger(h) ? h : 24;
    lsSet("ix_settings", { autoDeleteHours, at: Date.now() });
  } catch (e) { console.warn("Settings not available, using 24 hours:", e); }
}
const photoExpired = (m) => !!m.ms && Date.now() > m.ms + autoDeleteHours * 3600000;

/* ----------------------------------------------------------- notifications --- */
let swReg = null;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((r) => { swReg = r; }).catch(() => {});
}
function updateNotifBtn() {
  $("notifBtn").hidden = !("Notification" in window) || Notification.permission !== "default";
}
$("notifBtn").addEventListener("click", async () => {
  try { await Notification.requestPermission(); } catch {}
  updateNotifBtn();
});
updateNotifBtn();

async function notifyMessage(uid, text) {
  const c = contactOf(uid);
  const title = (c && c.name) || "New message";
  try { navigator.vibrate && navigator.vibrate(120); } catch {}
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body: text || "New message", icon: "assets/images/logo.svg", tag: "lumio-" + uid, renotify: true };
  try {
    const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch (e) { console.error(e); }
}

const unreadOf = (uid) => {
  const n = (meta[uid] && meta[uid].unread) || 0;
  return activeUid === uid && !document.hidden ? 0 : n;
};
function updateTitle() {
  const total = contacts.reduce((n, c) => n + unreadOf(c.uid), 0);
  document.title = total ? "(" + total + ") " + baseTitle : baseTitle;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && activeUid) markRead(activeUid); });

async function markRead(uid) {
  if (!meta[uid]) return;
  try {
    await setDoc(doc(db, "chats", chatIdFor(uid)), {
      unread: { [me.uid]: 0 }, seenAt: { [me.uid]: serverTimestamp() },
    }, { merge: true });
  } catch (e) { console.error(e); }
}

/* ------------------------------------------------- instant paint from cache --- */
try {
  const cached = JSON.parse(localStorage.getItem("lumio_user") || "null");
  if (cached && cached.uid) {
    contacts = lsGet("lumio_contacts_" + cached.uid, []);
    meta = lsGet("ix_meta_" + cached.uid, {});
    if (cached.userId) $("myId").textContent = cached.userId;
    me = { uid: cached.uid };                 // temporary, replaced when Firebase answers
    loadThemeFromCache(cached.uid);
    renderContacts();
    me = null;
  }
} catch {}

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html"); return; }
  me = user;
  try { await ensureUsername(user); } catch (e) { console.warn(e); }
  contacts = lsGet(storeKey(), []);
  meta = lsGet("ix_meta_" + user.uid, meta);
  loadThemeFromCache(user.uid);
  renderContacts();
  listenForChats();
  loadAutoDeleteHours();
  if (!window.__ixOpened) {
    const openUid = new URLSearchParams(location.search).get("open");
    if (openUid && contactOf(openUid)) { window.__ixOpened = true; openChat(openUid); }
  }
  try {
    const profile = await getProfileCached(user);          // no Firestore read when cached
    if (profile.blocked === true) { try { sessionStorage.setItem("ix_blocked", "1"); } catch {} logout(); return; }
    const myId = profile.userId || await ensureUserId(user, profile.name);
    $("myId").textContent = myId;
    cacheUser({ uid: user.uid, name: profile.name, email: user.email || "", userId: myId });
    adoptServerTheme(profile);
  } catch (e) {
    console.error(e);
    $("myId").textContent = "Unavailable";
  }
  refreshContactInfo();
});

/* -------------------------------------------------------------- chat list --- */
function listenForChats() {
  if (unsubInbox) unsubInbox();
  const q = query(collection(db, "chats"), where("members", "array-contains", me.uid));
  unsubInbox = onSnapshot(q, async (snap) => {
    let changed = false;
    const incoming = [];
    const toMs = (t) => (t && t.toMillis ? t.toMillis() : 0);
    for (const d of snap.docs) {
      const data = d.data();
      const other = (data.members || []).find((u) => u !== me.uid);
      if (!other) continue;
      const ms = data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : ((meta[other] && meta[other].ms) || 0);
      const prevUnread = meta[other] ? meta[other].unread : 0;
      meta[other] = {
        text: data.lastText || "", sender: data.lastSender || "", ms,
        unread: (data.unread && data.unread[me.uid]) || 0,
        theirSeenMs: toMs(data.seenAt && data.seenAt[other]),
      };
      if (!firstChatSnap && meta[other].unread > prevUnread && data.lastSender === other
          && !(activeUid === other && !document.hidden)) incoming.push([other, data.lastText]);
      if (activeUid === other && !document.hidden && meta[other].unread > 0) markRead(other);

      const tv = (data.typing && data.typing[other]) || 0;
      if (activeUid === other) {
        if (!tv) typingUntil = 0;
        else if (tv !== lastTypingVal) { typingUntil = Date.now() + 4000; setTimeout(renderStatus, 4100); }
        lastTypingVal = tv;
      }

      if (!contactOf(other)) {
        const theirId = data.ids && data.ids[other];
        if (!theirId) continue;
        try {
          const h = await findByUserId(theirId);
          if (h && h.uid === other) {
            contacts.unshift({ uid: other, name: h.name, id: theirId, photo: h.photo || "", at: Date.now() });
            changed = true;
          }
        } catch (e) { console.error(e); }
      }
    }
    if (changed) saveContacts();
    saveMeta();
    renderContacts();
    if (activeUid) { renderMsgs(); renderStatus(); }
    incoming.forEach(([uid, text]) => notifyMessage(uid, text));
    firstChatSnap = false;
  }, (err) => console.error("Chat list listener failed (check Firestore rules):", err));
}

// Names / photos of contacts: only contacts not checked in the last 6 hours (saves reads).
async function refreshContactInfo() {
  let changed = false;
  const stale = contacts.filter((c) => !c.at || Date.now() - c.at > CONTACT_TTL);
  await Promise.all(stale.map(async (c) => {
    try {
      const h = await findByUserId(c.id);
      c.at = Date.now();
      if (h && (h.name !== c.name || (h.photo || "") !== (c.photo || ""))) { c.name = h.name; c.photo = h.photo || ""; }
      changed = true;
    } catch {}
  }));
  if (changed) { saveContacts(); renderContacts(); }
}

function showFindMsg(text, isError) {
  const m = $("findMsg");
  m.textContent = text || "";
  m.hidden = !text;
  m.className = "find-msg" + (isError ? " err" : "");
}

$("findInput").addEventListener("input", () => {
  filterText = $("findInput").value.trim().toLowerCase();
  showFindMsg("");
  renderContacts();
});

document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
  unreadOnly = b.dataset.filter === "unread";
  renderContacts();
}));

$("findForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = $("findInput").value.trim();
  if (!raw) return;
  const id = normalizeId(raw);
  if (!id) {
    const any = contacts.some((c) => (c.name || "").toLowerCase().includes(filterText) || (c.id || "").toLowerCase().includes(filterText));
    return showFindMsg(any ? "Showing matching chats. To add someone new, enter their ID like SMR-12345." : "No chat matches. To add someone new, enter their ID like SMR-12345.", !any);
  }
  if (id === $("myId").textContent) return showFindMsg("That's your own ID.", true);
  showFindMsg("Searching...");
  try {
    const h = await findByUserId(id);
    if (!h) return showFindMsg("No user found with that ID.", true);
    if (!contactOf(h.uid)) { contacts.unshift({ uid: h.uid, name: h.name, id, photo: h.photo || "", at: Date.now() }); saveContacts(); }
    $("findInput").value = ""; filterText = "";
    showFindMsg("");
    renderContacts();
    openChat(h.uid);
  } catch (err) {
    console.error(err);
    showFindMsg("Search failed. Check Firestore rules.", true);
  }
});

// ---- delete a whole chat "for me": a cutoff time per friend, stored in cleared/{myUid}_{friendUid} ----
const clearedMap = {};            // friend uid -> ms; messages older than this are hidden for me
let clearedReady = false;
function ensureCleared() {
  if (clearedReady || !me) return;
  clearedReady = true;
  getDocs(query(collection(db, "cleared"), where(documentId(), ">=", me.uid + "_"), where(documentId(), "<", me.uid + "`")))
    .then((snap) => {
      snap.forEach((d) => {
        const t = d.data().at;
        clearedMap[d.id.slice(me.uid.length + 1)] = t && t.toMillis ? t.toMillis() : Date.now();
      });
      renderContacts();
      if (activeUid) renderMsgs(true);
    })
    .catch((e) => console.warn("Could not load deleted chats:", e));
}
async function deleteChat(c) {
  if (!confirm(`Delete all messages with ${c.name || "this user"} for you? Only your copy is removed. New messages will still show up.`)) return;
  const prev = clearedMap[c.uid];
  clearedMap[c.uid] = Date.now();
  if (activeUid === c.uid) renderMsgs(true);
  renderContacts();
  try {
    await setDoc(doc(db, "cleared", me.uid + "_" + c.uid), { at: serverTimestamp() });
    toast("Chat deleted for you.");
  } catch (e) {
    console.error(e);
    if (prev) clearedMap[c.uid] = prev; else delete clearedMap[c.uid];
    if (activeUid === c.uid) renderMsgs(true);
    renderContacts();
    toast("Could not delete the chat. Check your internet.");
  }
}
function openChatMenu(c, x, y) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "menu";
  const b = document.createElement("button");
  b.type = "button"; b.className = "danger"; b.textContent = "🗑 Delete chat";
  b.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); deleteChat(c); });
  menu.appendChild(b);
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - mw - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + "px";
}
// Long-press (touch or mouse) on a chat row opens "Delete chat". A long press does not open the chat.
function attachRowPress(row, c) {
  let timer = 0, fired = false, sx = 0, sy = 0;
  const start = (x, y) => {
    fired = false; sx = x; sy = y;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; fired = true; try { navigator.vibrate && navigator.vibrate(15); } catch {} openChatMenu(c, sx, sy); }, 450);
  };
  const stop = () => { clearTimeout(timer); timer = 0; };
  row.addEventListener("touchstart", (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  row.addEventListener("touchmove", stop, { passive: true });
  row.addEventListener("touchend", stop);
  row.addEventListener("mousedown", (e) => { if (e.button === 0) start(e.clientX, e.clientY); });
  row.addEventListener("mouseup", stop);
  row.addEventListener("mouseleave", stop);
  row.addEventListener("contextmenu", (e) => { e.preventDefault(); stop(); openChatMenu(c, e.clientX, e.clientY); });
  row.addEventListener("click", (e) => { if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

// Once per visit (then every 6 hours per friend): refresh names, and mark a friend "Unknown user"
// when their profile is gone (account deleted). Their old messages stay visible.
let peersChecked = false;
async function ensurePeers() {
  if (peersChecked || !me || !contacts.length) return;
  peersChecked = true;
  const now = Date.now();
  let changed = false;
  for (const c of contacts) {
    const key = "lumio_peer_" + c.uid;
    if (now - (Number(localStorage.getItem(key)) || 0) < 6 * 3600 * 1000) continue;
    try {
      const s = await getDoc(doc(db, "directory", c.uid));
      if (s.exists()) {
        const x = s.data();
        if (x.name && x.name !== c.name) { c.name = x.name; changed = true; }
        if (x.userId && x.userId !== c.id) { c.id = x.userId; changed = true; }
      } else if (c.id && c.name !== "Unknown user") {
        c.name = "Unknown user"; c.id = ""; changed = true;
      }
      localStorage.setItem(key, String(now));
    } catch (e) { /* offline: try again next visit */ }
  }
  if (changed) {
    try { localStorage.setItem("lumio_contacts_" + me.uid, JSON.stringify(contacts)); } catch {}
    renderContacts();
  }
}

function renderContacts() {
  ensureCleared();
  ensurePeers();
  const box = $("users");
  box.innerHTML = "";
  const totalUnread = contacts.reduce((n, c) => n + ((meta[c.uid] && meta[c.uid].unread) || 0), 0);
  document.querySelectorAll("[data-filter]").forEach((b) => {
    const on = (b.dataset.filter === "unread") === unreadOnly;
    b.setAttribute("aria-pressed", String(on));
    if (b.dataset.filter === "unread") b.textContent = totalUnread ? "Unread (" + (totalUnread > 99 ? "99+" : totalUnread) + ")" : "Unread";
  });
  if (!contacts.length) {
    box.innerHTML = '<p class="empty">Enter a friend\'s ID (SMR-12345) and press Find to start chatting.</p>';
    updateTitle();
    return;
  }
  let list = contacts.filter((c) => !filterText || (c.name || "").toLowerCase().includes(filterText) || (c.id || "").toLowerCase().includes(filterText));
  // Hide a chat whose messages were deleted, until a newer message arrives.
  list = list.filter((c) => { const cut = clearedMap[c.uid] || 0; const ms = (meta[c.uid] && meta[c.uid].ms) || 0; return !cut || !ms || ms > cut; });
  if (unreadOnly) list = list.filter((c) => ((meta[c.uid] && meta[c.uid].unread) || 0) > 0);
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = unreadOnly && !filterText ? "No unread messages." : "No chats match your search.";
    box.appendChild(p);
    updateTitle();
    return;
  }
  list.sort((a, b) => (((meta[b.uid] && meta[b.uid].ms) || 0) - ((meta[a.uid] && meta[a.uid].ms) || 0)) || (a.name || "").localeCompare(b.name || "") || (a.uid < b.uid ? -1 : 1));
  list.forEach((c) => { const row = contactRow(c, () => openChat(c.uid), true); attachRowPress(row, c); box.appendChild(row); });
  updateTitle();
}

function contactRow(c, onClick, showBadge) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "user" + (showBadge && c.uid === activeUid ? " active" : "");
  b.dataset.uid = c.uid;
  const av = document.createElement("div");
  av.className = "avatar";
  paintAvatar(av, c.name, c);
  const info = document.createElement("div");
  info.className = "meta";
  const nm = document.createElement("strong");
  nm.textContent = c.name || "User";
  const sub = document.createElement("small");
  sub.textContent = showBadge ? ((meta[c.uid] && meta[c.uid].text) || c.id) : c.id;
  info.append(nm, sub);
  b.append(av, info);
  const n = showBadge ? unreadOf(c.uid) : 0;
  if (n > 0) { const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = n > 99 ? "99+" : String(n); b.appendChild(badge); }
  b.addEventListener("click", onClick);
  return b;
}

function renderStatus() {
  const s = $("peerStatus");
  if (!activeUid) { s.hidden = true; return; }
  s.hidden = false;
  s.className = "";
  if (Date.now() < typingUntil) { s.textContent = "typing..."; s.className = "on"; }
  else { s.textContent = ""; s.hidden = true; }
}
setInterval(renderStatus, 20000);

/* ------------------------------------------------------------- open a chat --- */
function mapDoc(d, hiddenSet) {
  const m = d.data({ serverTimestamps: "estimate" });
  return {
    id: d.id, text: m.text || "", senderId: m.senderId, replyTo: m.replyTo || null,
    forwarded: !!m.forwarded, deleted: !!m.deleted,
    hidden: (m.hiddenFor || []).includes(me.uid) || hiddenSet.has(d.id),
    ms: m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : 0,
    pending: d.metadata.hasPendingWrites,
    photoId: m.photoId || "", photoUrl: isImg(m.photoUrl) ? m.photoUrl : "", thumb: isImg(m.thumb) ? m.thumb : "", imageBytes: m.imageBytes || 0,
    hasImage: m.hasImage === true, imageExpired: m.imageExpired === true,
  };
}
function mergeStore() {
  lastMsgs = [...store.values()].sort((a, b) => (a.ms - b.ms) || (a.id < b.id ? -1 : 1));
}

function openChat(otherUid) {
  const c = contactOf(otherUid);
  if (!c) return;
  activeUid = otherUid;
  store = new Map(); lastMsgs = []; cursorDoc = null; hasMore = false; olderLoaded = false;
  typingUntil = 0; lastTypingVal = 0;
  clearReply();
  renderContacts();
  markRead(otherUid);
  $("peerName").textContent = c.name || "User";
  $("peerAvatar").hidden = false;
  paintAvatar($("peerAvatar"), c.name, c);
  renderStatus();
  $("composer").hidden = false;
  $("themeBtn").hidden = false;
  $("wrap").classList.add("in-chat");
  if (!(history.state && history.state.chat)) history.pushState({ chat: 1 }, "");
  document.body.classList.add("chat-open");
  $("msgs").innerHTML = '<p class="empty">Loading...</p>';

  if (unsub) unsub();
  // Only the newest PAGE messages are live. Older ones are fetched when asked for.
  const q = query(collection(db, "chats", chatIdFor(otherUid), "messages"), orderBy("createdAt", "desc"), limit(PAGE));
  unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    if (activeUid !== otherUid) return;
    // Until the user loads older messages, the "older" button starts below the live window.
    if (!olderLoaded) {
      cursorDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
      hasMore = snap.docs.length >= PAGE;
    }
    const hiddenSet = localHidden();
    snap.docs.forEach((d) => store.set(d.id, mapDoc(d, hiddenSet)));
    mergeStore();
    renderMsgs(snap.metadata.hasPendingWrites);
    purgeExpired();
  }, (err) => {
    console.error(err);
    $("msgs").innerHTML = '<p class="empty">Cannot read messages. Check Firestore rules.</p>';
  });
}

async function loadOlder() {
  if (loadingOlder || !hasMore || !cursorDoc || !activeUid) return;
  loadingOlder = true;
  const btn = $("olderBtn");
  if (btn) btn.textContent = "Loading...";
  const target = activeUid;
  try {
    const snap = await getDocs(query(collection(db, "chats", chatIdFor(target), "messages"), orderBy("createdAt", "desc"), startAfter(cursorDoc), limit(PAGE)));
    if (activeUid !== target) return;
    const hiddenSet = localHidden();
    snap.docs.forEach((d) => store.set(d.id, mapDoc(d, hiddenSet)));
    olderLoaded = true;
    if (snap.docs.length) cursorDoc = snap.docs[snap.docs.length - 1];
    hasMore = snap.docs.length >= PAGE;
    mergeStore();
    const list = $("msgs");
    const before = list.scrollHeight - list.scrollTop;
    renderMsgs(false, true);
    list.scrollTop = list.scrollHeight - before;     // keep the same message in view
    purgeExpired();
  } catch (e) {
    console.error(e);
    toast("Could not load older messages.");
  } finally { loadingOlder = false; }
}

const previewOf = (m) => m.deleted ? "Deleted message" : (m.hasImage || m.photoId || m.imageExpired ? "Photo" : (m.text || ""));

function renderMsgs(forceScroll, keepScroll) {
  const list = $("msgs");
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const theirSeen = (activeUid && meta[activeUid] && meta[activeUid].theirSeenMs) || 0;
  const peerName = (contactOf(activeUid) || {}).name || "User";
  list.innerHTML = "";
  const cut = (activeUid && clearedMap[activeUid]) || 0;
  const shown = lastMsgs.filter((m) => !m.hidden && (m.pending || !cut || m.ms > cut));
  if (!shown.length && !hasMore) list.innerHTML = '<p class="empty">No messages yet. Say hi!</p>';
  if (hasMore) {
    const more = document.createElement("button");
    more.type = "button"; more.id = "olderBtn"; more.className = "older"; more.textContent = "Load older messages";
    more.addEventListener("click", loadOlder);
    list.appendChild(more);
  }
  shown.forEach((m) => {
    const mine = m.senderId === me.uid;
    const el = document.createElement("div");
    el.className = "msg" + (mine ? " me" : "") + (m.deleted ? " gone" : "");
    el.dataset.id = m.id;

    if (m.deleted) {
      el.appendChild(document.createTextNode("🚫 This message was deleted"));
    } else {
      if (m.forwarded) { const f = document.createElement("div"); f.className = "fwd"; f.textContent = "↪ Forwarded"; el.appendChild(f); }
      if (m.replyTo) {
        const q = document.createElement("div"); q.className = "quote";
        const who = document.createElement("b"); who.textContent = m.replyTo.senderId === me.uid ? "You" : peerName;
        const tx = document.createElement("span"); tx.textContent = m.replyTo.text || "Message";
        q.append(who, tx);
        q.addEventListener("click", () => {
          const target = list.querySelector('[data-id="' + m.replyTo.id + '"]');
          if (target) { target.scrollIntoView({ block: "center", behavior: "smooth" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1300); }
          else toast("Original message not found");
        });
        el.appendChild(q);
      }
      if (m.photoId || m.hasImage || m.imageExpired) {
        const expired = m.imageExpired || (m.photoId && photoExpired(m));
        if (expired || !m.thumb) {
          const ph = document.createElement("div");
          ph.className = "pic-gone";
          ph.textContent = expired ? "📷 Photo expired" : "📷 Photo";
          el.appendChild(ph);
        } else {
          const img = document.createElement("img");
          img.className = "pic"; img.src = m.thumb; img.alt = "Photo"; img.loading = "lazy"; img.decoding = "async";
          img.addEventListener("click", () => openLightbox(m));
          img.addEventListener("error", () => { if (m.photoUrl && img.src !== m.photoUrl) img.src = m.photoUrl; }, { once: true });
          el.appendChild(img);
        }
      }
      if (m.text) el.appendChild(document.createTextNode(m.text));
      if (!m.pending) {
        const more = document.createElement("button");
        more.type = "button"; more.className = "more"; more.setAttribute("aria-label", "Message options"); more.textContent = "⋯";
        more.addEventListener("click", (ev) => { ev.stopPropagation(); const r = more.getBoundingClientRect(); openMenu(r.right, r.bottom, r.top, m, mine); });
        el.appendChild(more);
        attachLongPress(el, m, mine);
      }
    }
    const t = document.createElement("time");
    t.textContent = m.ms ? new Date(m.ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    if (mine && !m.deleted) {
      const tick = document.createElement("span");
      if (m.pending) tick.textContent = " 🕓";
      else if (m.ms && theirSeen >= m.ms) { tick.textContent = " ✓✓ Seen"; tick.className = "seen"; }
      else tick.textContent = " ✓ Sent";
      t.appendChild(tick);
    }
    el.appendChild(t);
    list.appendChild(el);
  });
  if (keepScroll) return;
  if (nearBottom || forceScroll) list.scrollTop = list.scrollHeight;
}

/* ----------------------------------------------------------- message menu --- */
function closeMenu() { document.querySelectorAll(".menu").forEach((m) => m.remove()); }
document.addEventListener("click", closeMenu);
window.addEventListener("resize", closeMenu);

// Long-press (touch) or right-click opens the same menu as the "⋯" button.
function attachLongPress(el, m, mine) {
  let timer = 0, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    cancel();
    timer = setTimeout(() => { timer = 0; try { navigator.vibrate && navigator.vibrate(15); } catch {} openMenu(sx, sy + 8, sy - 8, m, mine); }, 450);
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
  }, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchcancel", cancel);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY + 4, e.clientY - 4, m, mine); });
}

function openMenu(right, bottom, top, m, mine) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "menu";
  const add = (label, fn, danger) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    if (danger) b.className = "danger";
    b.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); fn(); });
    menu.appendChild(b);
  };
  add("↩ Reply", () => startReply(m));
  if (m.text) add("↪ Forward", () => openForward(m));
  if (!mine) add("⚑ Report", () => openReport(m), true);
  add("🗑 Delete for me", () => deleteForMe(m), true);
  if (mine) add("🗑 Delete for everyone", () => deleteMessage(m), true);
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const left = Math.min(Math.max(8, right - mw), window.innerWidth - mw - 8);
  let y = bottom + 4;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, top - mh - 4);
  menu.style.left = left + "px"; menu.style.top = y + "px";
}

/* ------------------------------------------------------------------- reply --- */
function startReply(m) {
  replyTo = { id: m.id, senderId: m.senderId, text: previewOf(m).slice(0, 100) };
  $("replyWho").textContent = m.senderId === me.uid ? "You" : ((contactOf(activeUid) || {}).name || "User");
  $("replyTxt").textContent = previewOf(m);
  $("replyBar").hidden = false;
  $("text").focus();
}
function clearReply() { replyTo = null; $("replyBar").hidden = true; }
$("replyCancel").addEventListener("click", clearReply);

/* ----------------------------------------------------------------- deleting --- */
const hkey = () => "lumio_hidden_" + me.uid;
function localHidden() { try { return new Set(JSON.parse(localStorage.getItem(hkey()) || "[]")); } catch (e) { return new Set(); } }
async function deleteForMe(m) {
  if (!confirm("Delete this message for you only?")) return;
  const h = localHidden(); h.add(m.id);
  try { localStorage.setItem(hkey(), JSON.stringify([...h])); } catch (e) {}
  try { await updateDoc(doc(db, "chats", chatIdFor(activeUid), "messages", m.id), { hiddenFor: arrayUnion(me.uid) }); } catch (e) { console.error(e); }
  m.hidden = true; renderMsgs();
}

async function deleteMessage(m) {
  if (!confirm("Delete this message for everyone?")) return;
  const cid = chatIdFor(activeUid);
  const mref = doc(db, "chats", cid, "messages", m.id);
  try {
    if (m.photoId && m.hasImage) {
      // The photo goes too, and the admin's photo counter goes down by one.
      const b = writeBatch(db);
      b.update(mref, { deleted: true, text: "", thumb: deleteField(), photoId: deleteField(), photoUrl: deleteField(), hasImage: false, imageBytes: deleteField() });
      if (!m.photoUrl) b.delete(doc(db, "chats", cid, "photos", m.photoId));   // old photos only
      b.set(doc(db, "stats", "photos"), { count: increment(-1), bytes: increment(-(m.imageBytes || 0)) }, { merge: true });
      await b.commit();
    } else {
      await updateDoc(mref, { deleted: true, text: "" });
    }
  } catch (e) { console.error(e); toast("Could not delete. Check Firestore rules."); }
}

// Photos older than the admin's "auto delete" hours are removed (by whoever opens the chat first).
const purging = new Set();
async function purgeExpired() {
  if (!activeUid) return;
  const cid = chatIdFor(activeUid);
  const todo = lastMsgs.filter((m) => m.hasImage && m.photoId && !m.pending && !m.deleted && photoExpired(m) && !purging.has(m.id)).slice(0, 5);
  for (const m of todo) {
    purging.add(m.id);
    try {
      const b = writeBatch(db);
      b.update(doc(db, "chats", cid, "messages", m.id), { thumb: deleteField(), photoId: deleteField(), photoUrl: deleteField(), hasImage: false, imageExpired: true });
      if (!m.photoUrl) b.delete(doc(db, "chats", cid, "photos", m.photoId));   // old photos only
      b.set(doc(db, "stats", "photos"), { count: increment(-1), bytes: increment(-(m.imageBytes || 0)) }, { merge: true });
      await b.commit();
    } catch (e) {
      // The other person may have cleaned it already - that is fine.
      console.warn("Photo cleanup skipped:", e.code || e);
    }
  }
}

/* ----------------------------------------------------------------- forward --- */
let forwarding = null;
function openForward(m) {
  forwarding = m;
  const box = $("fwdList");
  box.innerHTML = "";
  contacts.forEach((c) => box.appendChild(contactRow(c, async () => {
    $("fwdModal").hidden = true;
    const msg = forwarding; forwarding = null;
    try {
      await sendTo(c.uid, { text: msg.text, forwarded: true });
      toast("Forwarded to " + (c.name || "user"));
    } catch (e) { console.error(e); toast("Could not forward."); }
  }, false)));
  if (!contacts.length) box.innerHTML = '<p class="empty">No chats to forward to.</p>';
  $("fwdModal").hidden = false;
}
$("fwdCancel").addEventListener("click", () => { $("fwdModal").hidden = true; });
$("fwdModal").addEventListener("click", (e) => { if (e.target.id === "fwdModal") $("fwdModal").hidden = true; });

/* ------------------------------------------------------------------ report --- */
let reporting = null;
function openReport(m) { reporting = m; $("reportModal").hidden = false; }
function closeReport() { $("reportModal").hidden = true; reporting = null; }
$("reportCancel").addEventListener("click", closeReport);
$("reportModal").addEventListener("click", (e) => { if (e.target.id === "reportModal") closeReport(); });
document.querySelectorAll("[data-reason]").forEach((b) => b.addEventListener("click", async () => {
  const m = reporting;
  if (!m || !activeUid) return;
  const reason = b.dataset.reason;
  closeReport();
  const cid = chatIdFor(activeUid);
  try {
    await setDoc(doc(db, "reports", m.id + "_" + me.uid), {
      reporterId: me.uid, reportedId: m.senderId, chatId: cid, msgId: m.id,
      photoId: m.photoId || "", photoUrl: m.photoUrl || "", text: (m.text || "").slice(0, 1000), thumb: m.thumb || "",
      reason, status: "open", createdAt: serverTimestamp(),
    });
    toast("Thanks. The message was reported to the admin.");
  } catch (e) {
    console.error(e);
    toast(e.code === "permission-denied" ? "You already reported this message." : "Could not send the report.");
  }
}));

/* ----------------------------------------------------------------- sending --- */
async function writeHeader(otherUid, preview) {
  await setDoc(doc(db, "chats", chatIdFor(otherUid)), {
    members: [me.uid, otherUid].sort(),
    ids: { [me.uid]: $("myId").textContent },
    lastText: preview.slice(0, 80),
    lastSender: me.uid,
    unread: { [otherUid]: increment(1), [me.uid]: 0 },
    seenAt: { [me.uid]: serverTimestamp() },
    typing: { [me.uid]: 0 },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function sendTo(otherUid, p) {
  const cid = chatIdFor(otherUid);
  await writeHeader(otherUid, p.text);
  const data = { text: p.text || "", senderId: me.uid, createdAt: serverTimestamp() };
  if (p.replyTo) data.replyTo = p.replyTo;
  if (p.forwarded) data.forwarded = true;
  await addDoc(collection(db, "chats", cid, "messages"), data);
}

const fullCache = new Map();                 // photoId -> full data URL (OLD photos, this visit only)
// The picture itself goes to Cloudinary; Firestore only keeps its link (photoUrl) and a small link (thumb).
async function sendPhoto(otherUid, photo, rp) {
  const cid = chatIdFor(otherUid);
  if (photo.blob.size > MAX_PHOTO_BYTES) throw new Error("Photos can be 1 MB at most.");
  const up = await uploadImage(photo.blob, "chat");
  await writeHeader(otherUid, "📷 Photo");
  const msgRef = doc(collection(db, "chats", cid, "messages"));
  const msg = {
    text: "", senderId: me.uid, createdAt: serverTimestamp(),
    photoId: msgRef.id, photoUrl: up.url, thumb: thumbUrl(up.url), hasImage: true, imageBytes: photo.blob.size,
  };
  if (rp) msg.replyTo = rp;
  const b = writeBatch(db);
  b.set(msgRef, msg);
  b.set(doc(db, "stats", "photos"), { count: increment(1), bytes: increment(msg.imageBytes) }, { merge: true });
  await b.commit();
}

$("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("text");
  const text = input.value.trim();
  if (!text || !activeUid) return;
  const target = activeUid, rp = replyTo;
  input.value = ""; clearReply(); input.focus();
  try { await sendTo(target, { text, replyTo: rp }); }
  catch (err) { console.error(err); input.value = text; toast("Message not sent. You may be blocked or offline."); }
});

$("text").addEventListener("input", () => {
  if (!activeUid || !meta[activeUid] || Date.now() - lastTypingSent < 2500) return;
  lastTypingSent = Date.now();
  setDoc(doc(db, "chats", chatIdFor(activeUid)), { typing: { [me.uid]: Date.now() } }, { merge: true }).catch(() => {});
});

/* ------------------------------------------------------------------ photos --- */
let pending = null;                          // { full (preview), blob (uploaded), bytes, target }
const MAX_PHOTO_BYTES = 1000 * 1000;         // one photo is 1 MB at most
const looksLikeImage = (f) => String(f.type).startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(f.name || "");
$("camBtn").addEventListener("click", () => { $("photoSheet").hidden = false; });
$("photoCancel").addEventListener("click", () => { $("photoSheet").hidden = true; });
$("photoSheet").addEventListener("click", (e) => { if (e.target.id === "photoSheet") $("photoSheet").hidden = true; });
$("pickCamera").addEventListener("click", () => { $("photoSheet").hidden = true; $("fileCamera").click(); });
$("pickGallery").addEventListener("click", () => { $("photoSheet").hidden = true; $("fileGallery").click(); });
["fileCamera", "fileGallery"].forEach((id) => $(id).addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (file) preparePhoto(file);
}));

async function preparePhoto(file) {
  if (!activeUid) return;
  const target = activeUid;
  $("previewModal").hidden = false;
  $("previewBusy").hidden = false;
  $("previewImg").hidden = true;
  $("previewSend").disabled = true;
  try {
    // Any picture type (jpg, png screenshots, webp, gif, heic...). A photo up to 1 MB is sent exactly
    // as it is (no re-drawing, so screenshots can't turn white). A bigger one is shrunk to under 1 MB.
    if (!looksLikeImage(file)) throw new Error("Please choose a photo.");
    let blob = file, preview = "";
    if (file.size <= MAX_PHOTO_BYTES) {
      preview = URL.createObjectURL(file);
    } else {
      blob = null;
      for (const max of [1600, 1280, 1000, 800, 600]) {
        const out = await imageToDataUrl(file, { max, quality: 0.8, maxChars: 1300000 });
        const b = await dataUrlToBlob(out);
        if (b.size <= MAX_PHOTO_BYTES) { blob = b; preview = out; break; }
      }
      if (!blob) throw new Error("This photo is too big. Photos can be 1 MB at most.");
    }
    pending = { full: preview, blob, bytes: blob.size, target };
    const pv = $("previewImg");
    pv.onerror = () => { pv.hidden = true; toast("No preview for this picture, but it can still be sent."); };
    pv.src = preview;
    pv.hidden = false;
    $("previewSend").disabled = false;
  } catch (err) {
    console.error(err);
    closePreview();
    toast(err && err.message ? err.message : "Could not read that photo.");
  } finally { $("previewBusy").hidden = true; }
}
function closePreview() { if (pending && String(pending.full).startsWith("blob:")) URL.revokeObjectURL(pending.full); pending = null; $("previewModal").hidden = true; $("previewImg").removeAttribute("src"); }
$("previewRemove").addEventListener("click", closePreview);
$("previewSend").addEventListener("click", async () => {
  const p = pending;
  if (!p) return;
  const rp = replyTo;
  closePreview(); clearReply();
  toast("Sending photo...");
  try { await sendPhoto(p.target, p, rp); }
  catch (err) { console.error(err); toast(/Cloudinary|1 MB|upload/i.test(String(err && err.message)) ? err.message : "Photo not sent. Check your internet, or you may be blocked."); }
});

// Full photo: thumbnail first, the full picture is fetched once (1 read) when tapped.
async function openLightbox(m) {
  const lb = $("lightbox"), img = $("lightImg"), note = $("lightNote");
  img.src = m.thumb; note.textContent = ""; note.hidden = true;
  lb.hidden = false;
  if (m.photoUrl) { img.src = m.photoUrl; return; }   // full picture straight from Cloudinary (no Firestore read)
  if (!m.photoId) return;
  let full = fullCache.get(m.photoId);
  if (!full) {
    note.textContent = "Loading full photo..."; note.hidden = false;
    try {
      const snap = await getDoc(doc(db, "chats", chatIdFor(activeUid), "photos", m.photoId));
      if (snap.exists() && isImg(snap.data().data)) {
        full = snap.data().data;
        fullCache.set(m.photoId, full);
        if (fullCache.size > 12) fullCache.delete(fullCache.keys().next().value);
      } else {
        note.textContent = "This photo is no longer available.";
        purgeExpired();
        return;
      }
    } catch (e) {
      console.error(e);
      note.textContent = "Could not load the full photo.";
      return;
    }
  }
  if (!lb.hidden) { img.src = full; note.hidden = true; }
}
function closeLightbox() { $("lightbox").hidden = true; $("lightImg").removeAttribute("src"); }
$("lightbox").addEventListener("click", closeLightbox);

/* ------------------------------------------------------------------ closing --- */
function closeChat() {
  activeUid = null;
  if (unsub) { unsub(); unsub = null; }
  store = new Map(); lastMsgs = [];
  clearReply();
  closePreview();
  $("wrap").classList.remove("in-chat");
  document.body.classList.remove("chat-open");
  $("peerAvatar").hidden = true; $("peerStatus").hidden = true; $("themeBtn").hidden = true;
  $("composer").hidden = true;
  $("peerName").textContent = "Pick someone to chat with";
  $("msgs").innerHTML = '<p class="empty">Choose a person from the list to start chatting.</p>';
  renderContacts();
}
$("back").addEventListener("click", () => { if (history.state && history.state.chat) history.back(); else closeChat(); });
window.addEventListener("popstate", () => { if (activeUid) closeChat(); });
