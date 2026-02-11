const CACHE_NAME = 'mylife-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/charts.js',
  '/food.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4'
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate: clean up old caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: route requests based on type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls (Google Apps Script) -> network first, no cache
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') {
    event.respondWith(networkOnly(request));
    return;
  }

  // External API calls (api-ninjas, etc.) -> network only
  if (url.hostname === 'api.api-ninjas.com') {
    event.respondWith(networkOnly(request));
    return;
  }

  // Static assets and everything else -> cache first, fallback to network
  event.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy: try cache, fall back to network, update cache on miss.
 */
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);

    // Only cache successful responses and non-opaque for same-origin
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.error('[SW] Cache-first fetch failed:', err);

    // If both cache and network fail, return a basic offline fallback
    const cachedFallback = await caches.match('/index.html');
    if (cachedFallback) {
      return cachedFallback;
    }

    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Network-only strategy: always go to network, never cache.
 * Used for API calls that must always return fresh data.
 */
async function networkOnly(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (err) {
    console.error('[SW] Network-only fetch failed:', err);
    return new Response(JSON.stringify({ error: 'Network unavailable' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
