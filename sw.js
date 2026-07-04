// ==========================================
// SERVICE WORKER - GestiónPro PWA
// ==========================================

const CACHE_NAME = 'gestionpro-v2';

// Instalar: no pre-cachear, usar cache dinámico
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activar: limpiar caches antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // No cachear peticiones a Firebase o APIs externas
    if (event.request.url.includes('firebasestorage') ||
        event.request.url.includes('googleapis') ||
        event.request.url.includes('firestore') ||
        event.request.url.includes('identitytoolkit') ||
        event.request.url.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
