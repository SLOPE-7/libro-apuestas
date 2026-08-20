/**
 * Lee el texto de un cupón copiado de la casa y lo convierte en selecciones.
 *
 * Copiar desde el móvil rompe las tablas de formas distintas según la casa:
 *   · las cuotas quedan amontonadas al final
 *   · un valor se parte en dos líneas ("Cuotas:" + ".13")
 *   · el mercado se corta ("Total de goles: Más de" + "1.75")
 * Aquí se contemplan esos casos. Lo que no se entiende se deja vacío:
 * más vale un hueco visible que un número inventado.
 */

const num = t => {
  if (t === null || t === undefined) return null
  const s = String(t).trim().replace(/\s/g, '')
  if (!s) return null
  const v = parseFloat(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s)
  return Number.isFinite(v) ? v : null
}
const redondea = v => (v == null ? null : Math.round(v * 100) / 100)

const ES_PARTIDO   = /\s+vs\.?\s+/i
const SOLO_NUMERO  = /^[\d]+[.,]?\d*$|^[.,]\d+$/
const FECHA        = /\d{1,2}\/\d{1,2}\s*[•·]?\s*\d{1,2}:\d{2}/
const PREFIJO_LIGA = /^.*?\d{1,2}\/\d{1,2}\s*[•·]?\s*\d{1,2}:\d{2}\s*/
const RUIDO        = /^(cliente|id de la apuesta|nombre de afiliado|ib|tipo de apuesta|coupon|múltiple|multiple|copia|barcode|fecha|ganancia\s+total|total\s+a\s+ganar)\b/i
const NUMERO_LARGO = /^\(?\d{6,}\)?$/
// mercado cortado: "…Más de", "…Menos de", "…total:"
const COLGANDO     = /(más de|menos de|over|under|total|handicap|hándicap|:)\s*$/i

function partirMercado(texto) {
  const t = texto.replace(/^BetBuilder\s*:\s*/i, '')
                 .replace(/[•·]\s*pago anticipado/i, '')
                 .trim()
  const i = t.indexOf(':')
  if (i === -1) return { tipo: 'Otro', seleccion: t }
  return { tipo: t.slice(0, i).trim(), seleccion: t.slice(i + 1).trim() }
}
const partirMercados = texto =>
  texto.split('|').map(p => p.trim()).filter(Boolean).map(partirMercado)

/** Une "Cuotas:" con el valor que quedó en la línea siguiente. */
function unirCuotasPartidas(lineas) {
  const out = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const m = l.match(/^(Cuotas?\s*:)\s*([\d.,]*)$/i)
    if (m) {
      let val = m[2].trim()
      const sig = (lineas[i + 1] || '').trim()
      if ((!val || /[.,]$/.test(val)) && SOLO_NUMERO.test(sig)) {
        val = val.replace(/[.,]$/, '') + (sig.startsWith('.') || sig.startsWith(',') ? sig : (val ? '.' + sig : sig))
        i++
      }
      out.push(`${m[1]} ${val}`)
      continue
    }
    out.push(l)
  }
  return out
}

export function parseCupon(texto = '') {
  let lineas = texto.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  lineas = unirCuotasPartidas(lineas)

  const legs = []
  const cuotasSueltas = []
  let actual = null, stakePie = null, totalPie = null
  const cerrar = () => {
    if (actual) {
      if (actual._buf.length && !actual.mercados.length)
        actual.mercados = partirMercados(actual._buf.join(' ').trim())
      legs.push(actual); actual = null
    }
  }

  for (const linea of lineas) {
    if (/^VALOR\s+APOSTADO/i.test(linea)) {
      const m = linea.match(/([\d]+[.,]\d+|\d+)\s*$/); if (m) stakePie = num(m[1])
      cerrar(); continue
    }
    if (/^CUOTAS\s*:/.test(linea)) {              // mayúsculas: total del boleto
      const m = linea.match(/([\d]+[.,]\d+|\d+)\s*$/); if (m) totalPie = num(m[1])
      cerrar(); continue
    }
    const soloCuota = linea.match(/^Cuotas?\s*:\s*([\d.,]*)$/i)
    if (soloCuota) {                               // minúsculas: cuota de una pata
      const v = num(soloCuota[1])
      if (actual && actual.cuota == null) actual.cuota = (v != null && v > 1) ? v : null
      else cuotasSueltas.push((v != null && v > 1) ? v : null)
      continue
    }

    if (RUIDO.test(linea) || NUMERO_LARGO.test(linea)) { cerrar(); continue }

    // "L 10.00" suelto = monto ; número suelto tras el monto = cuota total
    const conL = linea.match(/^L\s*([\d.,]+)$/i)
    if (conL) { stakePie = stakePie ?? num(conL[1]); cerrar(); continue }

    if (ES_PARTIDO.test(linea)) {
      cerrar()
      const tabla = linea.match(/^(.+?vs\.?\s+[^\t|]+?)[\t|]+(.+?)[\t|]+([\d.,]+)\s*$/i)
      if (tabla) {
        const [loc, vis] = tabla[1].replace(PREFIJO_LIGA, '').split(ES_PARTIDO)
        legs.push({
          local: (loc || '').trim(), visitante: (vis || '').trim(),
          mercados: partirMercados(tabla[2]), cuota: num(tabla[3]), _buf: []
        })
        continue
      }
      const [loc, vis] = linea.replace(PREFIJO_LIGA, '').split(ES_PARTIDO)
      actual = {
        local: (loc || '').trim(),
        visitante: (vis || '').replace(/\s*Cuotas?:.*$/i, '').trim(),
        mercados: [], cuota: null, _buf: []
      }
      continue
    }

    // cabecera de liga: no aporta nada y anuncia la siguiente selección
    if (FECHA.test(linea)) { cerrar(); continue }

    if (!actual) {
      // número suelto antes de cualquier partido: probablemente la cuota total
      if (SOLO_NUMERO.test(linea)) { const v = num(linea); if (v != null && v > 1) totalPie = totalPie ?? v }
      continue
    }

    // número suelto dentro de una selección
    if (SOLO_NUMERO.test(linea)) {
      const v = num(linea)
      const colgado = actual._buf.length && COLGANDO.test(actual._buf[actual._buf.length - 1])
      if (colgado) { actual._buf[actual._buf.length - 1] += ' ' + linea; continue }
      if (actual._buf.length && !actual.mercados.length) {
        actual.mercados = partirMercados(actual._buf.join(' ').trim()); actual._buf = []
      }
      if (actual.cuota == null && v != null && v > 1) actual.cuota = v
      continue
    }

    // "Total de goles: Más de 2   Cuotas: 1.30"
    const conCuota = linea.match(/^(.*?)\s*Cuotas?\s*:\s*([\d.,]+)\s*$/i)
    if (conCuota) {
      actual._buf.push(conCuota[1])
      actual.cuota = num(conCuota[2])
      actual.mercados = partirMercados(actual._buf.join(' ').trim())
      actual._buf = []
      continue
    }

    actual._buf.push(linea)
  }
  cerrar()

  // cuotas que llegaron amontonadas al final, por orden
  if (cuotasSueltas.length) {
    let k = 0
    legs.forEach(l => { if (l.cuota == null && k < cuotasSueltas.length) l.cuota = cuotasSueltas[k++] })
  }

  const limpias = legs
    .filter(l => l.local || l.visitante)
    .map(({ _buf, ...l }) => ({
      ...l,
      mercados: l.mercados.length ? l.mercados : [{ tipo: 'Otro', seleccion: '' }]
    }))

  // Si falta exactamente una cuota y sabemos el total, se despeja. No es adivinar:
  // total = producto de todas, así que la que falta queda determinada.
  const faltan = limpias.filter(l => l.cuota == null)
  if (faltan.length === 1 && totalPie > 1) {
    const producto = limpias.reduce((a, l) => a * (l.cuota ?? 1), 1)
    const x = redondea(totalPie / producto)
    if (x > 1) { faltan[0].cuota = x; faltan[0].deducida = true }
  }

  return { stake: stakePie, total: totalPie, legs: limpias }
}
