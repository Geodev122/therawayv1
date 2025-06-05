const CACHE_NAME = 'theraway-v1.2-app'; // Increment version and mark for /app deployment
const APP_SHELL_FILES = [
  '/app/',
  '/app/index.html',
  '/app/offline.html',
  // Vite generates hashed assets, which makes manual precaching tricky without a build step.
  // For a basic PWA, we'll cache the main entry points.
  // More robust caching would involve a Vite PWA plugin or dynamic caching of JS/CSS.
  // '/app/index.tsx', // Source files aren't served directly; build outputs are.
  // Placeholder for main JS and CSS bundles - these names change with Vite builds.
  // These will be cached on first load dynamically if not listed here.
  // Add manifest.json
  '/app/manifest.json',
  // Add key icons if they are in public and not dynamically generated paths
  '/app/icons/icon-192x192.png',
  '/app/icons/icon-512x512.png'
];
const API_BASE_URL_SW = '/backend/api/'; // Assuming API remains at domain root

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching App Shell for /app/');
      // Add essential app shell files to cache.
      // Some files might fail if they are not found (e.g. hashed assets), so we use addAll with a catch.
      return cache.addAll(APP_SHELL_FILES).catch(error => {
        console.warn('[ServiceWorker] Some files failed to pre-cache (this might be okay for hashed assets):', error);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: Network first, then cache, then specific offline handling (optional)
  // This condition assumes your API is NOT under /app/
  if (url.pathname.startsWith(API_BASE_URL_SW)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // If successful, clone and cache the response
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try to serve from cache
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // No cache match for API and network failed
            // Return a generic error JSON response for API calls
            return new Response(JSON.stringify({ 
              status: 'error', 
              message: 'Offline. Could not fetch data from the network.',
              offline: true 
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // For navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          // Cache first
          if (cachedResponse) {
            return cachedResponse;
          }
          // Network fallback
          return fetch(request)
            .then(response => {
              // Cache the new page if successful
              if (response.ok) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => {
              // Network failed and not in cache, serve offline page
              return caches.match('/app/offline.html'); // Updated path
            });
        })
    );
    return;
  }

  // For other static assets (CSS, JS, images): Cache-first or Stale-While-Revalidate
  // Using Cache-First for simplicity here
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        // Cache new assets on the fly
        if (networkResponse && networkResponse.ok) {
          // Check if the request is for an external CDN resource (like Tailwind or FontAwesome)
          // Avoid caching opaque responses unless specifically intended
          if (url.hostname === self.location.hostname || url.protocol === 'https:') { // Cache same-origin or HTTPS CDN
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
        }
        return networkResponse;
      }).catch(() => {
        // If an image or other asset fails and is not cached, 
        // you might want to return a placeholder image, but for now, just let it fail.
        // For fonts, browsers have their own fallbacks.
      });
    })
  );
});