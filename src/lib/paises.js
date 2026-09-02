/**
 * País de las competiciones más habituales.
 * Hace falta porque hay ligas que se llaman igual en varios países
 * ("Primera División", "Serie A", "Liga Nacional") y el modelo puede
 * analizar el partido equivocado.
 */
const MAPA = {
  'premier league': 'Inglaterra',
  'championship': 'Inglaterra',
  'efl cup': 'Inglaterra',
  'carabao cup': 'Inglaterra',
  'fa cup': 'Inglaterra',
  'laliga': 'España',
  'la liga': 'España',
  'copa del rey': 'España',
  'serie a': 'Italia',
  'coppa italia': 'Italia',
  'bundesliga': 'Alemania',
  'dfb pokal': 'Alemania',
  'ligue 1': 'Francia',
  'coupe de france': 'Francia',
  'eredivisie': 'Países Bajos',
  'primeira liga': 'Portugal',
  'liga portugal': 'Portugal',
  'jupiler pro league': 'Bélgica',
  'pro league': 'Bélgica',
  'super lig': 'Turquía',
  'superliga': 'Dinamarca',
  'allsvenskan': 'Suecia',
  'eliteserien': 'Noruega',
  'ekstraklasa': 'Polonia',
  'fortuna liga': 'Chequia',
  'bundesliga austria': 'Austria',
  'super league': 'Suiza',
  'premiership': 'Escocia',
  'mls': 'Estados Unidos',
  'liga mx': 'México',
  'brasileirao': 'Brasil',
  'serie a brasil': 'Brasil',
  'liga profesional': 'Argentina',
  'liga nacional': 'Honduras',
  'champions league': 'UEFA',
  'europa league': 'UEFA',
  'conference league': 'UEFA',
  'supercopa de europa': 'UEFA',
  'copa libertadores': 'Conmebol',
  'copa sudamericana': 'Conmebol',
  'saudi pro league': 'Arabia Saudí',
  'j1 league': 'Japón',
  'k league': 'Corea del Sur'
  'Bundesliga': 'Australia'
}

/** Adivina el país por el nombre de la competición. Null si no lo reconoce. */
export function paisDe(competicion) {
  const t = String(competicion || '').trim().toLowerCase()
  if (!t) return null
  if (MAPA[t]) return MAPA[t]
  for (const [k, v] of Object.entries(MAPA)) {
    if (t.includes(k)) return v
  }
  return null
}

export const PAISES = [...new Set(Object.values(MAPA))].sort()
