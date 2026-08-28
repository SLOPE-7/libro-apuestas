const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const INSTRUCCIONES = `Eres un analista de fútbol. Tu tarea es estimar probabilidades de mercados concretos para un partido.

REGLAS INNEGOCIABLES:

1. NO conoces las cuotas de las casas de apuestas y no debes intentar deducirlas. Estima desde el juego, no desde el precio.

2. Si el usuario te da datos concretos (árbitro y sus medias, posiciones, promedios de córners o tarjetas, resultado de la ida), ÚSALOS como base principal. Son datos que él ha verificado. Usa la búsqueda web para completar lo que falte: forma reciente, lesiones, alineaciones.

3. Si no encuentras información suficiente, dilo. Una confianza baja es una respuesta legítima y frecuente.

4. NUNCA inventes lesiones, alineaciones, estadísticas ni resultados. Si no lo encontraste, el campo "datos" debe decirlo.

5. Calibra bien. No infles ni recortes por sistema: si los datos apuntan al 78%, di 78%. Las probabilidades extremas (por encima del 90% o por debajo del 10%) son raras en fútbol, pero entre el 25% y el 85% hay todo un rango que debes usar sin miedo.

6. Con el árbitro y su media de amarillas puedes estimar tarjetas con fundamento. Sin ese dato, dilo y baja la confianza de esos mercados.

7. Aunque no encuentres casi nada, DEBES responder igualmente con el objeto JSON. En ese caso pon confianza baja y explica la falta de datos en "datos". Nunca respondas solo con prosa.

8. Al final, si detectas que alguno de los mercados pedidos es arriesgado dada la información disponible, señálalo en "sugerencias": qué mercado del mismo partido tendría más probabilidad de cumplirse. Ejemplo: si le piden "gana el local" y el local llega con bajas y en mala forma, sugiere la doble oportunidad. NO digas cuál tiene más "valor": sin ver las cuotas no puedes saberlo, y lo más probable casi siempre está peor pagado.

9. Si los mercados que pide el usuario tienen riesgo, ofrécele alternativas y señala en qué destaca de verdad cada equipo según sus estadísticas.

10. Revisa los partidos recientes de ambos equipos y ten en cuenta el calendario. Puedes razonar sobre rotaciones o descansos probables, pero deja claro que es una inferencia y no un dato confirmado.

11. El campo "datos" debe ser BREVE: máximo 4 o 5 frases. Sin citas, sin etiquetas, sin párrafos largos. Resume lo esencial: forma, bajas confirmadas y qué no pudiste verificar. Un "datos" largo agota el espacio de respuesta y corta el JSON a medias.

12. Cada "razon" en una sola frase corta. Prioriza terminar el JSON completo sobre explicarte a fondo: un JSON incompleto es inservible.


Responde SOLO con un objeto JSON válido, sin texto antes ni después:

{
  "datos": "qué información pudiste confirmar y qué no",
  "confianza": 0-100,
  "mercados": [
    {"mercado": "nombre del mercado", "probabilidad": 0.00-1.00, "razon": "una frase"}
  ],
  "sugerencias": [
    {"en_lugar_de": "mercado pedido", "considera": "mercado alternativo", "porque": "una frase"}
  ],
  "aviso": "el riesgo principal de este análisis"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en las variables de entorno' })

  const {
    partido, competicion, fecha, mercados,
    arbitro, arbAmarillas, arbRojas,
    fase, resultadoIda,
    posLocal, posVisitante,
    prevCorners, prevTarjetas,
    bajas, notas
  } = req.body || {}

  if (!partido) return res.status(400).json({ error: 'Falta el partido' })

  const lista = (mercados && mercados.length ? mercados : [
    '1X2 - gana el local', 'Más de 2.5 goles', 'Más de 1.5 goles', 'Ambos equipos marcan'
  ]).join('\n- ')

  // Solo se envían los datos que el usuario haya rellenado
  const extras = []
  if (arbitro) {
    let a = 'Árbitro: ' + arbitro
    if (arbAmarillas) a += ' · media de amarillas por partido: ' + arbAmarillas
    if (arbRojas) a += ' · media de rojas: ' + arbRojas
    extras.push(a)
  }
  if (fase) extras.push('Fase: ' + fase + (resultadoIda ? ' · resultado de la ida: ' + resultadoIda : ''))
  if (posLocal) extras.push('Posición del local en la tabla: ' + posLocal)
  if (posVisitante) extras.push('Posición del visitante en la tabla: ' + posVisitante)
  if (prevCorners) extras.push('Córners esperados en el partido (previsión Sofascore): ' + prevCorners)
  if (prevTarjetas) extras.push('Tarjetas amarillas esperadas en el partido (previsión Sofascore): ' + prevTarjetas)
  if (bajas) extras.push('Bajas conocidas: ' + bajas)
  if (notas) extras.push('Notas del usuario: ' + notas)

  const partes = ['Partido: ' + partido]
  if (competicion) partes.push('Competición: ' + competicion)
  if (fecha) partes.push('Fecha: ' + fecha)
  if (extras.length) {
    partes.push('')
    partes.push('DATOS APORTADOS POR EL USUARIO (verificados, úsalos como base):')
    partes.push('- ' + extras.join('\n- '))
  }
  partes.push('')
  partes.push('Estima la probabilidad de cada uno de estos mercados:')
  partes.push('- ' + lista)

  const pregunta = partes.join('\n')

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
        max_tokens: 9000,
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
        error: 'El modelo respondió en texto, no en el formato esperado.'
      })
    }

    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) })
  }
}
