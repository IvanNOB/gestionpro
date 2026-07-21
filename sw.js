// ==========================================
// SERVICE WORKER - GestiónPro v10
// Estrategia optimizada:
//   - JS/HTML/CSS: Network-First (siempre intenta la última versión)
//   - Imágenes/Iconos: Cache-First (se cargan rápido, cambian poco)
//   - Firebase/APIs: No cachear NUNCA
//   - Auto-actualización: skipWaiting + clients.claim inmediato
// ==========================================

const CACHE_NAME = 'gestionpro-v10';
const ASSETS_CACHE = 'gestionpro-assets-v10';

// Archivos principales de la app (Network-First)
const APP_FILES = [
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
    './admin-remote.html',
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
    './manifest-mesero.json'
];

// Assets estáticos (Cache-First - cambian poco)
const STATIC_ASSETS = [
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Dominios que NUNCA se cachean (Firebase, APIs externas)
const NO_CACHE_DOMAINS = [
    'firebasestorage.googleapis.com',
    'googleapis.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.gstatic.com',
    'api.qrserver.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// ==========================================
// INSTALL: Pre-cachear archivos críticos
// ==========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            // Cachear archivos de app
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(APP_FILES).catch(err => {
                    console.warn('SW: Error pre-cacheando app files:', err);
                });
            }),
            // Cachear assets estáticos
            caches.open(ASSETS_CACHE).then(cache => {
                return cache.addAll(STATIC_ASSETS).catch(err => {
                    console.warn('SW: Error pre-cacheando assets:', err);
                });
            })
        ]).then(() => self.skipWaiting()) // Activar inmediatamente sin esperar
    );
});

// ==========================================
// ACTIVATE: Limpiar TODOS los caches viejos
// ==========================================
self.addEventListener('activate', (event) => {
    const currentCaches = [CACHE_NAME, ASSETS_CACHE];
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => !currentCaches.includes(key))
                    .map(key => {
                        console.log('SW: Eliminando cache viejo:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            console.log('SW: v8 activado - tomando control de todos los clientes');
            return self.clients.claim(); // Tomar control inmediato de todas las pestañas
        })
    );
});

// ==========================================
// FETCH: Estrategia según tipo de recurso
// ==========================================
self.addEventListener('fetch', (event) => {
    // Solo manejar GET
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // NO cachear Firebase ni APIs externas
    if (NO_CACHE_DOMAINS.some(domain => url.hostname.includes(domain))) return;

    // NO cachear requests con parámetros ?nocache
    if (url.searchParams.has('nocache')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Determinar estrategia según tipo de archivo
    const isStaticAsset = isAssetRequest(url);

    if (isStaticAsset) {
        // CACHE-FIRST para imágenes, iconos, fuentes (carga rápida)
        event.respondWith(cacheFirstStrategy(event.request));
    } else {
        // NETWORK-FIRST para HTML, JS, CSS (siempre última versión)
        event.respondWith(networkFirstStrategy(event.request));
    }
});

// ==========================================
// ESTRATEGIAS DE CACHÉ
// ==========================================

/**
 * Network-First: Intenta red primero, fallback a caché.
 * Ideal para JS/HTML/CSS que cambian frecuentemente.
 * Si la red responde, actualiza el caché.
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // Actualizar caché con la respuesta fresca
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Sin internet: devolver desde caché
        const cached = await caches.match(request);
        if (cached) return cached;

        // Si es HTML y no está en caché, devolver index.html como fallback (SPA)
        if (request.headers.get('accept')?.includes('text/html')) {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
        }

        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Cache-First: Devuelve del caché si existe, sino descarga.
 * Ideal para assets estáticos que raramente cambian (imágenes, iconos).
 * Actualiza en background (stale-while-revalidate).
 */
async function cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) {
        // Revalidar en background (no bloquear)
        fetch(request).then(response => {
            if (response.ok) {
                caches.open(ASSETS_CACHE).then(cache => cache.put(request, response));
            }
        }).catch(() => {});
        return cached;
    }

    // No está en caché, descargar y guardar
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(ASSETS_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        return new Response('', { status: 404 });
    }
}

/**
 * Determina si un request es un asset estático (imagen, icono, fuente)
 */
function isAssetRequest(url) {
    const path = url.pathname.toLowerCase();
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
    return assetExtensions.some(ext => path.endsWith(ext)) || path.includes('/icons/');
}

// ==========================================
// MENSAJES: Forzar actualización desde la app
// ==========================================
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data === 'clearCache') {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }
    if (event.data === 'getVersion') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});
