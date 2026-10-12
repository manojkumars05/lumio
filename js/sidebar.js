// =============================================================================
// sidebar.js - Firebase-dependent parts of the sidebar (log out, unread badge).
// The sidebar markup + LINKS list live in js/boot.js. On any page with the
// sidebar add BOTH: <script src="js/boot.js"></script> and
// <script type="module" src="js/sidebar.js"></script>.
// =============================================================================

import { logout } from "./auth.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// The sidebar itself (icons + links) is drawn instantly by js/boot.js.
// This module only wires up the parts that need Firebase: log out + unread badge.
const nav = document.getElementById("lmSidebar");
const toggle = document.querySelector(".lm-toggle");
document.getElementById("lmLogout")?.addEventListener("click", logout);

// ---- unread-message badge on the "Chat" menu item (shows on every page) ----
const chatLink = nav && nav.querySelector('.lm-links a[href="chat.html"]');
const badge = document.createElement("span");
badge.className = "lm-badge";
badge.hidden = true;
if (chatLink) chatLink.appendChild(badge);

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
  onSnapshot(q, (snap) => {
    let total = 0;
    snap.forEach((d) => { total += (d.data().unread && d.data().unread[user.uid]) || 0; });
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.hidden = total === 0;
    toggle?.classList.toggle("has-unread", total > 0);
  }, () => {});
});
