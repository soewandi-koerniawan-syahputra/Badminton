/* Service worker untuk Badminton Match Manager (PWA offline).
   Strategi: cache-first untuk aset inti, dengan fallback ke jaringan. */

const CACHE_NAME = "badminton-pwa-v3";

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
];

// Install: pra-cache semua aset inti.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: bersihkan cache versi lama.
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

// Fetch: layani dari cache dulu; kalau tak ada, ambil dari jaringan
// lalu simpan salinannya. Hanya menangani permintaan GET.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Simpan salinan untuk pemakaian offline berikutnya.
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy).catch(() => {});
          });
          return response;
        })
        .catch(() => cached); // offline & tak ada di cache
    })
  );
});
