const CACHE_NAME = 'dental-jg-1.0.7';
const SHELL = ['./', './index.html', './styles.css', './config.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo-dental-jg.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { const url = new URL(event.request.url); if (url.origin === self.location.origin && event.request.method === 'GET') event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request))); });
