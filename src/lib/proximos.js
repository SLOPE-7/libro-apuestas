/**
 * PRÓXIMOS — qué se te juega y cuándo.
 *
 * Se arma desde las selecciones pendientes de los boletos abiertos. No es
 * "hoy": un cupón se reparte entre varios días, así que cortar en la
 * medianoche enseñaría un trozo y lo haría pasar por el total.
 *
 * A propósito no devuelve importes ni ganancia potencial. Esta es la pantalla
 * que se mira con el partido en curso, y ahí un número en verde empuja a
 * tocar el cash-out por nervios y no por cuentas.
 */

/** Milisegundos que un partido sigue considerándose "en juego". */
const EN_JUEGO = 2.5 * 60 * 60 * 1000

/** Momento de inicio, u null si a la selección le falta el dato. */
export function inicioSeleccion(sel) {
  if (!sel?.fecha_partido || !sel?.hora) return null
  const [h, m] = String(sel.hora).split(':').map(Number)
  if (!Number.isFinite(h)) return null
  const d = new Date(`${sel.fecha_partido}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0)
  return d.getTime()
}

/**
 * Agrupa por día y hora las selecciones que aún no se han resuelto.
 * Devuelve [{ dia, etiqueta, horas: [{ hora, enJuego, items: [...] }] }]
 */
export function proximos(apuestas = [], ahora = Date.now()) {
  const sueltas = []

  for (const a of apuestas) {
    // un boleto cerrado por cash-out ya no depende de lo que pase en la cancha
    if (a.cash_out != null) continue

    for (const s of a.selecciones || []) {
      if (resueltaSel(s)) continue
      const ini = inicioSeleccion(s)
      if (ini == null) continue
      if (ini + EN_JUEGO < ahora) continue          // ya terminó

      sueltas.push({
        apuestaId: a.id,
        selId: s.id,
        partido: s.partido,
        mercado: s.mercado || '',
        inicio: ini,
        dia: s.fecha_partido,
        hora: String(s.hora).slice(0, 5),
        enJuego: ini <= ahora
      })
    }
  }

  sueltas.sort((x, y) => x.inicio - y.inicio || x.partido.localeCompare(y.partido))

  const dias = []
  for (const it of sueltas) {
    let d = dias.find(x => x.dia === it.dia)
    if (!d) { d = { dia: it.dia, etiqueta: etiquetaDia(it.dia, ahora), horas: [] }; dias.push(d) }
    let h = d.horas.find(x => x.hora === it.hora)
    if (!h) { h = { hora: it.hora, enJuego: false, items: [] }; d.horas.push(h) }
    if (it.enJuego) h.enJuego = true
    h.items.push(it)
  }
  return dias
}

/** Una selección cuenta como resuelta si su estado, o el de todos sus
 *  mercados en un BetBuilder, ya no es 'pendiente'. */
function resueltaSel(s) {
  const ms = Array.isArray(s?.mercados) ? s.mercados : null
  if (ms && ms.length > 1) return ms.every(m => (m.e || 'pendiente') !== 'pendiente')
  return (s?.estado || 'pendiente') !== 'pendiente'
}

function etiquetaDia(iso, ahora) {
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0)
  const d = new Date(`${iso}T00:00:00`)
  const dif = Math.round((d - hoy) / 86400000)
  if (dif === 0) return 'Hoy'
  if (dif === 1) return 'Mañana'
  if (dif === -1) return 'Ayer'
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Texto corto para la franja: "en 40 min", "en 3 h", "en juego". */
export function cuandoEmpieza(ms, ahora = Date.now()) {
  const falta = ms - ahora
  if (falta <= 0) return 'en juego'
  const min = Math.round(falta / 60000)
  if (min < 60) return `en ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `en ${h} h`
  return `en ${Math.round(h / 24)} d`
}
