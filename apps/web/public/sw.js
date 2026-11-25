/*
 * PlaySlot service worker — push notifications, and one offline page.
 *
 * Deliberately caches no pages and no data: the app is server-rendered and a
 * stale cache would serve out-of-date court availability, which is the one
 * thing this product must never do. The only thing kept is a small static
 * "no connection" page, shown when a page cannot be loaded at all — so the
 * installed app never opens on the browser's own error screen.
 */

const OFFLINE_CACHE = 'playslot-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      // `reload`: always the copy on the server, never the HTTP cache's.
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Page loads only: straight to the network, the offline page if that fails.
// Everything else (API calls, scripts, images) is left to the browser untouched.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached ?? Response.error();
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PlaySlot', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'PlaySlot', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  // Focus an already-open PlaySlot tab rather than piling up new ones.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
