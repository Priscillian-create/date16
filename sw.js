const CACHE_NAME = 'pagerrys-pos-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Only cache resources that exist
        return Promise.allSettled(
          urlsToCache.map(url => {
            return fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              } else {
                console.log('Failed to cache:', url);
                return Promise.resolve();
              }
            }).catch(error => {
              console.log('Error caching:', url, error);
              return Promise.resolve();
            });
          })
        );
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            // Check if valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(error => {
          // If it's a Supabase request and we're offline, return a custom response
          if (event.request.url.includes('supabase')) {
            return new Response(JSON.stringify({ 
              error: 'Offline - data will sync when connection is restored',
              offline: true 
            }), {
              status: 408,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // For other failed requests, try to serve from cache
          return caches.match(event.request);
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync-pending-changes') {
    event.waitUntil(syncPendingChanges());
  }
});

// Push notification handler
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Pa Gerry\'s POS', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'explore') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    event.notification.close();
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler for communication with main app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Function to sync pending changes when online
async function syncPendingChanges() {
  try {
    // Get all pending changes from IndexedDB or localStorage
    const pendingChanges = await getPendingChanges();
    
    if (pendingChanges && pendingChanges.length > 0) {
      // Try to sync each pending change
      for (const change of pendingChanges) {
        try {
          const response = await fetch(change.url, {
            method: change.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${change.token}`
            },
            body: JSON.stringify(change.data)
          });
          
          if (response.ok) {
            // Remove from pending changes after successful sync
            await removePendingChange(change.id);
            console.log('Synced change:', change.id);
          } else {
            console.error('Failed to sync change:', change.id);
          }
        } catch (error) {
          console.error('Error syncing change:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error in syncPendingChanges:', error);
  }
}

// Helper function to get pending changes (implementation depends on your storage)
async function getPendingChanges() {
  // This would typically read from IndexedDB or localStorage
  // For now, return empty array as placeholder
  return [];
}

// Helper function to remove a pending change after successful sync
async function removePendingChange(changeId) {
  // This would typically remove from IndexedDB or localStorage
  // For now, just log as placeholder
  console.log('Removed pending change:', changeId);
}

// Periodic sync for background updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'periodic-sync') {
    event.waitUntil(syncPendingChanges());
  }
});

// Network status handling
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Trigger sync when coming back online
  self.registration.sync.register('background-sync-pending-changes');
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
});

// Cache cleanup on storage pressure
self.addEventListener('storage', event => {
  if (event.isTrusted && event.key === 'storage') {
    // Check if storage is running low and clean up if needed
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const usagePercentage = (estimate.usage / estimate.quota) * 100;
        if (usagePercentage > 80) {
          console.log('Storage usage is high, cleaning up old cache');
          cleanupOldCache();
        }
      });
    }
  }
});

// Function to clean up old cache entries
async function cleanupOldCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // Remove old entries (older than 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const responseDate = new Date(dateHeader).getTime();
          if (responseDate < thirtyDaysAgo) {
            await cache.delete(request);
            console.log('Removed old cache entry:', request);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up cache:', error);
  }
}

// Handle fetch errors with fallback strategies
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(error => {
        console.error('Fetch failed:', error);
        
        // For Supabase requests, return offline response
        if (event.request.url.includes('supabase')) {
          return new Response(JSON.stringify({ 
            error: 'Network error - working offline',
            offline: true,
            timestamp: new Date().toISOString()
          }), {
            status: 0,
            statusText: 'Offline',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // For other requests, try to serve from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // If no cached response, return offline page
            return new Response(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Offline - Pa Gerry's POS</title>
                  <style>
                    body { 
                      font-family: Arial, sans-serif; 
                      display: flex; 
                      justify-content: center; 
                      align-items: center; 
                      height: 100vh; 
                      margin: 0; 
                      background: #f5f5f5;
                    }
                    .offline-container { 
                      text-align: center; 
                      padding: 2rem;
                      background: white;
                      border-radius: 8px;
                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    }
                    .offline-icon { 
                      font-size: 4rem; 
                      color: #e67e22; 
                      margin-bottom: 1rem;
                    }
                    h1 { color: #333; margin-bottom: 1rem; }
                    p { color: #666; margin-bottom: 1.5rem; }
                    .retry-btn {
                      background: #e67e22;
                      color: white;
                      border: none;
                      padding: 0.75rem 1.5rem;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 1rem;
                    }
                    .retry-btn:hover { background: #d35400; }
                  </style>
                </head>
                <body>
                  <div class="offline-container">
                    <div class="offline-icon">📱</div>
                    <h1>You're Offline</h1>
                    <p>Please check your internet connection and try again.</p>
                    <button class="retry-btn" onclick="window.location.reload()">Retry</button>
                  </div>
                </body>
              </html>
            `, {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            });
          });
      })
  );
});