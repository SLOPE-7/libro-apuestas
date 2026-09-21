import { supabase } from './supabase'

/* ---------------------------------------------------------------------
   AVISOS AL TELÉFONO · va en src/lib/push.js

   Registra el service worker, pide permiso y guarda este teléfono en la
   tabla de suscripciones. El permiso tiene que pedirse desde un toque
   del usuario: iOS lo rechaza si se pide solo al abrir la app.
   --------------------------------------------------------------------- */

const LLAVE = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** La llave VAPID viene en base64 url; el navegador la quiere en bytes. */
function aBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** En iPhone solo funciona con la app instalada en la pantalla de inicio. */
export function instalada() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
         window.navigator.standalone === true
}

export function soportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Estado actual, para que la pantalla diga exactamente qué falta:
 * 'sin-soporte' · 'sin-instalar' · 'sin-llave' · 'bloqueado' · 'activo' · 'inactivo'
 */
export async function estadoAvisos() {
  if (!soportado()) return instalada() ? 'sin-soporte' : 'sin-instalar'
  if (!LLAVE) return 'sin-llave'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo'
}

export async function activarAvisos() {
  if (!soportado()) throw new Error(instalada()
    ? 'Este navegador no admite avisos.'
    : 'Primero instala la app: en Safari, Compartir → Añadir a pantalla de inicio.')
  if (!LLAVE) throw new Error('Falta la variable VITE_VAPID_PUBLIC_KEY en Vercel.')

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para los avisos.')

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription() ||
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE) })

  const j = sub.toJSON()
  const { error } = await supabase.from('suscripciones').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: 'endpoint' })
  if (error) throw new Error('No se pudo guardar el teléfono: ' + error.message)
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('suscripciones').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Manda un aviso de prueba a este usuario, para comprobar que llega. */
export async function probarAviso() {
  const { data } = await supabase.functions.invoke('avisar-partidos', { body: { prueba: true } })
  return data?.enviados ?? 0
}
