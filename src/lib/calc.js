// Cálculos puros. Sin estos números el registro no sirve de nada.

export const cuotaTotal = (sel = []) =>
  sel.reduce((a, s) => a * (Number(s.cuota) || 1), 1)

/** Cuota real del boleto: la de la casa si está anotada, si no el producto. */
export function cuotaApuesta(apuesta) {
  const manual = Number(apuesta?.cuota_total)
  return manual > 1 ? manual : cuotaTotal(apuesta?.selecciones || [])
}

/** Una perdida -> perdida. Todas resueltas -> resuelta. Resto -> pendiente. */
export function estado(sel = []) {
  if (!sel.length) return 'pendiente'
  if (sel.some(s => s.estado === 'pendiente' || !s.estado)) return 'pendiente'
  return sel.some(s => multiplicador(s) === 0) ? 'perdida' : 'ganada'
}

/**
 * Lo que aporta cada selección al boleto.
 *   ganada        -> su cuota
 *   perdida       -> 0, tumba el boleto entero
 *   anulada       -> 1, ni suma ni resta
 *   media ganada  -> (cuota+1)/2   media apuesta cobra, media se devuelve
 *   media perdida -> 0.5           media se pierde, media se devuelve
 */
export function multiplicador(s) {
  const c = Number(s.cuota) || 1
  switch (s.estado) {
    case 'ganada':        return c
    case 'perdida':       return 0
    case 'anulada':       return 1
    case 'media_ganada':  return (c + 1) / 2
    case 'media_perdida': return 0.5
    default:              return null
  }
}

export function resultado(apuesta) {
  const sel = apuesta.selecciones || []
  if (estado(sel) === 'pendiente') return 0

  const stake = Number(apuesta.stake) || 0
  const producto = sel.reduce((a, s) => a * multiplicador(s), 1)
  if (producto === 0) return -stake

  // Si anotaste la cuota de la casa, se ajusta al total real del boleto
  const bruto = cuotaTotal(sel)
  const ajuste = Number(apuesta.cuota_total) > 1 && bruto > 0
    ? Number(apuesta.cuota_total) / bruto
    : 1

  return stake * (producto * ajuste - 1)
}

export const probImplicita = cuota => (cuota > 1 ? 1 / cuota : 0)

/** Probabilidad de que se cumpla la combinada entera. */
export const probCombinada = (sel = []) => {
  const t = cuotaTotal(sel)
  return t > 1 ? 1 / t : 0
}

/** Edge absoluto: tu probabilidad menos la implícita. */
export const edge = (miProb, cuota) => miProb - probImplicita(cuota)

/**
 * Kelly fraccionado al 25% con tope del 3% de banca.
 * El cuarto de Kelly existe porque el Kelly completo asume que tu
 * estimación de probabilidad es exacta, y nunca lo es.
 */
export function kelly(miProb, cuota, fraccion = 0.25, tope = 0.03) {
  if (!(cuota > 1) || !(miProb > 0)) return 0
  const e = edge(miProb, cuota)
  if (e <= 0) return 0
  return Math.min((e / (cuota - 1)) * fraccion, tope)
}

export const REGLAS = {
  edgeMin: 0.04,
  edgeMax: 0.15,
  cuotaMin: 1.5,
  cuotaMax: 5.0,
  picksDia: 2
}

/** Aplica los filtros duros. Devuelve {ok, texto}. */
export function filtro(miProb, cuota) {
  if (!(cuota > 1) || !(miProb > 0)) return null
  if (cuota < REGLAS.cuotaMin || cuota > REGLAS.cuotaMax)
    return { ok: false, texto: 'Cuota fuera del rango 1.50–5.00' }
  const e = edge(miProb, cuota)
  if (e < REGLAS.edgeMin)
    return { ok: false, texto: `Edge insuficiente (${(e * 100).toFixed(1)}%, mínimo 4%)` }
  if (e > REGLAS.edgeMax)
    return { ok: false, texto: `Edge del ${(e * 100).toFixed(1)}% — revisa tu análisis, no la cuota` }
  return { ok: true, texto: `Apostable · edge ${(e * 100).toFixed(1)}%` }
}

/** CLV: cuota tomada contra cuota de cierre. */
export const clv = (tomada, cierre) =>
  tomada > 1 && cierre > 1 ? tomada / cierre - 1 : null

export function resumen(apuestas = [], casas = []) {
  const conEstado = apuestas.map(a => ({ ...a, _e: estado(a.selecciones), _r: resultado(a) }))
  const resueltas = conEstado.filter(a => a._e !== 'pendiente')
  const ganadas = resueltas.filter(a => a._r > 0)
  const apostado = resueltas.reduce((s, a) => s + Number(a.stake), 0)
  const neto = conEstado.reduce((s, a) => s + a._r, 0)
  const inicial = casas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)

  const clvs = apuestas
    .flatMap(a => a.selecciones || [])
    .map(s => clv(Number(s.cuota), Number(s.cuota_cierre)))
    .filter(v => v !== null)

  const porTipo = esParlay => {
    const g = resueltas.filter(a => ((a.selecciones || []).length > 1) === esParlay)
    return {
      n: g.length,
      neto: g.reduce((s, a) => s + a._r, 0),
      acierto: g.length ? g.filter(a => a._r > 0).length / g.length : null
    }
  }

  return {
    inicial,
    banca: inicial + neto,
    neto,
    apostado,
    resueltas: resueltas.length,
    pendientes: conEstado.length - resueltas.length,
    acierto: resueltas.length ? ganadas.length / resueltas.length : null,
    yield: apostado ? neto / apostado : null,
    clvMedio: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    clvPositivo: clvs.length ? clvs.filter(v => v > 0).length / clvs.length : null,
    clvN: clvs.length,
    simples: porTipo(false),
    parlays: porTipo(true),
    porCasa: casas.map(c => {
      const n = conEstado.filter(a => a.casa_id === c.id).reduce((s, a) => s + a._r, 0)
      return { ...c, neto: n, saldo: Number(c.saldo_inicial || 0) + n }
    }),
    curva: conEstado
      .filter(a => a._e !== 'pendiente')
      .slice()
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .reduce((acc, a, i) => {
        const prev = i ? acc[i - 1].banca : inicial
        acc.push({ i: i + 1, fecha: a.fecha, banca: prev + a._r })
        return acc
      }, [])
  }
}

/**
 * Diagnóstico honesto. Antes de 100 apuestas no hay nada que concluir,
 * y el CLV manda sobre el dinero ganado.
 */
export function diagnostico(r) {
  if (r.resueltas < 100)
    return `${r.resueltas} de 100 apuestas. Todavía no hay muestra para saber si tienes ventaja — ni para bien ni para mal.`
  if (r.clvMedio === null)
    return 'Sin cuotas de cierre registradas no se puede medir si le ganas al mercado. Apúntalas.'
  if (r.clvMedio > 0 && r.neto > 0) return 'CLV positivo y ganando. El método funciona.'
  if (r.clvMedio > 0) return 'CLV positivo pero perdiendo dinero. Es varianza normal: mantén el método.'
  if (r.neto > 0) return 'Ganando con CLV negativo. Es suerte y va a revertir. Revisa el método.'
  return 'CLV negativo y perdiendo. No hay ventaja demostrada. Toca parar o cambiar de enfoque.'
}
