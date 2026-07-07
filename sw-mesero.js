// Service Worker mínimo para permitir instalación como PWA
// Solo maneja el evento fetch para cumplir el requisito de instalabilidad

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});