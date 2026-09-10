/**
 * VARIANZA — qué se siente vivir una probabilidad.
 *
 * No estima nada nuevo. Toma la probabilidad que ya dio el modelo y la
 * cuota que pagó la casa, y enseña cómo se ve una tanda de apuestas así.
 *
 * Existe porque el error caro no es equivocarse de mercado: es abandonar
 * un proceso bueno después de tres fallos seguidos, o confiar en uno malo
 * después de tres aciertos. Ninguna de las dos cosas se ve en un boleto.
 *
 * La simulación es DETERMINISTA a propósito. Con números aleatorios cada
 * vez, la pantalla invitaría a repetir hasta que saliera bonita, que es
 * justo el hábito que la app intenta no alimentar.
 */

/** Generador reproducible: la misma entrada da siempre la misma tanda. */
function semilla(texto) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6D2B79F5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Simula muchas tandas de `n` apuestas a esta probabilidad y cuota.
 * Devuelve lo que de verdad hace falta saber antes de apostar.
 */
export function varianza(prob, cuota, n = 20, vueltas = 10000, etiqueta = '') {
  const p = Number(prob)
  const c = Number(cuota)
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null
  if (!Number.isFinite(c) || c <= 1) return null

  const rnd = semilla(etiqueta + '|' + p + '|' + c)
  const ganancia = c - 1

  let enPerdida = 0
  let sumaRacha = 0
  let peorRacha = 0
  const resultados = []

  for (let v = 0; v < vueltas; v++) {
    let saldo = 0, racha = 0, maxRacha = 0
    for (let i = 0; i < n; i++) {
      if (rnd() < p) { saldo += ganancia; racha = 0 }
      else { saldo -= 1; racha++; if (racha > maxRacha) maxRacha = racha }
    }
    if (saldo < 0) enPerdida++
    sumaRacha += maxRacha
    if (maxRacha > peorRacha) peorRacha = maxRacha
    resultados.push(saldo)
  }

  resultados.sort((a, b) => a - b)
  const cuantil = q => resultados[Math.floor(q * (resultados.length - 1))]

  /* Una tanda concreta para enseñar, sacada del mismo generador. */
  const muestra = []
  const rnd2 = semilla('muestra|' + etiqueta + '|' + p)
  for (let i = 0; i < n; i++) muestra.push(rnd2() < p)

  return {
    n,
    esperado: n * (p * ganancia - (1 - p)),   // en unidades de lo apostado
    enPerdida: enPerdida / vueltas,           // cuántas veces acabas en rojo
    rachaTipica: Math.round(sumaRacha / vueltas),
    peorRacha,
    malo: cuantil(0.10),
    tipico: cuantil(0.50),
    bueno: cuantil(0.90),
    muestra
  }
}
