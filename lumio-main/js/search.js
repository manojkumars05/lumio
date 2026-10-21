// =============================================================================
// search.js - find a person by InfiniX ID (SMR-12345) or by username, then open
// a chat with them. Costs 1-2 small reads per search, nothing else.
// =============================================================================

import { db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { findByUserId, normalizeId } from "./handle.js";
import { escapeHTML, setLoading } from "./utils.js";
import { follow, unfollow, isFollowing } from "./follow.js";

const form = document.getElementById("searchForm");
const input = document.getElementById("q");
const msg = document.getElementById("msg");
const result = document.getElementById("result");
const goBtn = document.getElementById("goBtn");

const user = await requireAuth();
const contactsKey = "lumio_contacts_" + user.uid;
let myCache = {};
try { myCache = JSON.parse(localStorage.getItem("lumio_user") || "{}") || {}; } catch {}

function say(text, isError) {
  msg.textContent = text || "";
  msg.style.color = isError ? "var(--danger)" : "";
}

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

function showPerson(p) {
  result.innerHTML = `
    <article class="ix-person">
      <span class="avatar avatar-lg${p.photo ? " has-photo" : ""}" aria-hidden="true" id="resAv">${p.photo ? "" : escapeHTML(initials(p.name))}</span>
      <div class="ix-person-text">
        <strong>${escapeHTML(p.name)}</strong>
        <small>${escapeHTML(p.userId)}${p.username ? " &middot; @" + escapeHTML(p.username) : ""}</small>
      </div>
      <div class="ix-actions">
        <button class="btn btn-primary btn-sm" type="button" id="followBtn" disabled>Follow</button>
        <button class="btn btn-ghost btn-sm" type="button" id="msgBtn">Message</button>
      </div>
    </article>`;
  if (p.photo && /^(data:image\/|https:\/\/res\.cloudinary\.com\/)/.test(String(p.photo))) document.getElementById("resAv").style.backgroundImage = "url(" + p.photo + ")";
  // Follow / Following: one small read to know the current state.
  const fb = document.getElementById("followBtn");
  let following = false;
  const paintFollow = () => {
    fb.textContent = following ? "Following" : "Follow";
    fb.className = "btn btn-sm " + (following ? "btn-ghost" : "btn-primary");
  };
  isFollowing(user.uid, p.uid).then((v) => { following = v; paintFollow(); fb.disabled = false; })
    .catch(() => { fb.disabled = false; paintFollow(); });
  fb.addEventListener("click", async () => {
    if (following && !confirm("Unfollow " + p.name + "?")) return;
    fb.disabled = true;
    try {
      if (following) await unfollow(user.uid, p.uid);
      else await follow(user.uid, { uid: p.uid, name: p.name, id: p.userId });
      following = !following;
      say("");
    } catch (err) {
      console.error(err);
      say("Could not update. Check your connection and try again.", true);
    } finally { paintFollow(); fb.disabled = false; }
  });
  document.getElementById("msgBtn").addEventListener("click", () => {
    // Save them as a contact (the Chat page reads this list), then open the chat.
    try {
      const list = JSON.parse(localStorage.getItem(contactsKey) || "[]");
      if (!list.some((c) => c.uid === p.uid)) {
        list.unshift({ uid: p.uid, name: p.name, id: p.userId, photo: p.photo || "" });
        localStorage.setItem(contactsKey, JSON.stringify(list));
      }
    } catch {}
    location.href = "chat.html?open=" + encodeURIComponent(p.uid);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  result.innerHTML = "";
  const raw = input.value.trim().toLowerCase();
  if (!raw) return say("Type an InfiniX ID or a username.", true);

  setLoading(goBtn, true);
  say("Searching...");
  try {
    let person = null;
    const id = normalizeId(raw);
    if (id) {
      const h = await findByUserId(id);
      if (h) person = { uid: h.uid, name: h.name, userId: id, photo: h.photo || "" };
    } else if (/^[a-z0-9_.]{5,20}$/.test(raw.replace(/^@/, ""))) {
      const u = raw.replace(/^@/, "");
      const snap = await getDoc(doc(db, "usernames", u));
      if (snap.exists()) {
        const d = snap.data();
        if (!d.userId) return say("This person can't be messaged yet. Ask them to open InfiniX once.", true);
        let photo = "";
        try { photo = (await findByUserId(d.userId))?.photo || ""; } catch {}
        person = { uid: d.uid, name: d.name, userId: d.userId, username: u, photo };
      }
    } else {
      return say("Enter an ID like SMR-12345, or a username (5-20 small letters, numbers, _ or .).", true);
    }

    if (!person) return say("No user found.", true);
    if (person.uid === user.uid) return say("That's you.", true);
    say("");
    showPerson(person);
  } catch (err) {
    console.error(err);
    say("Search failed. Check your connection and try again.", true);
  } finally {
    setLoading(goBtn, false);
  }
});
