// =============================================================================
// sidebar.js - Firebase-dependent parts of the bottom bar (name kept for the
// existing <script> tags): unread badge on "Chat" + admin-only "Admin" tab.
// The bar itself (icons + links) is drawn instantly by js/boot.js.
// =============================================================================

import { auth, db } from "./firebase-config.js";
import { cacheUser } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Paint the last known unread count immediately (before Firebase answers).
let unreadTotal = 0;
try { unreadTotal = Number(localStorage.getItem("ix_unread") || 0) || 0; } catch {}

function paintBadge() {
  const bar = document.getElementById("ixBar");
  const chatLink = bar && bar.querySelector('a[href="chat.html"]');
  if (!chatLink) return;
  let badge = chatLink.querySelector(".ix-badge");
  if (!badge) {
    badge = document.createElement("b");
    badge.className = "ix-badge";
    chatLink.appendChild(badge);
  }
  badge.textContent = unreadTotal > 99 ? "99+" : String(unreadTotal);
  badge.hidden = unreadTotal === 0;
}

paintBadge();

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  // Admin tab: ask Firestore once, then remember the answer on this device (0 reads afterwards).
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem("lumio_user") || "null"); } catch {}
  if (!cached || cached.uid !== user.uid || typeof cached.isAdmin !== "boolean") {
    let isAdmin = false, checked = false;
    try { isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); checked = true; } catch {}
    if (checked) {   // never remember a failed check as "not admin"
      cacheUser({ uid: user.uid, isAdmin });
      // cacheUser skips empty values, so store false explicitly.
      try {
        const c = JSON.parse(localStorage.getItem("lumio_user") || "{}");
        c.isAdmin = isAdmin;
        localStorage.setItem("lumio_user", JSON.stringify(c));
      } catch {}
      window.__ixSetAdmin && window.__ixSetAdmin(isAdmin);
      paintBadge();
    }
  }

  // Unread-message badge on the Chat tab (shows on every page).
  const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
  onSnapshot(q, (snap) => {
    let total = 0;
    snap.forEach((d) => { total += (d.data().unread && d.data().unread[user.uid]) || 0; });
    unreadTotal = total;
    try { localStorage.setItem("ix_unread", String(total)); } catch {}
    // Unread chats for the bell on Home (same snapshot, so no extra reads).
    try {
      const inbox = [];
      snap.forEach((d) => {
        const x = d.data();
        const other = (x.members || []).find((m) => m !== user.uid);
        const n = (x.unread && x.unread[user.uid]) || 0;
        if (!other || !n) return;
        inbox.push({ uid: other, unread: n, text: x.lastText || "", id: (x.ids && x.ids[other]) || "",
                     ms: x.updatedAt && x.updatedAt.toMillis ? x.updatedAt.toMillis() : Date.now() });
      });
      localStorage.setItem("ix_inbox_" + user.uid, JSON.stringify(inbox));
      window.dispatchEvent(new CustomEvent("ix:inbox"));
    } catch {}
    paintBadge();
    try { if (total > 0) navigator.setAppBadge && navigator.setAppBadge(total); else navigator.clearAppBadge && navigator.clearAppBadge(); } catch (e) {}
  }, () => {});
});
