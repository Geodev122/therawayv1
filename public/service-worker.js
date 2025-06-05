const CACHE_NAME = 'theraway-v2.0';
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];
const API_BASE_URL = '/api/';
const FIREBASE_API_URL = 'https://firebasestorage.googleapis.com/';

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching App Shell');
      return cache.addAll(APP_SHELL_FILES).catch(error => {
        console.warn('[ServiceWorker] Some files failed to pre-cache:', error);
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

  // API calls: Network first, then cache
  if (url.pathname.startsWith(API_BASE_URL) || url.origin.includes('firebaseapp.com') || url.origin.includes('googleapis.com')) {
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
              message: 'You are offline. Could not fetch data from the network.',
              offline: true 
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // For Firebase Storage (images, videos, etc.)
  if (url.origin.includes(FIREBASE_API_URL)) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then(response => {
              if (response.ok) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => {
              // For images, return a placeholder
              if (request.destination === 'image') {
                return caches.match('/icons/placeholder-image.png');
              }
              // For other resources, just let it fail
              throw new Error('Network error and no cache available');
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
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }

  // For other static assets (CSS, JS, images): Cache-first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        // Cache new assets on the fly
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If an image fails and is not cached, return a placeholder
        if (request.destination === 'image') {
          return caches.match('/icons/placeholder-image.png');
        }
        // For other resources, just let it fail
        throw new Error('Network error and no cache available');
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  } else if (event.tag === 'sync-profile-updates') {
    event.waitUntil(syncProfileUpdates());
  }
});

// Function to sync favorites when back online
async function syncFavorites() {
  try {
    const db = await openIndexedDB();
    const pendingFavorites = await getPendingFavorites(db);
    
    for (const favorite of pendingFavorites) {
      try {
        await fetch('/api/client_favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${favorite.token}`
          },
          body: JSON.stringify({ therapistId: favorite.therapistId })
        });
        
        // Remove from pending queue
        await removePendingFavorite(db, favorite.id);
      } catch (error) {
        console.error('Error syncing favorite:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncFavorites:', error);
  }
}

// Function to sync profile updates when back online
async function syncProfileUpdates() {
  try {
    const db = await openIndexedDB();
    const pendingUpdates = await getPendingProfileUpdates(db);
    
    for (const update of pendingUpdates) {
      try {
        await fetch('/api/user_profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${update.token}`
          },
          body: JSON.stringify(update.data)
        });
        
        // Remove from pending queue
        await removePendingProfileUpdate(db, update.id);
      } catch (error) {
        console.error('Error syncing profile update:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncProfileUpdates:', error);
  }
}

// IndexedDB helper functions
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('theraWayOfflineDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores for pending actions
      if (!db.objectStoreNames.contains('pendingFavorites')) {
        db.createObjectStore('pendingFavorites', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('pendingProfileUpdates')) {
        db.createObjectStore('pendingProfileUpdates', { keyPath: 'id' });
      }
    };
  });
}

async function getPendingFavorites(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingFavorites'], 'readonly');
    const store = transaction.objectStore('pendingFavorites');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removePendingFavorite(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingFavorites'], 'readwrite');
    const store = transaction.objectStore('pendingFavorites');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getPendingProfileUpdates(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingProfileUpdates'], 'readonly');
    const store = transaction.objectStore('pendingProfileUpdates');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removePendingProfileUpdate(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingProfileUpdates'], 'readwrite');
    const store = transaction.objectStore('pendingProfileUpdates');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-96x96.png',
      data: data.data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error('Error showing push notification:', error);
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});