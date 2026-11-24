/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, addPlugins } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { precacheAssetsPlugin } from './lib/precacheAssetsPlugin'
import { BRAND } from '@/config/brand'

declare let self: ServiceWorkerGlobalScope

// ── Auto-update: activate new SW immediately ────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Versões antigas guardavam respostas autenticadas e imagens privadas.
    await Promise.all(['supabase-api-cache', 'images-cache'].map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

// ── Precache ────────────────────────────────────────────────────────────────
cleanupOutdatedCaches()
addPlugins([precacheAssetsPlugin])
precacheAndRoute(self.__WB_MANIFEST)

// ── Runtime caching ─────────────────────────────────────────────────────────

// Somente imagens estáticas públicas. API, Storage e anexos usam a rede;
// nenhuma resposta privada pode sobreviver à troca de sessão pelo SW.
registerRoute(
  ({ request, url }) => request.destination === 'image'
    && url.origin === self.location.origin && /^\/(?:assets|icons)\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'public-static-images-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// ── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  const options: NotificationOptions & { vibrate: number[]; renotify: boolean } = {
    body: data.body ?? '',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: data.tag ?? 'empire-notification',
    data: {
      url: data.url ?? '/',
    },
    vibrate: [200, 100, 200],
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? BRAND.appName, options)
  )
})

// ── Notification click — open the app ───────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
