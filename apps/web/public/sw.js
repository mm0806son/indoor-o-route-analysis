// Service Worker for Indoor Orienteering Route Analysis PWA
// Version: timestamp-based cache busting for automatic updates
const CACHE_VERSION = new Date().toISOString().split('T')[0]; // Updates daily
const CACHE_NAME = `indoor-o-${CACHE_VERSION}`;
const urlsToCache = [
  '/',
  '/manifest.json',
];

// Install event - cache important resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches (removes old versions)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
// This ensures latest content is always served if available
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (e.g. Google Fonts) — let the browser handle
  // them directly. Service worker fetches fall under connect-src CSP, so
  // attempting to proxy external URLs would violate a strict connect-src policy.
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Fall back to cache if network fails
        return caches.match(event.request);
      })
  );
});
