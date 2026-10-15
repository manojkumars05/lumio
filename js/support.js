// =============================================================================
// support.js - "Contact support".
// Users send a message (supportTickets/{id}); they only see their own tickets.
// Admins (admins/{uid} exists) also see every ticket and can write a reply.
// =============================================================================

import { db } from "./firebase-config.js";
import { getProfileCached, renderUserChip, requireAuth } from "./auth.js";
import {
  collection, doc, getDoc, addDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setFieldError, setLoading, setMessage } from "./utils.js";

const form = document.getElementById("supportForm");
const subjectEl = document.getElementById("subject");
const messageEl = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const formMsg = document.getElementById("formMsg");

const user = await requireAuth();
const profile = await getProfileCached(user);
renderUserChip(user, profile);

// Admin flag is remembered on this device (sidebar.js); only ask Firestore when it is unknown.
let isAdmin = false;
try {
  const c = JSON.parse(localStorage.getItem("lumio_user") || "null");
  if (c && c.uid === user.uid && typeof c.isAdmin === "boolean") isAdmin = c.isAdmin;
  else isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists();
} catch { /* not admin */ }

function when(ts) {
  const d = ts && ts.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "just now";
}

function ticketEl(t, id, admin) {
  const box = document.createElement("div");
  box.className = "ticket";
  const h = document.createElement("h3");
  h.textContent = t.subject;
  const tag = document.createElement("span");
  tag.className = "tag " + (t.status === "answered" ? "answered" : "open");
  tag.textContent = t.status === "answered" ? "Answered" : "Open";
  h.appendChild(tag);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = (admin ? t.name + " (" + t.email + ") - " : "") + when(t.createdAt);
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = t.message;
  box.append(h, meta, body);

  if (t.reply) {
    const r = document.createElement("div");
    r.className = "reply";
    r.textContent = "Support: " + t.reply;
    box.appendChild(r);
  }

  if (admin) {
    const f = document.createElement("form");
    const ta = document.createElement("textarea");
    ta.maxLength = 2000;
    ta.placeholder = "Write a reply";
    ta.value = t.reply || "";
    ta.setAttribute("aria-label", "Reply");
    const b = document.createElement("button");
    b.type = "submit";
    b.className = "btn btn-primary btn-sm";
    b.textContent = t.reply ? "Update reply" : "Send reply";
    f.append(ta, b);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const reply = ta.value.trim();
      if (!reply) return;
      b.disabled = true;
      try {
        await updateDoc(doc(db, "supportTickets", id), { reply, status: "answered", repliedAt: serverTimestamp() });
      } catch (err) { console.error(err); alert("Could not send reply. Check Firestore rules."); }
      b.disabled = false;
    });
    box.appendChild(f);
  }
  return box;
}

function paint(container, docs, admin, emptyText) {
  container.innerHTML = "";
  if (!docs.length) {
    const p = document.createElement("p");
    p.className = "lead";
    p.textContent = emptyText;
    container.appendChild(p);
    return;
  }
  docs.forEach((d) => container.appendChild(ticketEl(d.data(), d.id, admin)));
}

// My tickets (filtered by uid, sorted here so no extra index is needed).
onSnapshot(query(collection(db, "supportTickets"), where("uid", "==", user.uid)), (snap) => {
  const docs = snap.docs.slice().sort((a, b) => (b.data().createdAt?.toMillis?.() ?? Date.now()) - (a.data().createdAt?.toMillis?.() ?? Date.now()));
  paint(document.getElementById("mine"), docs, false, "You have not sent any messages yet.");
}, (err) => {
  console.error(err);
  document.getElementById("mine").textContent = "Could not load your messages. Check Firestore rules.";
});

// Admin: everything, newest first.
if (isAdmin) {
  document.getElementById("adminBox").hidden = false;
  onSnapshot(query(collection(db, "supportTickets"), orderBy("createdAt", "desc")), (snap) => {
    paint(document.getElementById("all"), snap.docs, true, "No support messages yet.");
  }, (err) => {
    console.error(err);
    document.getElementById("all").textContent = "Could not load support messages.";
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(formMsg, "");
  const subject = subjectEl.value.trim();
  const message = messageEl.value.trim();
  setFieldError(subjectEl, subject ? "" : "Please enter a subject.");
  setFieldError(messageEl, message ? "" : "Please write your message.");
  if (!subject || !message) return;

  setLoading(sendBtn, true, "Sending...");
  try {
    await addDoc(collection(db, "supportTickets"), {
      uid: user.uid,
      name: profile.name || user.displayName || "Member",
      email: user.email || "",
      subject,
      message,
      status: "open",
      createdAt: serverTimestamp(),
    });
    form.reset();
    formMsg.className = "alert alert-success";
    setMessage(formMsg, "Message sent. We will reply here.");
  } catch (err) {
    console.error(err);
    formMsg.className = "alert alert-error";
    setMessage(formMsg, "Could not send. Check your connection and the Firestore rules.");
  } finally {
    setLoading(sendBtn, false);
  }
});
