const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const INSTRUCCIONES = `Eres un analista de fútbol. Tu tarea es estimar probabilidades de mercados concretos para un partido.

REGLAS INNEGOCIABLES:

1. NO conoces las cuotas de las casas de apuestas y no debes intentar deducirlas. Estima desde el juego, no desde el precio.

2. Usa la búsqueda web para averiguar lo que puedas: forma reciente, resultados, lesiones confirmadas, alineaciones probables, situación en la tabla, calendario. Cita lo que encuentres.

3. Si no encuentras información suficiente sobre un partido, dilo. Una confianza baja es una respuesta legítima y frecuente. La mayoría de partidos de ligas menores no tienen datos públicos suficientes.

4. NUNCA inventes lesiones, alineaciones, estadísticas ni resultados. Si no lo encontraste, el campo "datos" debe decirlo.

5. Sé conservador. Las probabilidades reales del fútbol rara vez son extremas. Un favorito claro en casa gana sobre el 60-65%, no el 85%.

Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma exacta:

{
  "datos": "qué información pudiste confirmar y qué no",
  "confianza": 0-100,
  "mercados": [
    {"mercado": "nombre del mercado", "probabilidad": 0.00-1.00, "razon": "una frase"}
  ],
  "aviso": "el riesgo principal de este análisis"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en las variables de entorno' })

  const { partido, competicion, fecha, mercados } = req.body || {}
  if (!partido) return res.status(400).json({ error: 'Falta el partido' })

  const lista = (mercados && mercados.length ? mercados : [
    '1X2 - gana el local', '1X2 - empate', '1X2 - gana el visitante',
    'Más de 2.5 goles', 'Más de 1.5 goles', 'Ambos equipos marcan'
  ]).join('\n- ')

  const pregunta = `Partido: ${partido}
${competicion ? `Competición: ${competicion}` : ''}
${fecha ? `Fecha: ${fecha}` : ''}

Estima la probabilidad de cada uno de estos mercados:
- ${lista}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        system: INSTRUCCIONES,
        messages: [{ role: 'user', content: pregunta }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }]
      })
    })

    if (!r.ok) {
      const detalle = await r.text()
      return res.status(502).json({ error: 'La API respondió con error', detalle: detalle.slice(0, 400) })
    }

    const data = await r.json()
    const texto = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    let parsed = null
    try {
      const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
      const desde = limpio.indexOf('{')
      const hasta = limpio.lastIndexOf('}')
      parsed = JSON.parse(limpio.slice(desde, hasta + 1))
    } catch {
      return res.status(200).json({ crudo: texto, error: 'No devolvió JSON válido' })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) })
  }
}
