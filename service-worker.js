/* Service worker untuk KSBC Match Manager (PWA offline).
   Strategi: network-first. Selalu coba ambil versi terbaru dari server
   (melewati cache HTTP browser), simpan salinannya, dan pakai cache
   hanya saat offline. Dengan begitu update dari GitHub langsung terlihat. */

const CACHE_NAME = "badminton-pwa-v12";

// Aset yang di-cache saat instalasi. Path relatif agar cocok dengan
// GitHub Pages yang meng-host di subpath (/nama-repo/).
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./ksbc.png",
];

// Install: pra-cache semua aset inti. cache:"reload" memaksa ambil dari
// server, bukan dari cache HTTP browser yang mungkin masih versi lama.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" }))))
    )
  );
  self.skipWaiting();
});

// Activate: hapus cache versi lama lalu ambil alih semua tab.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first untuk file se-origin. Jika offline, pakai cache.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req.url, { cache: "no-cache" })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
