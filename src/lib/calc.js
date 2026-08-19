// Cálculos puros. Sin estos números el registro no sirve de nada.

export const cuotaTotal = (sel = []) =>
  sel.reduce((a, s) => a * (Number(s.cuota) || 1), 1)

/** Una perdida -> perdida. Todas ganadas -> ganada. Resto -> pendiente. */
export function estado(sel = []) {
  if (!sel.length) return 'pendiente'
  if (sel.some(s => s.estado === 'perdida')) return 'perdida'
  if (sel.every(s => s.estado === 'ganada')) return 'ganada'
  return 'pendiente'
}

export function resultado(apuesta) {
  const e = estado(apuesta.selecciones)
  const stake = Number(apuesta.stake) || 0
  if (e === 'ganada') return stake * (cuotaTotal(apuesta.selecciones) - 1)
  if (e === 'perdida') return -stake
  return 0
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
  if (!(cuota > 1) || !(miProb > 0)) return { ok: false, texto: '' }
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
  const ganadas = resueltas.filter(a => a._e === 'ganada')
  const apostado = resueltas.reduce((s, a) => s + Number(a.stake), 0)
  const neto = conEstado.reduce((s, a) => s + a._r, 0)
  const inicial = casas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)

  const clvs = apuestas
    .flatMap(a => a.selecciones || [])
    .map(s => clv(Number(s.cuota), Number(s.cuota_cierre)))
    .filter(v => v !== null)

  const porTipo = esParlay => {
    const g = resueltas.filter(a => (a.selecciones.length > 1) === esParlay)
    return {
      n: g.length,
      neto: g.reduce((s, a) => s + a._r, 0),
      acierto: g.length ? g.filter(a => a._e === 'ganada').length / g.length : null
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
