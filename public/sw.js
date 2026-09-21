/* ---------------------------------------------------------------------
   SERVICE WORKER de KAL · va en public/sw.js

   Es lo único que corre con la app cerrada. Recibe el aviso que manda
   la función de Supabase y lo enseña. Al tocarlo, abre la app en
   Resumen, donde está la franja de Próximos.
   --------------------------------------------------------------------- */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { cuerpo: event.data?.text() } }

  event.waitUntil(self.registration.showNotification(d.titulo || 'KAL', {
    body: d.cuerpo || '',
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    // misma etiqueta = reemplaza al anterior en vez de apilarse
    tag: d.etiqueta || 'kal',
    data: { url: d.url || '/' }
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if ('focus' in c) { await c.focus(); return }
    }
    await self.clients.openWindow(url)
  })())
})
