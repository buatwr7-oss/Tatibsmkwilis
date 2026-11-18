// Service Worker — Tatib SMK Wiraguna
// Network-first untuk file milik sendiri (selalu versi terbaru); cache hanya cadangan offline.
// Request ke Firebase/CDN/font tidak disentuh.
const VERSION = "4.4.1";
const CACHE = "tatib-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "style.css?v=" + VERSION,
  "app.js?v=" + VERSION,
  "ambient.css?v=" + VERSION,
  "ambient.js?v=" + VERSION,
  "afirmasi.js?v=" + VERSION,
  "game-tictactoe.html",
  "manifest.json",
  "logo.png",
  "logo.ico",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit || caches.match(req, { ignoreSearch: true }))
          .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())),
      ),
  );
});
