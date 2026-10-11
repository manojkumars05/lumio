// =============================================================================
// sidebar.js - left-side navigation (Home, Upload, Chat, Settings, Log out).
// Add <script type="module" src="js/sidebar.js"></script> to any page that
// should show the sidebar. Edit the LINKS list below to add or rename items.
// =============================================================================

import { logout } from "./auth.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const icon = (d) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const LINKS = [
  { href: "home.html", label: "Home", pages: ["home.html", "watch.html"], svg: icon('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>') },
  { href: "upload.html", label: "Upload", pages: ["upload.html"], svg: icon('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>') },
  { href: "chat.html", label: "Chat", pages: ["chat.html"], svg: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>') },
  { href: "settings.html", label: "Settings", pages: ["settings.html"], svg: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') },
];

const current = location.pathname.split("/").pop() || "index.html";

const nav = document.createElement("aside");
nav.className = "lm-sidebar";
nav.id = "lmSidebar";
nav.setAttribute("aria-label", "Main navigation");
nav.innerHTML = `
  <a class="lm-brand" href="home.html"><img src="assets/images/logo.svg" alt="" width="32" height="32"><span>Lumio</span></a>
  <nav class="lm-links">
    ${LINKS.map(
      (l) =>
        `<a href="${l.href}"${l.pages.includes(current) ? ' aria-current="page"' : ""}>${l.svg}<span>${l.label}</span></a>`
    ).join("")}
  </nav>
  <button type="button" class="lm-logout" id="lmLogout">
    ${icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')}<span>Log out</span>
  </button>`;

const toggle = document.createElement("button");
toggle.type = "button";
toggle.className = "lm-toggle";
toggle.setAttribute("aria-label", "Open menu");
toggle.setAttribute("aria-controls", "lmSidebar");
toggle.innerHTML = icon('<path d="M4 6h16M4 12h16M4 18h16"/>');

const backdrop = document.createElement("div");
backdrop.className = "lm-backdrop";

document.body.classList.add("has-sidebar");
document.body.prepend(backdrop);
document.body.prepend(nav);
document.body.prepend(toggle);

const setOpen = (open) => {
  document.body.classList.toggle("lm-open", open);
  toggle.setAttribute("aria-expanded", String(open));
};
toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("lm-open")));
backdrop.addEventListener("click", () => setOpen(false));
nav.querySelectorAll(".lm-links a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
document.getElementById("lmLogout").addEventListener("click", logout);

// ---- unread-message badge on the "Chat" menu item (shows on every page) ----
const chatLink = nav.querySelector('.lm-links a[href="chat.html"]');
const badge = document.createElement("span");
badge.className = "lm-badge";
badge.hidden = true;
chatLink.appendChild(badge);

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
  onSnapshot(q, (snap) => {
    let total = 0;
    snap.forEach((d) => { total += (d.data().unread && d.data().unread[user.uid]) || 0; });
    badge.textContent = total > 99 ? "99+" : String(total);
    badge.hidden = total === 0;
    toggle.classList.toggle("has-unread", total > 0);
  }, () => {});
});
