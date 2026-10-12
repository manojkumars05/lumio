// =============================================================================
// boot.js - runs instantly (classic script, no imports, no network).
// 1. Draws the sidebar (icons + labels) immediately instead of waiting for
//    the Firebase SDK to download.
// 2. Fills the user's name / avatar letter / email / Lumio ID from the copy
//    saved on the last visit, so nothing shows "...", "?" or "Loading...".
// The real data from Firebase replaces these values a moment later (auth.js).
// =============================================================================
(function () {
  var icon = function (d) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  };
  var LINKS = [
    { href: "home.html", label: "Home", pages: ["home.html", "watch.html"], svg: icon('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>') },
    { href: "upload.html", label: "Upload", pages: ["upload.html"], svg: icon('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>') },
    { href: "chat.html", label: "Chat", pages: ["chat.html"], svg: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>') },
    { href: "settings.html", label: "Settings", pages: ["settings.html"], svg: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') },
    { href: "support.html", label: "Support", pages: ["support.html"], svg: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>') }
  ];
  var LOGOUT_SVG = icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>');
  var current = location.pathname.split("/").pop() || "index.html";

  // ---- sidebar ----
  if (!document.getElementById("lmSidebar")) {
    var nav = document.createElement("aside");
    nav.className = "lm-sidebar";
    nav.id = "lmSidebar";
    nav.setAttribute("aria-label", "Main navigation");
    nav.innerHTML =
      '<a class="lm-brand" href="home.html"><img src="assets/images/logo.svg" alt="" width="32" height="32"><span>Lumio</span></a>' +
      '<nav class="lm-links">' +
      LINKS.map(function (l) {
        return '<a href="' + l.href + '"' + (l.pages.indexOf(current) > -1 ? ' aria-current="page"' : "") + ">" + l.svg + "<span>" + l.label + "</span></a>";
      }).join("") +
      "</nav>" +
      '<button type="button" class="lm-logout" id="lmLogout">' + LOGOUT_SVG + "<span>Log out</span></button>";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "lm-toggle";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-controls", "lmSidebar");
    toggle.innerHTML = icon('<path d="M4 6h16M4 12h16M4 18h16"/>');

    var backdrop = document.createElement("div");
    backdrop.className = "lm-backdrop";

    document.body.classList.add("has-sidebar");
    document.body.prepend(backdrop);
    document.body.prepend(nav);
    document.body.prepend(toggle);

    var setOpen = function (open) {
      document.body.classList.toggle("lm-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", function () { setOpen(!document.body.classList.contains("lm-open")); });
    backdrop.addEventListener("click", function () { setOpen(false); });
    nav.querySelectorAll(".lm-links a").forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  }

  // ---- cached user (name, avatar letters, email, Lumio ID) ----
  try {
    var u = JSON.parse(localStorage.getItem("lumio_user") || "null");
    if (!u || !u.name) return;
    var initials = u.name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") || "?";
    var each = function (sel, fn) { document.querySelectorAll(sel).forEach(fn); };
    each("[data-user-name]", function (el) { el.textContent = u.name; });
    each("[data-user-first-name]", function (el) { el.textContent = u.name.split(/\s+/)[0]; });
    each("[data-user-email]", function (el) { el.textContent = u.email || ""; });
    each("[data-user-avatar]", function (el) { el.textContent = initials; });
    each("[data-user-since]", function (el) { el.textContent = u.since ? "Member since " + u.since : ""; });
    if (u.userId) {
      var id = document.getElementById("myId");
      if (id) id.textContent = u.userId;
    }
  } catch (e) {}
})();
