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
  'Se clasifica el local', 'Se clasifica el visitante',

  /* Multigoles: la casa los ajusta menos porque los juega poca gente, y
     cubren un rango en vez de una línea, así que la varianza es distinta. */
  'Multigoles 1-2', 'Multigoles 1-3', 'Multigoles 1-4',
  'Multigoles 2-3', 'Multigoles 2-4', 'Multigoles 2-5', 'Multigoles 3-5',
  'Local multigoles 1-2', 'Local multigoles 1-3',
  'Visitante multigoles 1-2', 'Visitante multigoles 1-3',

  /* Hándicap asiático: devuelve el dinero en el empate de la línea, así
     que no es lo mismo que el hándicap entero de arriba. */
  'Hándicap asiático local -0.5', 'Hándicap asiático local -1',
  'Hándicap asiático local -1.5', 'Hándicap asiático local -2',
  'Hándicap asiático visitante +0.5', 'Hándicap asiático visitante +1',
  'Hándicap asiático visitante +1.5', 'Hándicap asiático visitante +2',

  'Ambos equipos marcan en la primera mitad',
  'Ambos equipos marcan en la segunda mitad',
  'Ambas mitades menos de 1.5 goles', 'Ambas mitades más de 0.5 goles',
  'Más goles en la segunda mitad', 'Más goles en la primera mitad',
  'Portería a cero del local', 'Portería a cero del visitante'
]

/**
 * Mercados de volumen: remates, remates a puerta, paradas y faltas.
 *
 * Van aparte porque se comportan distinto a goles y córners: la media es
 * mucho más alta (25 remates frente a 2.7 goles), así que la desviación
 * relativa es menor y la línea se puede leer mejor. Y sobre todo, la casa
 * los ajusta menos: los apuesta mucha menos gente que el 1X2.
 *
 * A cambio exigen estadística concreta del partido. Sin números de los dos
 * equipos, una estimación aquí es un número inventado — por eso la regla 6
 * del análisis obliga a decirlo y a no poner probabilidad alta por defecto.
 */
export const L_REMATES_MAS    = [16.5, 18.5, 20.5, 22.5, 24.5, 25.5, 26.5, 27.5, 28.5, 30.5, 32.5]
export const L_REMATES_MENOS  = [...L_REMATES_MAS]
export const L_PUERTA_MAS     = [4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5]
export const L_PUERTA_MENOS   = [...L_PUERTA_MAS]
export const L_PARADAS_MAS    = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]
export const L_PARADAS_MENOS  = [...L_PARADAS_MAS]
export const L_FALTAS_MAS     = [16.5, 18.5, 20.5, 22.5, 24.5, 26.5]
export const L_FALTAS_MENOS   = [...L_FALTAS_MAS]

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
  /* "remates a gol" primero: si no, la regla de gol→goles lo deja en
     "remates a goles" y se parte en dos grupos distintos. */
  t = t.replace(/\bremates?\s+a\s+gol(es)?\b/i, 'remates a puerta')
  t = t.replace(/\btiros?\s+de\s+esquina\b/i, 'córners')
  t = t.replace(/\btarjeta\b/i, 'tarjetas').replace(/\bgol\b/i, 'goles')
  t = t.replace(/\bremate\b/i, 'remates').replace(/\bparada\b/i, 'paradas')
  t = t.replace(/\bfalta\b/i, 'faltas')

  return t
}
