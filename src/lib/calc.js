// Cálculos puros. Sin estos números el registro no sirve de nada.

export const cuotaTotal = (sel = []) =>
  sel.reduce((a, s) => a * (Number(s.cuota) || 1), 1)

/** Cuota real del boleto: la de la casa si está anotada, si no el producto. */
export function cuotaApuesta(apuesta) {
  const manual = Number(apuesta?.cuota_total)
  return manual > 1 ? manual : cuotaTotal(apuesta?.selecciones || [])
}

/**
 * Patas reales del boleto.
 * Una selección BetBuilder con varios mercados son varias patas, aunque
 * viaje en una sola fila. Sin esto un BetBuilder de tres mercados se
 * contaba como simple y ensuciaba el desglose simples/combinadas.
 */
export function patasApuesta(apuesta) {
  return (apuesta?.selecciones || []).reduce((n, s) => {
    const subs = Array.isArray(s?.mercados) ? s.mercados : null
    return n + (subs && subs.length > 1 ? subs.length : 1)
  }, 0)
}

/** ¿Es combinada? Cuenta patas, no filas. */
export const esCombinada = apuesta => patasApuesta(apuesta) > 1

/**
 * Estado del boleto entero.
 *   cerrada   -> se cobró antes de tiempo (cash out)
 *   perdida   -> alguna selección falló
 *   anulada   -> todas se anularon: no ganaste ni perdiste, no es muestra
 *   ganada    -> todas resueltas y ninguna falló
 *   pendiente -> queda algo por decidir
 */
export function estadoApuesta(a) {
  if (a && a.cash_out !== null && a.cash_out !== undefined && a.cash_out !== '') return 'cerrada'
  /* Dado por perdido a mano: una pata cayó y el resto ya no decide nada.
     Manda sobre las selecciones, que pueden seguir pendientes para siempre. */
  if (a?.perdida_manual) return 'perdida'
  return estado(a?.selecciones || [])
}

/** Una perdida -> perdida. Todas anuladas -> anulada. Todas resueltas -> ganada. */
export function estado(sel = []) {
  if (!sel.length) return 'pendiente'
  // una sola fallada tumba el boleto, aunque el resto siga en juego
  if (sel.some(s => multiplicador(s) === 0)) return 'perdida'
  if (sel.some(s => estadoSeleccion(s) === 'pendiente')) return 'pendiente'
  // el boleto entero se cayó por anulación: la casa devuelve y aquí no pasó nada
  if (sel.every(s => estadoSeleccion(s) === 'anulada')) return 'anulada'
  return 'ganada'
}

/**
 * Estado de una selección.
 * Si es un BetBuilder con varios mercados, se deduce de ellos:
 * basta uno fallado para tumbar la selección entera.
 */
export function estadoSeleccion(s) {
  const subs = Array.isArray(s?.mercados) ? s.mercados : null
  if (!subs || subs.length < 2) return s?.estado || 'pendiente'
  if (subs.some(m => m.e === 'perdida')) return 'perdida'
  if (subs.some(m => !m.e || m.e === 'pendiente')) return 'pendiente'
  if (subs.every(m => m.e === 'anulada')) return 'anulada'
  return 'ganada'
}

/** ¿Se anuló alguna parte? La casa recalcula la cuota y hay que corregirla a mano. */
export const tieneAnuladaParcial = s => {
  const subs = Array.isArray(s?.mercados) ? s.mercados : null
  return !!(subs && subs.length > 1 &&
            subs.some(m => m.e === 'anulada') && subs.some(m => m.e === 'ganada'))
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
  switch (estadoSeleccion(s)) {
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
  const stake = Number(apuesta.stake) || 0

  // cierre anticipado: manda lo que devolvió la casa
  if (apuesta.cash_out !== null && apuesta.cash_out !== undefined && apuesta.cash_out !== '')
    return Number(apuesta.cash_out) - stake

  // dado por perdido entero: se pierde el stake y no se mira nada más
  if (apuesta.perdida_manual) return -stake

  const e = estado(sel)
  if (e === 'pendiente') return 0
  // boleto anulado entero: te devuelven el stake, resultado exactamente cero.
  // Se corta aquí para que un cuota_total anotado a mano no invente un resultado.
  if (e === 'anulada') return 0

  const producto = sel.reduce((a, s) => a * multiplicador(s), 1)
  if (producto === 0) return -stake

  // si anotaste la cuota de la casa, se ajusta al total real del boleto
  const bruto = cuotaTotal(sel)
  const ajuste = Number(apuesta.cuota_total) > 1 && bruto > 0
    ? Number(apuesta.cuota_total) / bruto
    : 1

  return stake * (producto * ajuste - 1)
}

/**
 * Valor razonable de un cierre anticipado.
 * Si las patas que faltan estuvieran a precio justo, la apuesta vale hoy
 * lo apostado multiplicado por las cuotas ya acertadas. La casa siempre
 * ofrecerá algo menos: ahí está su margen.
 */
export function valorCierre(apuesta) {
  const stake = Number(apuesta.stake) || 0
  const sel = apuesta.selecciones || []
  const hechas = sel.filter(s => estadoSeleccion(s) !== 'pendiente')
  if (!hechas.length) return stake
  if (hechas.some(s => multiplicador(s) === 0)) return 0
  const gana = hechas.reduce((a, s) => a * multiplicador(s), 1)
  return Math.round(stake * gana * 100) / 100
}

export const probImplicita = cuota => (cuota > 1 ? 1 / cuota : 0)

/**
 * Probabilidad que la casa le está poniendo a la combinada entera.
 * OJO: lleva el margen dentro, así que está inflada, y en una combinada
 * el margen se multiplica pata por pata. Es el techo, no la probabilidad real.
 */
export const probCombinada = (sel = []) => {
  const t = cuotaTotal(sel)
  return t > 1 ? 1 / t : 0
}

/**
 * Margen acumulado aproximado de una combinada.
 * Si cada pata lleva un margen medio (por defecto 5%), la probabilidad
 * honesta es la implícita descontando ese margen tantas veces como patas.
 */
export function probCombinadaAjustada(sel = [], margenPorPata = 0.05) {
  const p = probCombinada(sel)
  if (!p) return 0
  const n = sel.length || 1
  return p * Math.pow(1 - margenPorPata, n)
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
  picksDia: 2,
  /* Combinadas. Existen aparte porque el riesgo no es el mismo:
     el margen se acumula y la varianza se dispara. */
  patasMax: 4,
  margenPorPata: 0.05,
  topeParlay: 0.01
}

/** Aplica los filtros duros. Devuelve {ok, texto}. */
export function filtro(miProb, cuota) {
  if (!(cuota > 1) || !(miProb > 0)) return null
  if (cuota < REGLAS.cuotaMin || cuota > REGLAS.cuotaMax)
    return { ok: false, texto: `Cuota fuera del rango ${REGLAS.cuotaMin.toFixed(2)}–${REGLAS.cuotaMax.toFixed(2)}` }
  const e = edge(miProb, cuota)
  if (e < REGLAS.edgeMin)
    return { ok: false, texto: `Edge insuficiente (${(e * 100).toFixed(1)}%, mínimo ${(REGLAS.edgeMin * 100).toFixed(0)}%)` }
  if (e > REGLAS.edgeMax)
    return { ok: false, texto: `Edge del ${(e * 100).toFixed(1)}% — revisa tu análisis, no la cuota` }
  return { ok: true, texto: `Apostable · edge ${(e * 100).toFixed(1)}%` }
}

/**
 * Evalúa una combinada entera antes de guardarla.
 *
 * Existe porque el filtro de simples no servía aquí: se apagaba solo en
 * cuanto había más de una pata, que es justo donde el margen se acumula.
 *
 * legs: [{ cuota, mi_prob (0-100), mercados: [...] }]
 * totalManual: la cuota del cupón, si la anotaste. Manda sobre el producto.
 *
 * Sobre el margen: cada cuota que pone la casa ya trae su comisión dentro,
 * así que 1/cuota exagera la probabilidad real. En una combinada ese error
 * se multiplica: con margenPorPata al 5% y cinco patas, estás pagando
 * alrededor de un 23% antes de que ruede el balón.
 */
export function evaluarCombinada(legs = [], totalManual = null) {
  const validas = legs
    .map((l, _idx) => ({ ...l, _idx }))
    .filter(l => Number(l.cuota) > 1)
  const n = validas.length
  if (!n) return null

  const producto = validas.reduce((a, l) => a * Number(l.cuota), 1)
  const total = Number(totalManual) > 1 ? Number(totalManual) : producto
  const probCasa = total > 1 ? 1 / total : 0

  // cuántos mercados hay en total, contando los BetBuilder de un mismo partido
  const patas = validas.reduce(
    (a, l) => a + Math.max(1, (l.mercados || []).length), 0)

  const resto = Math.pow(1 - REGLAS.margenPorPata, n)
  const probHonesta = probCasa * resto
  const margen = 1 - resto

  // solo se puede juzgar si estimaste TODAS las patas
  const conProb = validas.filter(l => Number(l.mi_prob) > 0)
  const completa = conProb.length === n
  const probMia = completa
    ? validas.reduce((a, l) => a * (Number(l.mi_prob) / 100), 1)
    : null

  const edgeTotal = probMia === null ? null : probMia - probCasa
  const stakeKelly = probMia === null
    ? 0
    : kelly(probMia, total, 0.25, REGLAS.topeParlay)

  // patas que no aguantarían solas
  const flojas = validas
    .map(l => ({ idx: l._idx, f: filtro(Number(l.mi_prob) / 100, Number(l.cuota)) }))
    .filter(x => x.f && !x.f.ok)

  const motivos = []
  if (patas > REGLAS.patasMax)
    motivos.push(`${patas} mercados, el tope son ${REGLAS.patasMax}`)
  if (edgeTotal !== null && edgeTotal < REGLAS.edgeMin)
    motivos.push(`edge del ${(edgeTotal * 100).toFixed(1)}%, mínimo ${(REGLAS.edgeMin * 100).toFixed(0)}%`)
  if (flojas.length)
    motivos.push(`${flojas.length} ${flojas.length === 1 ? 'pata no aguanta sola' : 'patas no aguantan solas'}`)

  return {
    n, patas, total, producto,
    probCasa, probHonesta, margen,
    probMia, edgeTotal, completa,
    kelly: stakeKelly,
    flojas: flojas.map(x => x.idx),
    motivos,
    ok: motivos.length === 0,
    /* juzgable = hay elementos para decidir. Sin probabilidades estimadas
       solo se puede opinar del número de patas, no del precio. */
    juzgable: completa || patas > REGLAS.patasMax
  }
}

/** CLV: cuota tomada contra cuota de cierre. */
export const clv = (tomada, cierre) =>
  tomada > 1 && cierre > 1 ? tomada / cierre - 1 : null

/** Fecha con la que ordenar la curva: la de resolución si existe, si no la de registro. */
const fechaOrden = a => a.fecha_resuelta || a.fecha || ''

export function resumen(apuestas = [], casas = [], movimientos = []) {
  const conEstado = apuestas.map(a => ({ ...a, _e: estadoApuesta(a), _r: resultado(a) }))

  // Las anuladas no son muestra: no ganaste ni perdiste. Fuera de acierto y de turnover.
  const anuladas  = conEstado.filter(a => a._e === 'anulada')
  const resueltas = conEstado.filter(a => a._e !== 'pendiente' && a._e !== 'anulada')
  const ganadas   = resueltas.filter(a => a._r > 0)

  const apostado = resueltas.reduce((s, a) => s + Number(a.stake), 0)
  const neto = conEstado.reduce((s, a) => s + a._r, 0)
  const inicial = casas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)

  // depósitos suman, retiros restan
  const movNeto = movimientos.reduce(
    (s, m) => s + (m.tipo === 'deposito' ? 1 : -1) * Number(m.monto || 0), 0)
  const depositado = movimientos
    .filter(m => m.tipo === 'deposito').reduce((s, m) => s + Number(m.monto), 0)
  const retirado = movimientos
    .filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto), 0)

  const clvs = apuestas
    .flatMap(a => a.selecciones || [])
    .map(s => clv(Number(s.cuota), Number(s.cuota_cierre)))
    .filter(v => v !== null)

  // se clasifica por patas reales, no por número de filas
  const porTipo = combinada => {
    const g = resueltas.filter(a => esCombinada(a) === combinada)
    return {
      n: g.length,
      neto: g.reduce((s, a) => s + a._r, 0),
      acierto: g.length ? g.filter(a => a._r > 0).length / g.length : null,
      apostado: g.reduce((s, a) => s + Number(a.stake), 0)
    }
  }

  /**
   * Curva de banca. Mete depósitos y retiros en su fecha, para que el último
   * punto coincida siempre con la banca de arriba. Antes solo acumulaba
   * resultados y la gráfica se desincronizaba en cuanto movías dinero.
   */
  const eventos = [
    ...conEstado
      .filter(a => a._e !== 'pendiente')
      .map(a => ({ fecha: fechaOrden(a), orden: 1, delta: a._r, tipo: 'apuesta' })),
    ...movimientos.map(m => ({
      fecha: m.fecha || '',
      orden: 0,
      delta: (m.tipo === 'deposito' ? 1 : -1) * Number(m.monto || 0),
      tipo: m.tipo
    }))
  ].sort((a, b) =>
    a.fecha === b.fecha ? a.orden - b.orden : (a.fecha < b.fecha ? -1 : 1))

  let nApuesta = 0
  const curva = eventos.reduce((acc, ev, i) => {
    const prev = i ? acc[i - 1].banca : inicial
    if (ev.tipo === 'apuesta') nApuesta += 1
    acc.push({
      i: i + 1,
      fecha: ev.fecha,
      banca: prev + ev.delta,
      etiqueta: ev.tipo === 'apuesta'
        ? `Apuesta ${nApuesta}`
        : ev.tipo === 'deposito' ? 'Depósito' : 'Retiro'
    })
    return acc
  }, [])

  return {
    inicial,
    banca: inicial + movNeto + neto,
    neto,
    depositado,
    retirado,
    apostado,
    resueltas: resueltas.length,
    anuladas: anuladas.length,
    pendientes: conEstado.filter(a => a._e === 'pendiente').length,
    acierto: resueltas.length ? ganadas.length / resueltas.length : null,
    yield: apostado ? neto / apostado : null,
    clvMedio: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    clvPositivo: clvs.length ? clvs.filter(v => v > 0).length / clvs.length : null,
    clvN: clvs.length,
    // margen de error del yield: con pocas apuestas la cifra sola engaña
    rango: rangoYield(apuestas),
    simples: porTipo(false),
    parlays: porTipo(true),
    porCasa: casas.map(c => {
      const n = conEstado.filter(a => a.casa_id === c.id).reduce((s, a) => s + a._r, 0)
      const mv = movimientos.filter(m => m.casa_id === c.id).reduce(
        (s, m) => s + (m.tipo === 'deposito' ? 1 : -1) * Number(m.monto || 0), 0)
      return { ...c, neto: n, movimientos: mv, saldo: Number(c.saldo_inicial || 0) + mv + n }
    }),
    curva
  }
}

/**
 * Margen de error del rendimiento. Con pocas apuestas el yield es ruido,
 * y conviene enseñar el rango en vez de la cifra sola.
 * Aproximación normal sobre el resultado por unidad apostada.
 */
export function rangoYield(apuestas = []) {
  const rs = apuestas
    .map(a => ({ e: estadoApuesta(a), r: resultado(a), stake: Number(a.stake) || 0 }))
    .filter(a => a.e !== 'pendiente' && a.e !== 'anulada' && a.stake > 0)
  if (rs.length < 2) return null
  const u = rs.map(a => a.r / a.stake)
  const media = u.reduce((a, b) => a + b, 0) / u.length
  const varianza = u.reduce((s, v) => s + (v - media) ** 2, 0) / (u.length - 1)
  const err = Math.sqrt(varianza / u.length)
  return { media, bajo: media - 1.96 * err, alto: media + 1.96 * err, n: u.length }
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
