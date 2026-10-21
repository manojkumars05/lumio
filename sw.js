// InfiniX service worker
// 1) Shows message notifications (Android Chrome needs a service worker for that).
// 2) Makes page changes fast: pages, styles, scripts and the Firebase SDK are served from the
//    device first and refreshed in the background ("stale while revalidate"), so moving between
//    Home / Search / Chat / Friends / Settings feels instant and works with a weak connection.
// After you publish a new version, the new files appear on the next visit (open the app twice).
// Bump CACHE below if you ever need to force everyone onto a fresh copy.
const CACHE = "infinix-v20";
const SHELL = [
  "home.html", "search.html", "chat.html", "friends.html", "settings.html", "invite.html",
  "css/style.css", "js/boot.js", "js/firebase-config.js", "js/auth.js", "js/utils.js",
  "js/sidebar.js", "js/home.js", "js/follow.js", "js/friends.js", "js/search.js", "js/handle.js", "js/photo.js", "js/ptr.js", "js/device.js", "js/gone.js", "js/cloudinary-config.js", "js/cloudinary.js", "js/avatars.js", "js/chat.js",
  "assets/images/logo.svg", "manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One by one, so a single missing file never blocks the install.
    await Promise.all(SHELL.map((p) => cache.add(p).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase SDK files are versioned (never change): cache first.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Everything else on this site: stale while revalidate. Other hosts (Firestore, Auth, Vercel) are left alone.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  // ignoreSearch: chat.html?open=... uses the same cached page.
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { network.catch(() => {}); return hit; }
  const res = await network;
  if (res) return res;
  if (req.mode === "navigate") {
    const home = await cache.match("home.html");
    if (home) return home;
  }
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes("chat.html")) return c.focus();
    }
    return self.clients.openWindow("chat.html");
  })());
});
