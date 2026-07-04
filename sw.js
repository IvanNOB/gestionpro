// ==========================================
// SERVICE WORKER - GestiónPro PWA (Optimizado)
// Estrategias: Cache-First, Network-First, Stale-While-Revalidate
// ==========================================

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `gestionpro-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `gestionpro-dynamic-${CACHE_VERSION}`;
const MAX_DYNAMIC_CACHE_SIZE = 50;

// Assets estáticos que se pre-cachean en install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './login.html',
    './styles.css',
    './login-styles.css',
    './admin-styles.css',
    './app.js',
    './auth.js',
    './firebase-config.js',
    './mesero.js',
    './tickets.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Dominios que NUNCA deben cachearse (APIs, auth, datos en tiempo real)
const NO_CACHE_DOMAINS = [
    'firebasestorage.googleapis.com',
    'googleapis.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'gstatic.com',
    'www.gstatic.com',
    'securetoken.googleapis.com',
    'api.qrserver.com'
];

// ==========================================
// INSTALL: Pre-cachear assets estáticos
// ==========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Pre-caching assets estáticos');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('[SW] Error pre-caching (continuando):', err);
                return self.skipWaiting();
            })
    );
});

// ==========================================
// ACTIVATE: Limpiar caches antiguos
// ==========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map((key) => {
                        console.log('[SW] Eliminando cache antiguo:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ==========================================
// FETCH: Estrategias por tipo de recurso
// ==========================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar peticiones que no sean GET
    if (request.method !== 'GET') return;

    // No cachear APIs de Firebase y servicios externos
    if (shouldSkipCache(url)) return;

    // Determinar estrategia según tipo de recurso
    if (isStaticAsset(url)) {
        // Cache-First para assets estáticos (CSS, JS, imágenes, fuentes)
        event.respondWith(cacheFirst(request));
    } else if (isHTMLPage(url)) {
        // Network-First para páginas HTML (siempre contenido fresco)
        event.respondWith(networkFirst(request));
    } else if (isCDNResource(url)) {
        // Stale-While-Revalidate para CDN (Chart.js, etc.)
        event.respondWith(staleWhileRevalidate(request));
    } else {
        // Network-First por defecto para todo lo demás
        event.respondWith(networkFirst(request));
    }
});

// ==========================================
// ESTRATEGIA: Cache-First
// Primero busca en caché, si no está va a la red
// Ideal para: assets estáticos que cambian poco
// ==========================================
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Si falla y hay algo en caché dinámico, usarlo
        const dynamicCached = await caches.match(request, { cacheName: DYNAMIC_CACHE });
        if (dynamicCached) return dynamicCached;
        return new Response('Offline - recurso no disponible', { status: 503 });
    }
}

// ==========================================
// ESTRATEGIA: Network-First
// Primero intenta la red, si falla usa el caché
// Ideal para: HTML, datos que necesitan ser frescos
// ==========================================
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
            trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback para páginas HTML: devolver index.html cacheado
        if (request.headers.get('accept')?.includes('text/html')) {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
        }

        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
}

// ==========================================
// ESTRATEGIA: Stale-While-Revalidate
// Devuelve caché inmediatamente y actualiza en background
// Ideal para: CDN resources, librerías externas
// ==========================================
async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);

    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            const cache = caches.open(DYNAMIC_CACHE);
            cache.then((c) => c.put(request, response.clone()));
        }
        return response;
    }).catch(() => cached);

    // Devolver caché si existe, sino esperar la red
    return cached || fetchPromise;
}

// ==========================================
// UTILIDADES
// ==========================================

/** Determina si la URL debe saltarse el caché */
function shouldSkipCache(url) {
    return NO_CACHE_DOMAINS.some(domain => url.hostname.includes(domain));
}

/** Determina si es un asset estático */
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext)) && url.origin === self.location.origin;
}

/** Determina si es una página HTML */
function isHTMLPage(url) {
    return url.pathname.endsWith('.html') || url.pathname.endsWith('/');
}

/** Determina si es un recurso de CDN externo */
function isCDNResource(url) {
    const cdnDomains = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
    return cdnDomains.some(domain => url.hostname.includes(domain));
}

/** Limita el tamaño del caché dinámico */
async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        // Eliminar los más antiguos (FIFO)
        const toDelete = keys.slice(0, keys.length - maxItems);
        await Promise.all(toDelete.map(key => cache.delete(key)));
    }
}

// ==========================================
// BACKGROUND SYNC (para operaciones offline)
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
});
