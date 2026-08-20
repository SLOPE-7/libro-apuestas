/**
 * Lee el texto de un cupón copiado de la casa y lo convierte en selecciones.
 *
 * Reconoce los dos formatos habituales:
 *   a) bloques      -> "Celtic FC vs. LASK" / "Apuesta sin empate: 1   Cuotas: 1.25"
 *   b) tabla        -> "Celtic FC vs. LASK   Apuesta sin empate : 1   1.25"
 *
 * Nunca adivina: lo que no entiende lo deja vacío para que se corrija a mano.
 */

const num = t => {
  if (!t) return null
  const s = String(t).trim().replace(/\s/g, '')
  // "1,25" europeo -> 1.25 ; "1.25" se queda igual
  const v = parseFloat(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s)
  return Number.isFinite(v) ? v : null
}

const ES_PARTIDO = /\s+vs\.?\s+/i
// líneas de contexto que no aportan: "Europa, UEFA Liga Campeones 19/08 • 13:00"
const ES_CABECERA = /\d{1,2}\/\d{1,2}\s*[•·]/
const ES_RUIDO = /^(cliente|id de la apuesta|nombre de afiliado|ib|fecha|tipo de apuesta|coupon|múltiple|multiple|copia|barcode|\d{6,})/i
// a partir de aquí empieza el pie del cupón: ya no hay selecciones
const ES_PIE = /^(valor\s+apostado|cuotas?\s*:?\s*[\d.,]+\s*$|ganancia\s+total|total\s+a\s+ganar)/i

/** "Apuesta sin empate: 1" -> {tipo, seleccion} */
function partirMercado(texto) {
  const t = texto.replace(/^BetBuilder\s*:\s*/i, '').trim()
  const i = t.indexOf(':')
  if (i === -1) return { tipo: 'Otro', seleccion: t }
  return {
    tipo: t.slice(0, i).trim(),
    seleccion: t.slice(i + 1).replace(/[•·]\s*pago anticipado/i, '').trim()
  }
}

/** Un texto de mercado puede traer varios separados por "|" */
const partirMercados = texto =>
  texto.split('|').map(p => p.trim()).filter(Boolean).map(partirMercado)

export function parseCupon(texto = '') {
  const lineas = texto.replace(/\r/g, '').split('\n')
    .map(l => l.trim()).filter(Boolean)

  const stake = num((texto.match(/VALOR\s+APOSTADO[^\d]*([\d.,]+)/i) || [])[1])
  const total = num((texto.match(/^\s*CUOTAS?\s*:?\s*([\d.,]+)\s*$/im) || [])[1])

  const legs = []
  let actual = null
  const cerrar = () => { if (actual) { legs.push(actual); actual = null } }

  for (const linea of lineas) {
    if (ES_PIE.test(linea)) break
    if (ES_RUIDO.test(linea) || ES_CABECERA.test(linea)) continue

    if (ES_PARTIDO.test(linea)) {
      // ¿formato tabla? el partido, el mercado y la cuota van en la misma línea
      const tabla = linea.match(/^(.+?vs\.?\s+[^\t|]+?)[\t|]+(.+?)[\t|]+([\d.,]+)\s*$/i)
      if (tabla) {
        cerrar()
        const [local, visitante] = tabla[1].split(ES_PARTIDO)
        legs.push({
          local: (local || '').trim(),
          visitante: (visitante || '').trim(),
          mercados: partirMercados(tabla[2]),
          cuota: num(tabla[3])
        })
        continue
      }
      cerrar()
      const [local, visitante] = linea.split(ES_PARTIDO)
      actual = {
        local: (local || '').trim(),
        visitante: (visitante || '').replace(/\s*Cuotas?:.*$/i, '').trim(),
        mercados: [],
        cuota: null,
        _buffer: []
      }
      continue
    }

    if (!actual) continue

    // "Total de goles: Más de 2      Cuotas: 1.30"
    const conCuota = linea.match(/^(.*?)\s*Cuotas?\s*:\s*([\d.,]+)\s*$/i)
    if (conCuota) {
      actual._buffer.push(conCuota[1])
      actual.cuota = num(conCuota[2])
      actual.mercados = partirMercados(actual._buffer.join(' ').trim())
      actual._buffer = []
      continue
    }

    // línea suelta que sigue describiendo el mercado (BetBuilder multilínea)
    actual._buffer.push(linea)
  }
  cerrar()

  return {
    stake,
    total,
    legs: legs.map(l => {
      const { _buffer, ...resto } = l
      return {
        ...resto,
        mercados: resto.mercados.length ? resto.mercados : [{ tipo: 'Otro', seleccion: '' }]
      }
    }).filter(l => l.local || l.visitante)
  }
}
