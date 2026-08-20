export function margen(cuotas = []) {
  const validas = cuotas.map(Number).filter(c => c > 1)
  if (validas.length < 2) return null
  const suma = validas.reduce((a, c) => a + 1 / c, 0)
  return {
    n: validas.length,
    suma,
    margen: suma - 1,
    justas: validas.map(c => {
      const p = (1 / c) / suma
      return { cuota: c, implicita: 1 / c, sinComision: p, cuotaJusta: 1 / p }
    })
  }
}

export function juicioMargen(m) {
  if (m == null) return null
  if (m < 0.03) return { nivel: 'bajo', texto: 'Margen bajo. De lo mejor que vas a encontrar.' }
  if (m < 0.05) return { nivel: 'normal', texto: 'Margen normal para un mercado principal.' }
  if (m < 0.08) return { nivel: 'alto', texto: 'Margen alto. Necesitas más acierto para compensarlo.' }
  return { nivel: 'abusivo', texto: 'Margen muy alto. Suele pasar en mercados exóticos y poco líquidos.' }
}

export const costeMargen = (m, stake) => (m == null ? null : m * Number(stake || 0))

export function comparar(mercados = []) {
  return mercados
    .map(m => {
      const r = margen(m.cuotas)
      return { ...m, ...(r || {}), juicio: juicioMargen(r?.margen) }
    })
    .filter(m => m.margen != null)
    .sort((a, b) => a.margen - b.margen)
}
