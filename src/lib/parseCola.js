/**
 * Lee el texto que se copia del cupón de la casa y saca partidos con sus mercados.
 *
 * El formato varía: a veces la fecha va antes del partido, a veces después;
 * la cuota puede aparecer arriba o al final. Se recorre línea a línea
 * acumulando lo que aparece y se cierra un partido al empezar el siguiente.
 */

const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[•·|-]?\s*(\d{1,2}):(\d{2})/
const CUOTA = /^\d+[.,]\d{2}$/
const RUIDO = /^(competitor\s*logo|logo|vs\.?|pago anticipado|crear apuesta|cuotas?:?|\d+\/\d+)$/i

/** Encabezados de mercado que en el cupón vienen solos en su línea. */
const CABECERAS = [
  '1x2', 'total de goles', 'total tiros de esquina', 'tiros de esquina',
  'total de tarjetas', 'tarjetas', 'ambos equipos marcan', 'doble oportunidad',
  'hándicap', 'handicap', 'apuesta sin empate', 'se clasifica',
  'total individual', 'resultado exacto', 'marcador correcto',
  'gana alguna mitad', 'marca en ambos tiempos'
]

const esCabecera = t => CABECERAS.includes(t.toLowerCase().replace(/\s+/g, ' ').trim())

/** Traduce "Total de goles" + "Más de 1.5" al texto que usa la app. */
function nombrarMercado(cabecera, valor) {
  const c = (cabecera || '').toLowerCase()
  const v = (valor || '').trim()
  if (!v) return null

  if (c.includes('esquina')) {
    const n = v.match(/(\d+[.,]\d+|\d+)/)
    if (!n) return null
    const lado = /menos/i.test(v) ? 'Menos' : 'Más'
    return `${lado} de ${n[1].replace(',', '.')} córners`
  }
  if (c.includes('tarjeta')) {
    const n = v.match(/(\d+[.,]\d+|\d+)/)
    if (!n) return null
    const lado = /menos/i.test(v) ? 'Menos' : 'Más'
    return `${lado} de ${n[1].replace(',', '.')} tarjetas`
  }
  if (c.includes('total de goles')) {
    const n = v.match(/(\d+[.,]\d+|\d+)/)
    if (!n) return null
    const lado = /menos/i.test(v) ? 'Menos' : 'Más'
    return `${lado} de ${n[1].replace(',', '.')} goles`
  }
  if (c === '1x2') {
    if (v === '1') return '1X2 - gana el local'
    if (v.toUpperCase() === 'X') return '1X2 - empate'
    if (v === '2') return '1X2 - gana el visitante'
  }
  if (c.includes('doble oportunidad')) {
    if (/1x/i.test(v)) return 'Doble oportunidad - local o empate'
    if (/x2/i.test(v)) return 'Doble oportunidad - visitante o empate'
  }
  if (c.includes('ambos')) return 'Ambos equipos marcan'
  if (c.includes('clasifica')) {
    return v === '1' ? 'Se clasifica el local' : 'Se clasifica el visitante'
  }
  // cualquier otro: se guarda tal cual, ya lo corregirá el usuario
  return `${cabecera}: ${v}`
}

export function parseCola(texto) {
  const lineas = String(texto || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !RUIDO.test(l))

  const partidos = []
  let actual = null
  let fechaSuelta = null
  let horaSuelta = null
  let cabecera = null

  const cerrar = () => {
    if (actual && actual.local && actual.visitante) partidos.push(actual)
    actual = null
    cabecera = null
  }

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]

    // fecha y hora: puede venir antes o después del nombre de los equipos
    const f = l.match(FECHA)
    if (f) {
      const [, d, m, y, hh, mm] = f
      const fecha = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const hora = `${String(hh).padStart(2, '0')}:${mm}`
      if (actual && !actual.fecha_partido) {
        actual.fecha_partido = fecha
        actual.hora = hora
      } else {
        cerrar()
        fechaSuelta = fecha
        horaSuelta = hora
      }
      continue
    }

    if (CUOTA.test(l)) {
      if (actual) actual.cuota = Number(l.replace(',', '.'))
      continue
    }

    if (esCabecera(l)) {
      cabecera = l
      continue
    }

    // valor de un mercado ya abierto
    if (actual && cabecera) {
      const m = nombrarMercado(cabecera, l)
      if (m && !actual.mercados.includes(m)) actual.mercados.push(m)
      cabecera = null
      continue
    }

    // si no es nada de lo anterior, es un nombre de equipo
    if (!actual) {
      actual = {
        local: l, visitante: '', mercados: [],
        fecha_partido: fechaSuelta, hora: horaSuelta, cuota: null
      }
      fechaSuelta = null
      horaSuelta = null
    } else if (!actual.visitante) {
      actual.visitante = l
    } else {
      // empieza otro partido
      cerrar()
      actual = {
        local: l, visitante: '', mercados: [],
        fecha_partido: null, hora: null, cuota: null
      }
    }
  }

  cerrar()
  return partidos
}
