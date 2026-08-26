const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const INSTRUCCIONES = `Eres un analista de fútbol. Tu tarea es estimar probabilidades de mercados concretos para un partido.

REGLAS INNEGOCIABLES:

1. NO conoces las cuotas de las casas de apuestas y no debes intentar deducirlas. Estima desde el juego, no desde el precio.

2. Usa la búsqueda web para averiguar lo que puedas: forma reciente, resultados, lesiones confirmadas, alineaciones probables, situación en la tabla, calendario. Cita lo que encuentres.

3. Si no encuentras información suficiente sobre un partido, dilo. Una confianza baja es una respuesta legítima y frecuente. La mayoría de partidos de ligas menores no tienen datos públicos suficientes.

4. NUNCA inventes lesiones, alineaciones, estadísticas ni resultados. Si no lo encontraste, el campo "datos" debe decirlo.

5. Calibra bien. No infles ni recortes por sistema: si los datos apuntan al 78%, di 78%. Las probabilidades extremas (por encima del 90% o por debajo del 10%) son raras en fútbol, pero entre el 25% y el 85% hay todo un rango que debes usar sin miedo.

6. Aunque no encuentres casi nada, DEBES responder igualmente con el objeto JSON. En ese caso pon confianza baja, explica la falta de datos en "datos", y da estimaciones amplias y prudentes. Nunca respondas solo con prosa.

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
        max_tokens: 4000,
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

    // El modelo a veces envuelve el JSON en prosa o en vallas de código.
    // Se rescata el primer objeto válido en vez de rendirse.
    function rescatarJson(t) {
      const sinVallas = t.replace(/```(?:json)?/gi, '').trim()
      const inicios = []
      for (let i = 0; i < sinVallas.length; i++) if (sinVallas[i] === '{') inicios.push(i)
      for (const ini of inicios) {
        let nivel = 0
        for (let j = ini; j < sinVallas.length; j++) {
          if (sinVallas[j] === '{') nivel++
          else if (sinVallas[j] === '}') {
            nivel--
            if (nivel === 0) {
              try {
                const obj = JSON.parse(sinVallas.slice(ini, j + 1))
                if (obj && Array.isArray(obj.mercados)) return obj
              } catch { /* seguimos buscando */ }
              break
            }
          }
        }
      }
      return null
    }

    const parsed = rescatarJson(texto)
    if (!parsed) {
      return res.status(200).json({
        crudo: texto.slice(0, 3000),
        error: 'El modelo respondió en texto, no en el formato esperado. Suele pasar cuando encuentra poca información fiable sobre el partido.'
      })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) })
  }
}
