import type { MetadataRoute } from 'next';

/**
 * Web app manifest (served at /manifest.webmanifest): what makes PlaySlot
 * installable to a phone's home screen and open without the browser's bars.
 * Bulgarian, like the default locale; "/" lets the locale routing decide.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'PlaySlot — резервирай корт',
    short_name: 'PlaySlot',
    description: 'Свободни кортове и треньори по тенис и падел — резервация за минута.',
    lang: 'bg',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['sports', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press on the home-screen icon.
    shortcuts: [
      { name: 'Моите резервации', url: '/bg/me/bookings', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Намери корт', url: '/bg/search', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Клубове', url: '/bg/clubs', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
