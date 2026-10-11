// Lumio service worker - only used to show message notifications
// (Android Chrome needs a service worker to display them).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
