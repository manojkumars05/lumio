// =============================================================================
// boot.js - runs instantly (classic script, no imports, no network).
// 1. Draws the bottom bar (Home, Search, Chat, Friends, Settings + Admin for the
//    admin only) immediately instead of waiting for the Firebase SDK.
// 2. Fills the user's name / avatar letter / email / InfiniX ID from the copy
//    saved on the last visit, so nothing shows "...", "?" or "Loading...".
// The real data from Firebase replaces these values a moment later (auth.js).
// =============================================================================
(function () {
  var icon = function (d) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  };
  var LINKS = [
    { href: "home.html", label: "Home", pages: ["home.html"], svg: icon('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>') },
    { href: "search.html", label: "Search", pages: ["search.html"], svg: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') },
    { href: "chat.html", label: "Chat", pages: ["chat.html"], svg: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>') },
    { href: "friends.html", label: "Friends", pages: ["friends.html"], svg: icon('<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>') },
    { href: "settings.html", label: "Settings", pages: ["settings.html", "support.html", "download.html"], svg: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') }
  ];
  var ADMIN_LINK = { href: "admin.html", label: "Admin", pages: ["admin.html"], svg: icon('<path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>') };
  var current = location.pathname.split("/").pop() || "index.html";
  var NO_BAR = ["index.html", "login.html", "register.html"];
  var MAIN_PAGES = ["home.html", "search.html", "chat.html", "friends.html", "settings.html", "admin.html"];

  // ---- cached user (name, avatar letters, email, InfiniX ID, admin flag) ----
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem("lumio_user") || "null"); } catch (e) {}

  // ---- installable PWA + service worker (Windows/Android "Install app") ----
  if (!document.querySelector('link[rel="manifest"]')) {
    var mf = document.createElement("link"); mf.rel = "manifest"; mf.href = "manifest.json"; document.head.appendChild(mf);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.__lumioInstall = e; window.dispatchEvent(new Event("lumio-installable")); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  // ---- visible Back button on inner pages (not on the five main tabs) ----
  if (NO_BAR.indexOf(current) === -1 && MAIN_PAGES.indexOf(current) === -1) {
    var bk = document.createElement("button");
    bk.type = "button"; bk.className = "lm-backbtn"; bk.setAttribute("aria-label", "Back"); bk.textContent = "\u2190";
    bk.addEventListener("click", function () { if (history.length > 1) history.back(); else location.href = "home.html"; });
    document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(bk); });
  }

  // ---- Android app (Capacitor): hardware back button ----
  try {
    var cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.App) {
      cap.Plugins.App.addListener("backButton", function () {
        if (current === "chat.html" && history.state && history.state.chat) { history.back(); return; }
        if (current === "home.html" || current === "index.html" || current === "login.html") { cap.Plugins.App.exitApp(); return; }
        if (history.length > 1) history.back(); else location.href = "home.html";
      });
    }
  } catch (e) {}

  // ---- bottom bar ----
  function buildBar(showAdmin) {
    var old = document.getElementById("ixBar");
    if (old) old.remove();
    var links = showAdmin ? LINKS.concat([ADMIN_LINK]) : LINKS;
    var nav = document.createElement("nav");
    nav.className = "ix-bar";
    nav.id = "ixBar";
    nav.setAttribute("aria-label", "Main navigation");
    nav.innerHTML = links.map(function (l) {
      return '<a href="' + l.href + '"' + (l.pages.indexOf(current) > -1 ? ' aria-current="page"' : "") + ">" + l.svg + "<span>" + l.label + "</span></a>";
    }).join("");
    document.body.appendChild(nav);
  }
  // Warm up the other tabs while the browser is idle, so switching tabs is instant.
  function prefetchTabs() {
    if (NO_BAR.indexOf(current) !== -1) return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return;   // save data on slow networks
    MAIN_PAGES.forEach(function (p) {
      if (p === current || p === "admin.html") return;
      var l = document.createElement("link"); l.rel = "prefetch"; l.href = p; l.as = "document";
      document.head.appendChild(l);
    });
  }
  window.addEventListener("load", function () {
    if (window.requestIdleCallback) requestIdleCallback(prefetchTabs, { timeout: 4000 });
    else setTimeout(prefetchTabs, 2000);
  });

  // Called by sidebar.js once it knows whether this user is the admin.
  window.__ixSetAdmin = function (isAdmin) { if (NO_BAR.indexOf(current) === -1) buildBar(!!isAdmin); };

  if (NO_BAR.indexOf(current) === -1) {
    document.body.classList.add("has-bar");
    var mount = function () { buildBar(!!(cached && cached.isAdmin)); };
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  }

  // ---- fill name / avatar / email / ID from the cached copy ----
  try {
    var u = cached;
    if (!u || !u.name) return;
    var initials = u.name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") || "?";
    var each = function (sel, fn) { document.querySelectorAll(sel).forEach(fn); };
    each("[data-user-name]", function (el) { el.textContent = u.name; });
    each("[data-user-first-name]", function (el) { el.textContent = u.name.split(/\s+/)[0]; });
    each("[data-user-email]", function (el) { el.textContent = u.email || ""; });
    each("[data-user-avatar]", function (el) {
      if (cached.photo && String(cached.photo).indexOf("data:image/") === 0) {
        el.textContent = ""; el.className += " has-photo"; el.style.backgroundImage = "url(" + cached.photo + ")";
      } else el.textContent = initials;
    });
    each("[data-user-since]", function (el) { el.textContent = u.since ? "Member since " + u.since : ""; });
    if (u.userId) {
      var id = document.getElementById("myId");
      if (id) id.textContent = u.userId;
    }
  } catch (e) {}
})();
