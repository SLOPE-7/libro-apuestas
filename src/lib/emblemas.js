/**
 * BANDERAS Y DISTINTIVOS DE EQUIPO
 *
 * Banderas: emoji, no imágenes. Los emblemas nacionales no tienen dueño,
 * el emoji ya viene en el sistema y no añade ni un byte de descarga.
 *
 * Equipos: iniciales sobre un color sacado del propio nombre. NO escudos.
 * Los escudos de club y los logos de liga son marcas registradas: hoy, en
 * una app personal, el riesgo es casi nulo, pero si algún día la abres a
 * otra gente tendrías que arrancarlos de una interfaz construida encima de
 * ellos. Esto además funciona con cualquier equipo de cualquier división
 * sin depender de que una API siga viva el año que viene.
 */

/* Inglaterra, Escocia y Gales tienen emoji propio (banderas subnacionales).
   UEFA y Conmebol no son países: llevan su propio símbolo. */
const BANDERAS = {
  'Alemania': '🇩🇪', 'Arabia Saudí': '🇸🇦', 'Argentina': '🇦🇷', 'Austria': '🇦🇹',
  'Brasil': '🇧🇷', 'Bélgica': '🇧🇪', 'Chequia': '🇨🇿', 'Corea del Sur': '🇰🇷',
  'Dinamarca': '🇩🇰', 'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'España': '🇪🇸', 'Estados Unidos': '🇺🇸',
  'Francia': '🇫🇷', 'Honduras': '🇭🇳', 'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Italia': '🇮🇹',
  'Japón': '🇯🇵', 'México': '🇲🇽', 'Noruega': '🇳🇴', 'Países Bajos': '🇳🇱',
  'Polonia': '🇵🇱', 'Portugal': '🇵🇹', 'Suecia': '🇸🇪', 'Suiza': '🇨🇭',
  'Turquía': '🇹🇷', 'Gales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Irlanda': '🇮🇪', 'Grecia': '🇬🇷',
  'Croacia': '🇭🇷', 'Serbia': '🇷🇸', 'Ucrania': '🇺🇦', 'Rumanía': '🇷🇴',
  'Colombia': '🇨🇴', 'Chile': '🇨🇱', 'Uruguay': '🇺🇾', 'Perú': '🇵🇪',
  'Ecuador': '🇪🇨', 'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷', 'Guatemala': '🇬🇹',
  'El Salvador': '🇸🇻', 'Panamá': '🇵🇦', 'Canadá': '🇨🇦', 'Australia': '🇦🇺',
  'China': '🇨🇳', 'Catar': '🇶🇦', 'Emiratos Árabes Unidos': '🇦🇪', 'Egipto': '🇪🇬',
  'Marruecos': '🇲🇦', 'Sudáfrica': '🇿🇦', 'Israel': '🇮🇱', 'Rusia': '🇷🇺',
  'Finlandia': '🇫🇮', 'Islandia': '🇮🇸', 'Bulgaria': '🇧🇬', 'Hungría': '🇭🇺',
  'Eslovaquia': '🇸🇰', 'Eslovenia': '🇸🇮', 'UEFA': '🇪🇺', 'Conmebol': '🌎'
}

export function banderaDe(pais) {
  if (!pais) return ''
  return BANDERAS[pais.trim()] || ''
}

/* Palabras que no distinguen a nadie: casi todos los clubes las llevan. */
const RUIDO = new Set([
  'fc', 'cf', 'sc', 'ac', 'as', 'af', 'afc', 'cd', 'ud', 'sd', 'rc', 'rcd',
  'club', 'de', 'del', 'la', 'el', 'los', 'las', 'and', 'y', 'sk', 'sv',
  'bsc', 'vfb', 'vfl', 'tsg', 'fsv', 'ssc', 'us', 'ss', 'kv', 'jk', 'if',
  'bk', 'ik', 'gnk', 'hnk', 'nk', 'ca', 'aa', 'ec', 'sl', 'cska', 'hsv'
])

/**
 * Dos o tres letras que identifiquen al equipo de un vistazo.
 * "Manchester City" → MC · "Porto" → POR · "Bayer Leverkusen" → BL
 */
export function inicialesDe(equipo) {
  const limpio = String(equipo || '').trim()
  if (!limpio) return '—'

  const palabras = limpio
    .split(/[\s.]+/)
    .map(p => p.replace(/[^\p{L}\p{N}]/gu, ''))
    // fuera el ruido, los años ("Schalke 04") y los romanos ("Willem II"):
    // no distinguen a nadie y dejan iniciales ilegibles como "S0"
    .filter(p => p && !RUIDO.has(p.toLowerCase()) &&
                 !/^\d+$/.test(p) && !/^[IVXLC]+$/i.test(p))

  if (!palabras.length) return limpio.slice(0, 2).toUpperCase()
  if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase()
  return palabras.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

/**
 * Color estable sacado del nombre. El mismo equipo sale siempre igual y
 * dos equipos distintos casi nunca coinciden. Tonos apagados a propósito:
 * son etiquetas dentro de un libro, no botones de colores.
 */
export function colorDe(equipo) {
  const t = String(equipo || '')
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360
  return {
    fondo: `hsl(${h} 34% 88%)`,
    texto: `hsl(${h} 46% 27%)`,
    borde: `hsl(${h} 28% 74%)`
  }
}
