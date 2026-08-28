/**
 * Avisos de partidos que empiezan.
 *
 * LÍMITE IMPORTANTE: sin un servidor detrás, el aviso solo salta si la app
 * sigue viva en memoria. Si la cierras del todo desde el multitarea, no llega.
 * Por eso el aviso al abrir la app sigue siendo la red de seguridad.
 */

export const permisoAvisos = () =>
  typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission

export async function pedirPermiso() {
  if (typeof Notification === 'undefined') return 'no-soportado'
  if (Notification.permission === 'granted') return 'granted'
  return await Notification.requestPermission()
}

const programados = new Map()

/** Programa un aviso para una hora concreta del día. */
export function programar(id, texto, fechaISO, hora) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (!fechaISO || !hora) return

  const [h, m] = String(hora).split(':').map(Number)
  if (Number.isNaN(h)) return

  const cuando = new Date(`${fechaISO}T00:00:00`)
  cuando.setHours(h, m || 0, 0, 0)

  const espera = cuando.getTime() - Date.now()
  if (espera <= 0 || espera > 12 * 60 * 60 * 1000) return   // ni pasado ni más de 12h

  cancelar(id)
  const t = setTimeout(() => {
    try {
      new Notification('Empieza el partido', { body: texto, tag: id })
    } catch { /* el navegador puede bloquearlo */ }
    programados.delete(id)
  }, espera)
  programados.set(id, t)
}

export function cancelar(id) {
  const t = programados.get(id)
  if (t) { clearTimeout(t); programados.delete(id) }
}

export const cuantosProgramados = () => programados.size
