const CACHE_NAME = "sirh-cache-v4"; // Passage en V4 pour forcer le nettoyage
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

// 1. INSTALLATION : Mise en cache initiale
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📂 SW: Mise en cache des assets");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVATION : Nettoyage des anciens caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("🧹 SW: Suppression ancien cache", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. STRATÉGIE DE FETCH
self.addEventListener("fetch", (e) => {
  // SÉCURITÉ 1 : On ne gère que les requêtes GET (le cache ne supporte pas POST/PUT)
  if (e.request.method !== 'GET') return;

  // SÉCURITÉ 2 : On laisse passer les requêtes API sans y toucher
  if (e.request.url.includes('/api/')) return;

  // STRATÉGIE : Stale-While-Revalidate (Propre)
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        
        // On lance la requête réseau en arrière-plan
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          // On vérifie si la réponse est valide avant de la mettre en cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Optionnel : ici on pourrait renvoyer une page "Offline" personnalisée
        });

        // On renvoie la version cachée immédiatement, ou la version réseau si pas en cache
        return cachedResponse || fetchPromise;
      });
    })
  );
});



// Dans sw.js
self.addEventListener('push', function(event) {
    const data = event.data.json(); // Données envoyées par ton serveur

    const options = {
        body: data.body,
        icon: '/assets/icons/icon-512x512.png',
        badge: '/assets/icons/badge-72x72.png', // Petite icône barre du haut
        image: data.image || null, // Optionnel : grande image
        vibrate: [200, 100, 200],
        data: { url: data.url }, // URL à ouvrir au clic
        actions: [
            { action: 'open', title: 'Voir l\'appli' },
            { action: 'close', title: 'Ignorer' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Gérer le clic sur la notification
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
