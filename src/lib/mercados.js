/**
 * Catálogo de mercados. Vive aquí y no en cada pantalla: tenerlo por
 * duplicado hacía que al cambiar uno el otro se quedara viejo.
 */

export const DISCRETOS = [
  '1X2 - gana el local', '1X2 - empate', '1X2 - gana el visitante',
  'Doble oportunidad - local o empate', 'Doble oportunidad - visitante o empate',
  'Ambos equipos marcan',
  'Local gana cualquier mitad', 'Visitante gana cualquier mitad',
  'Más de 0.5 goles en la primera mitad', 'Más de 1.5 goles en la primera mitad',
  'Menos de 1.5 goles en la primera mitad', 'Más de 2.5 goles en la primera mitad',
  'Primera mitad 1X', 'Primera mitad 2X',
  'Local más de 0.5 goles', 'Visitante más de 0.5 goles',
  'Local Hándicap +0', 'Local Hándicap +0.5', 'Local Hándicap +1',
  'Local Hándicap +1.5', 'Local Hándicap +2', 'Local Hándicap +2.5',
  'Visitante Hándicap +0', 'Visitante Hándicap +0.5', 'Visitante Hándicap +1',
  'Visitante Hándicap +1.5', 'Visitante Hándicap +2', 'Visitante Hándicap +2.5',
  'Se clasifica el local', 'Se clasifica el visitante'
]

export const L_GOLES         = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
export const L_CORNERS_MAS   = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
export const L_CORNERS_MENOS = [...L_CORNERS_MAS, 15.5, 16.5]
export const L_TARJ_MAS      = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
export const L_TARJ_MENOS    = [...L_TARJ_MAS, 7.5]

/**
 * Deja el nombre de un mercado en su forma canónica.
 * El modelo devuelve variantes ("Más 6.5 córners", "1X2 - gana el local (Marsella)")
 * y sin esto cada variante formaba su propio grupo en las estadísticas.
 */
export function normalizar(nombre) {
  let t = String(nombre || '').trim()
  if (!t) return t

  // fuera el equipo entre paréntesis al final
  t = t.replace(/\s*\([^)]*\)\s*$/, '').trim()

  // "Más 6.5" -> "Más de 6.5"
  t = t.replace(/^(Más|Menos)\s+(\d)/i, '$1 de $2')

  // dos puntos por guion en las dobles oportunidades
  t = t.replace(/^Doble oportunidad:\s*/i, 'Doble oportunidad - ')

  const b = t.toLowerCase()
  if (b.startsWith('doble oportunidad')) {
    if (/\b1\s*x\b|1 o empate|local o empate/.test(b)) return 'Doble oportunidad - local o empate'
    if (/\bx\s*2\b|empate o 2|2 o empate|visitante o empate/.test(b))
      return 'Doble oportunidad - visitante o empate'
  }

  // unifica plural y acentos de las unidades
  t = t.replace(/\bcorners?\b/i, 'córners').replace(/\bcórner\b/i, 'córners')
  t = t.replace(/\btarjeta\b/i, 'tarjetas').replace(/\bgol\b/i, 'goles')

  return t
}
