const CACHE_NAME = 'realty-checklist-v2';
const urlsToCache = [
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// Push
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { title: 'Уведомление', body: event.data.text() }; }
  }
  const options = {
    body: data.body || 'Проверьте чек-лист!',
    icon: 'https://via.placeholder.com/192x192/2b6cb0/ffffff?text=🏠',
    badge: 'https://via.placeholder.com/72x72/2b6cb0/ffffff?text=🏠',
    vibrate: [200, 100, 200],
    data: data.url || '/'
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Чек-лист сделки', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
