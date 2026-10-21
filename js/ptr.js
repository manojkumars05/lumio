// ptr.js - pull down from the top of a page to refresh it.
//  - On pages with <body data-ptr="photos"> (home, chat, friends): only the profile photos are
//    checked again. Nothing reloads.
//  - On every other page (profile, admin, login, forgot password): the whole page reloads.
(function () {
  var TRIGGER = 90, startY = 0, dy = 0, active = false, busy = false, label = null, hideT = 0;

  function getLabel() {
    if (label) return label;
    label = document.createElement("div");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:0;right:0;top:0;display:flex;justify-content:center;pointer-events:none;z-index:999;opacity:0;transition:opacity .15s;padding-top:10px";
    label.innerHTML = '<span style="font-size:13px;padding:6px 12px;border-radius:999px;background:#fff;color:#111;border:1px solid #ddd"></span>';
    document.body.appendChild(label);
    return label;
  }
  function say(text, keep) {
    var l = getLabel();
    l.firstChild.textContent = text;
    l.style.opacity = "1";
    clearTimeout(hideT);
    if (!keep) hideT = setTimeout(function () { l.style.opacity = "0"; }, 1500);
  }
  // A list that scrolls inside the page (chat messages, friend list) must be at its top too.
  function insideScrolledBox(t) {
    for (var n = t; n && n !== document.body && n !== document.documentElement; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      var s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
    }
    return false;
  }

  document.addEventListener("touchstart", function (e) {
    active = !busy && window.scrollY <= 0 && e.touches.length === 1 && !insideScrolledBox(e.target);
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!active) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { if (label) label.style.opacity = "0"; return; }
    say("Release to refresh", true);
    getLabel().style.opacity = String(Math.min(1, dy / TRIGGER));
  }, { passive: true });

  document.addEventListener("touchend", function () {
    if (!active) return;
    active = false;
    if (dy < TRIGGER) { if (label) label.style.opacity = "0"; return; }
    if (document.body.dataset.ptr !== "photos") { location.reload(); return; }
    busy = true;
    say("Checking photos...", true);
    import("./js/avatars.js")
      .then(function (m) { return m.refreshPhotos(); })
      .then(function (changed) { say(changed ? "Photos updated" : "Photos are up to date"); })
      .catch(function () { say("Could not refresh. Check your internet."); })
      .finally(function () { busy = false; });
  });
})();
