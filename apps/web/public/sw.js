/*
 * PlaySlot service worker — push notifications only.
 *
 * Deliberately does no caching: the app is server-rendered and a stale cache
 * would serve out-of-date court availability, which is the one thing this
 * product must never do.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
      icon: '/icon.svg',
      badge: '/icon.svg',
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
