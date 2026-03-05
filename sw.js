const CACHE_NAME = "sirh-cache-v2"; // Incrémente ceci à chaque grosse mise à jour
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./js/main.js",
  "./js/core/api.js",
  "./js/core/config.js",
  "./js/core/state.js",
  "./js/core/utils.js",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap",
  // Liste tes modules critiques ici pour qu'ils soient disponibles hors-ligne
];

// 1. INSTALLATION : Met en cache les fichiers critiques
self.addEventListener("install", (e) => {
  self.skipWaiting(); // Force le remplacement immédiat de l'ancien SW
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVATION : Nettoie les anciens caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
});

// 3. FETCH STRATEGY : Stale-While-Revalidate
// C'est le standard moderne : tu affiches vite (cache) et tu mets à jour silencieusement
self.addEventListener("fetch", (e) => {
  // On ignore les requêtes API (elles ne doivent pas être en cache)
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// 4. NOTIFICATIONS PUSH
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
