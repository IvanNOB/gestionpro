// ==========================================
// SERVICE WORKER - GestiónPro (Offline + Sync)
// Estrategia: Network-First con fallback a cache
// ==========================================

const CACHE_NAME = 'gestionpro-v5';

const PRECACHE_URLS = [
    './',
    './index.html',
    './login.html',
    './mesero.html',
    './cocina.html',
    './turno.html',
    './menu.html',
    './fichas-mesero.html',
    './admin.html',
    './admin-login.html',
    './landing.html',
    './pagar.html',
    './terminos.html',
    './styles.css',
    './login-styles.css',
    './admin-styles.css',
    './cocina-styles.css',
    './app.js',
    './auth.js',
    './mesero.js',
    './cocina-app.js',
    './admin.js',
    './tickets.js',
    './modules-extra.js',
    './firebase-config.js',
    './manifest.json',
    './manifest-mesero.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Dominios que NUNCA se cachean (Firebase, APIs)
const NO_CACHE = [
    'firebasestorage.googleapis.com',
    'googleapis.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.gstatic.com',
    'api.qrserver.com'
];

// INSTALL: Pre-cachear todos los archivos de la app
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
            .catch(() => self.skipWaiting())
    );
});

// ACTIVATE: Limpiar caches viejos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// FETCH: Network-First (intenta internet, si falla usa cache)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // No cachear Firebase/APIs
    if (NO_CACHE.some(domain => url.hostname.includes(domain))) return;

    // Para archivos de la app: Network-First
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Si la red responde, guardar en cache y devolver
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Sin internet: devolver desde cache
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // Si es una página HTML, devolver index.html como fallback
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Escuchar mensajes
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});