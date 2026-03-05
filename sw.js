const CACHE_NAME = "sirh-cache-v3"; // Incrémenté en V3 pour forcer le rafraîchissement
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
  "./js/modules/admin.js",
  "./js/modules/auth.js",
  "./js/modules/chat.js",
  "./js/modules/dashboard.js",
  "./js/modules/hr.js",
  "./js/modules/leaves.js",
  "./js/modules/ops.js",
  "./js/modules/payroll.js",
  "./js/modules/ui.js"
];

// 1. INSTALLATION : Met en cache les fichiers locaux critiques
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📂 Mise en cache des assets...");
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
          if (cache !== CACHE_NAME) {
            console.log("🧹 Suppression de l'ancien cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Prend le contrôle immédiat des pages ouvertes
});

// 3. FETCH STRATEGY
self.addEventListener("fetch", (e) => {
  // On laisse passer les requêtes API (elles ne doivent JAMAIS être en cache)
  if (e.request.url.includes('/api/')) {
    return;
  }

  // Pour les fichiers statiques (JS, CSS, HTML, Images)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Stratégie Stale-While-Revalidate
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // Si on a récupéré une réponse valide du réseau, on met à jour le cache
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
          });
        }
        return networkResponse;
      });

      // Retourne le cache s'il existe, sinon on attend le réseau
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. NOTIFICATIONS PUSH
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
