// =============================================================================
// admin.js - admin panel (only for users that have a document in admins/{uid}).
// Tabs: Password requests, Users (block / unblock), Reports (view, delete message,
// block user), Storage (photo count / size + auto delete hours), Settings (reset hours).
// Data is loaded only when a tab is opened, and the user list is cached for 5 minutes,
// to keep Firebase reads low. Every tab has a Refresh button.
// =============================================================================

import { db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  collection, deleteField, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp,
  setDoc, updateDoc, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHTML, formatDate, setFieldError, setLoading, timeAgo } from "./utils.js";

const $ = (id) => document.getElementById(id);
const user = await requireAuth();

// The admin flag is remembered on this device after the first check (sidebar.js), so opening
// the panel costs no extra read. Firestore rules still block every admin action for non-admins.
let isAdmin = false;
try {
  const c = JSON.parse(localStorage.getItem("lumio_user") || "null");
  if (c && c.uid === user.uid && c.isAdmin === true) isAdmin = true;
} catch {}
if (!isAdmin) {
  try { isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); } catch {}
}
if (!isAdmin) {
  $("denied").hidden = false;
  throw new Error("not admin"); // stop here; nothing below runs for normal users
}
$("panel").hidden = false;

/* -------------------------------------------------------------- tabs --- */
const loaded = {};
const loaders = {
  requests: () => loadRequests(),
  users: (force) => loadUsers(force),
  reports: () => loadReports(),
  storage: () => loadStorage(),
  settings: () => loadSettings(),
};
document.querySelectorAll(".ix-tab[data-tab]").forEach((tab) =>
  tab.addEventListener("click", () => openTab(tab.dataset.tab))
);
document.querySelectorAll("[data-refresh]").forEach((b) =>
  b.addEventListener("click", () => loaders[b.dataset.refresh](true))
);
function openTab(name) {
  document.querySelectorAll(".ix-tab[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== name));
  if (!loaded[name]) { loaded[name] = true; loaders[name](); }
}
openTab("requests");

/* ---------------------------------------------------------- requests --- */
async function loadRequests() {
  const list = $("reqList");
  list.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, "passwordRequests"), orderBy("createdAt", "desc"), limit(50)));
    if (snap.empty) { list.innerHTML = '<p class="muted">No password requests yet.</p>'; return; }
    list.innerHTML = "";
    snap.forEach((d) => list.appendChild(requestRow(d.id, d.data())));
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="muted">Could not load requests. Publish the latest firestore.rules and try again.</p>';
  }
}

function requestRow(id, r) {
  const row = document.createElement("div");
  row.className = "ix-row";
  const paint = (status) => {
    row.innerHTML = `
      <div class="ix-person-text">
        <strong>${escapeHTML(r.identifier)}</strong>
        <small>Code ${escapeHTML(id.slice(0, 6).toUpperCase())} &middot; ${escapeHTML(timeAgo(r.createdAt) || "just now")}</small>
      </div>
      <span class="ix-pill ${escapeHTML(status)}">${escapeHTML(status)}</span>
      ${status === "pending" ? `<div class="ix-actions">
        <button class="btn btn-primary btn-sm" data-a="approve" type="button">Approve</button>
        <button class="btn btn-ghost btn-sm" data-a="reject" type="button">Reject</button></div>` : ""}`;
  };
  paint(r.status);
  row.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    const msg = $("reqMsg");
    e.target.disabled = true;
    try {
      if (a === "approve") await updateDoc(doc(db, "passwordRequests", id), { status: "approved", approvedAt: serverTimestamp() });
      else await updateDoc(doc(db, "passwordRequests", id), { status: "rejected" });
      paint(a === "approve" ? "approved" : "rejected");
      msg.hidden = true;
    } catch (ex) {
      console.error(ex);
      e.target.disabled = false;
      msg.className = "alert alert-error"; msg.textContent = "Could not update the request."; msg.hidden = false;
    }
  });
  return row;
}

/* ------------------------------------------------------------- users --- */
const USERS_KEY = "ix_admin_users";
const USERS_TTL = 5 * 60 * 1000;
let users = [];

async function loadUsers(force) {
  const list = $("userList");
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
      if (c && Array.isArray(c.users) && Date.now() - c.at < USERS_TTL) { users = c.users; renderUsers(); return; }
    } catch {}
  }
  list.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(300)));
    users = snap.docs.map((d) => {
      const u = d.data();
      return { uid: d.id, name: u.name || "", username: u.username || "", userId: u.userId || "", email: u.email || "",
               blocked: u.blocked === true, joined: u.createdAt && u.createdAt.toMillis ? u.createdAt.toMillis() : 0 };
    });
    users.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    saveUsersCache();
    renderUsers();
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="muted">Could not load users. Publish the latest firestore.rules and try again.</p>';
  }
}
function saveUsersCache() {
  try { localStorage.setItem(USERS_KEY, JSON.stringify({ at: Date.now(), users })); } catch {}
}
async function ensureUsersLoaded() {
  if (users.length) return;
  try {
    const c = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    if (c && Array.isArray(c.users) && Date.now() - c.at < USERS_TTL) { users = c.users; return; }
  } catch {}
  await loadUsers(true);
}
const userById = (uid) => users.find((u) => u.uid === uid);

async function setBlocked(uid, blocked) {
  await updateDoc(doc(db, "users", uid), { blocked });
  const u = userById(uid);
  if (u) { u.blocked = blocked; saveUsersCache(); }
}

function renderUsers() {
  const f = $("userFilter").value.trim().toLowerCase();
  const shown = users.filter((u) => !f || [u.name, u.username, u.userId, u.email].join(" ").toLowerCase().includes(f));
  $("userCount").textContent = `${shown.length} of ${users.length} users`;
  const list = $("userList");
  list.innerHTML = "";
  shown.forEach((u) => {
    const self = u.uid === user.uid;
    const row = document.createElement("div");
    row.className = "ix-row";
    row.innerHTML = `
      <div class="ix-person-text">
        <strong>${escapeHTML(u.name || "User")} ${u.blocked ? '<span class="ix-pill blocked">blocked</span>' : ""}</strong>
        <small>${escapeHTML([u.userId, u.username ? "@" + u.username : "", u.email].filter(Boolean).join(" · "))}</small>
        <small>Joined ${escapeHTML(formatDate(u.joined) || "-")}</small>
      </div>
      ${self ? "" : `<button class="btn ${u.blocked ? "btn-primary" : "btn-ghost"} btn-sm" type="button">${u.blocked ? "Unblock" : "Block"}</button>`}`;
    row.querySelector("button")?.addEventListener("click", async (e) => {
      const next = !u.blocked;
      if (next && !confirm(`Block ${u.name || "this user"}? They will not be able to send messages.`)) return;
      e.target.disabled = true;
      try {
        await setBlocked(u.uid, next);
        renderUsers();
      } catch (ex) {
        console.error(ex);
        e.target.disabled = false;
        alert("Could not update this user.");
      }
    });
    list.appendChild(row);
  });
}
$("userFilter").addEventListener("input", renderUsers);

/* ----------------------------------------------------------- reports --- */
let reports = [];
let repShowAll = false;
const REASONS = { spam: "Spam", harassment: "Harassment or bullying", inappropriate: "Inappropriate content", other: "Something else" };

$("repOpen").addEventListener("click", () => setRepFilter(false));
$("repAll").addEventListener("click", () => setRepFilter(true));
function setRepFilter(all) {
  repShowAll = all;
  $("repOpen").setAttribute("aria-selected", String(!all));
  $("repAll").setAttribute("aria-selected", String(all));
  renderReports();
}

async function loadReports() {
  const list = $("repList");
  list.innerHTML = '<p class="muted">Loading...</p>';
  try {
    await ensureUsersLoaded();   // to show names instead of ids (cached for 5 minutes)
    const snap = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(60)));
    reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderReports();
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="muted">Could not load reports. Publish the latest firestore.rules and try again.</p>';
  }
}

function showRepMsg(text, ok) {
  const m = $("repMsg");
  m.className = "alert " + (ok ? "alert-success" : "alert-error");
  m.textContent = text; m.hidden = !text;
}

function renderReports() {
  const list = $("repList");
  const shown = reports.filter((r) => repShowAll || r.status === "open");
  list.innerHTML = "";
  if (!shown.length) { list.innerHTML = `<p class="muted">${repShowAll ? "No reports yet." : "No open reports."}</p>`; return; }
  shown.forEach((r) => list.appendChild(reportRow(r)));
}

function who(uid) {
  const u = userById(uid);
  return u ? `${u.name || "User"}${u.userId ? " (" + u.userId + ")" : ""}` : uid.slice(0, 8);
}

function reportRow(r) {
  const el = document.createElement("div");
  el.className = "ix-report";
  const reported = userById(r.reportedId);
  const isOpen = r.status === "open";
  const blockedNow = reported && reported.blocked;
  el.innerHTML = `
    <header>
      <strong>${escapeHTML(who(r.reportedId))}</strong>
      <span class="ix-pill ${escapeHTML(r.status)}">${escapeHTML(r.status)}</span>
    </header>
    <small>Reported by ${escapeHTML(who(r.reporterId))} &middot; ${escapeHTML(REASONS[r.reason] || r.reason || "")} &middot; ${escapeHTML(timeAgo(r.createdAt) || "just now")}</small>
    ${r.text ? `<p class="ix-msgtext">${escapeHTML(r.text)}</p>` : ""}
    ${r.thumb && r.thumb.startsWith("data:image/") ? `<img class="ix-thumb" alt="Reported photo" src="${escapeHTML(r.thumb)}">` : ""}
    ${!r.text && !r.thumb ? '<small>The message has no preview (photo already expired or deleted).</small>' : ""}
    <div class="ix-actions">
      ${isOpen ? `<button class="btn btn-ghost btn-sm" type="button" data-a="delete">Delete message</button>` : ""}
      ${isOpen || !blockedNow ? `<button class="btn btn-ghost btn-sm" type="button" data-a="block">${blockedNow ? "Unblock user" : "Block user"}</button>` : ""}
      ${isOpen ? `<button class="btn btn-primary btn-sm" type="button" data-a="dismiss">Dismiss</button>` : ""}
    </div>`;

  el.querySelector(".ix-thumb")?.addEventListener("click", () => viewReportedPhoto(r));
  el.querySelector(".ix-actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-a]");
    if (!btn) return;
    const a = btn.dataset.a;
    try {
      btn.disabled = true;
      if (a === "delete") {
        if (!confirm("Delete this message for both people?")) { btn.disabled = false; return; }
        await adminDeleteMessage(r);
        await markReport(r, "resolved");
        showRepMsg("Message deleted.", true);
      } else if (a === "block") {
        const u = userById(r.reportedId);
        const next = !(u && u.blocked);
        if (next && !confirm(`Block ${who(r.reportedId)}? They will not be able to send messages.`)) { btn.disabled = false; return; }
        await setBlocked(r.reportedId, next);
        if (next && r.status === "open") await markReport(r, "resolved");
        showRepMsg(next ? "User blocked." : "User unblocked.", true);
      } else if (a === "dismiss") {
        await markReport(r, "dismissed");
        showRepMsg("", true);
      }
      renderReports();
    } catch (ex) {
      console.error(ex);
      btn.disabled = false;
      showRepMsg(ex && ex.code === "not-found" ? "That message no longer exists." : "Could not complete that action.", false);
    }
  });
  return el;
}

async function markReport(r, status) {
  await updateDoc(doc(db, "reports", r.id), { status, handledAt: serverTimestamp() });
  r.status = status;
}

// Blank the message for both people and remove its photo (counter goes down by one).
async function adminDeleteMessage(r) {
  const mref = doc(db, "chats", r.chatId, "messages", r.msgId);
  if (!r.photoId) {
    await updateDoc(mref, { deleted: true, text: "", removedByAdmin: true });
    return;
  }
  await updateDoc(mref, {
    deleted: true, text: "", removedByAdmin: true,
    thumb: deleteField(), photoId: deleteField(), hasImage: false, imageBytes: deleteField(),
  });
  const pref = doc(db, "chats", r.chatId, "photos", r.photoId);
  let bytes = 0, exists = false;
  try { const snap = await getDoc(pref); exists = snap.exists(); bytes = exists ? (snap.data().bytes || 0) : 0; } catch {}
  if (exists) {
    const b = writeBatch(db);
    b.delete(pref);
    b.set(doc(db, "stats", "photos"), { count: increment(-1), bytes: increment(-bytes) }, { merge: true });
    await b.commit();
  }
}

async function viewReportedPhoto(r) {
  const box = document.createElement("div");
  box.className = "ix-lightbox";
  const img = document.createElement("img");
  img.alt = "Reported photo"; img.src = r.thumb;
  box.appendChild(img);
  box.addEventListener("click", () => box.remove());
  document.body.appendChild(box);
  if (!r.photoId) return;
  try {
    const snap = await getDoc(doc(db, "chats", r.chatId, "photos", r.photoId));
    if (snap.exists() && String(snap.data().data).startsWith("data:image/")) img.src = snap.data().data;
  } catch (e) { console.warn("Full photo not available:", e); }
}

/* ----------------------------------------------------------- settings --- */
// settings/app holds { resetHours, autoDeleteHours }. Read once, used by two tabs.
let settingsLoaded = false;
async function readSettings() {
  if (settingsLoaded) return;
  try {
    const snap = await getDoc(doc(db, "settings", "app"));
    if (snap.exists()) {
      const s = snap.data();
      if (s.resetHours) $("resetHours").value = s.resetHours;
      if (s.autoDeleteHours) $("autoDeleteHours").value = s.autoDeleteHours;
    }
    settingsLoaded = true;
  } catch (e) { console.warn(e); }
}
async function loadSettings() { await readSettings(); }

async function saveSetting(inputId, key, formBtn, msgBox) {
  const input = $(inputId);
  const hours = Number(input.value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) return setFieldError(input, "Enter a whole number from 1 to 720.");
  setFieldError(input, "");
  const btn = $(formBtn), msg = $(msgBox);
  setLoading(btn, true, "Saving...");
  try {
    await setDoc(doc(db, "settings", "app"), { [key]: hours }, { merge: true });
    try { localStorage.removeItem("ix_settings"); } catch {}   // this device re-reads it
    msg.className = "alert alert-success"; msg.textContent = "Saved."; msg.hidden = false;
  } catch (ex) {
    console.error(ex);
    msg.className = "alert alert-error"; msg.textContent = "Could not save."; msg.hidden = false;
  } finally { setLoading(btn, false); }
}
$("setForm").addEventListener("submit", (e) => { e.preventDefault(); saveSetting("resetHours", "resetHours", "setBtn", "setMsg"); });
$("delForm").addEventListener("submit", (e) => { e.preventDefault(); saveSetting("autoDeleteHours", "autoDeleteHours", "delBtn", "delMsg"); });

/* ------------------------------------------------------------ storage --- */
const fmtSize = (bytes) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
};
async function loadStorage() {
  await readSettings();
  try {
    const snap = await getDoc(doc(db, "stats", "photos"));
    const s = snap.exists() ? snap.data() : { count: 0, bytes: 0 };
    const count = Math.max(0, s.count || 0), bytes = Math.max(0, s.bytes || 0);
    $("stCount").textContent = String(count);
    $("stSize").textContent = fmtSize(bytes);
    $("stAvg").textContent = count ? fmtSize(Math.round(bytes / count)) : "-";
  } catch (e) {
    console.error(e);
    $("stCount").textContent = "?"; $("stSize").textContent = "?"; $("stAvg").textContent = "?";
    $("stNote").textContent = "Could not load storage numbers. Publish the latest firestore.rules and try again.";
  }
}
