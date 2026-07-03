// ==========================================
// SERVICE WORKER - GestiónPro PWA
// ==========================================

const CACHE_NAME = 'gestionpro-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/login.html',
    '/styles.css',
    '/login-styles.css',
    '/app.js',
    '/auth.js',
    '/firebase-config.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Instalar: cachear archivos básicos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).catch((err) => {
            console.log('Cache error (no problem):', err);
        })
    );
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
        event.request.url.includes('identitytoolkit')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Guardar copia en cache
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Sin internet, buscar en cache
                return caches.match(event.request);
            })
    );
});
