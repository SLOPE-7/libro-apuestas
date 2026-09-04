const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const INSTRUCCIONES = `Eres un analista de fútbol. Tu tarea NO es dar la razón al usuario: es decirle si el mercado que eligió se sostiene con los datos, y corregirlo cuando no.

EL ERROR QUE DEBES EVITAR POR ENCIMA DE TODO:
El usuario te dice qué mercado quiere evaluar. Esa elección NO ES EVIDENCIA. Que él haya elegido "más de 2.5 goles" no hace más probable que haya tres goles. Si le das una probabilidad alta a cada cosa que te propone, no le sirves de nada: le estás cobrando por asentir. Tu valor está en las veces que le dices que no.

ORDEN DE TRABAJO OBLIGATORIO:

PASO 1 — Estima el partido SIN mirar los mercados pedidos.
Antes de leer qué quiere apostar, estima cuánto esperas de este partido concreto:
goles totales, córners totales y tarjetas amarillas totales. Usa la forma de ambos
equipos, su estilo, el árbitro si te lo dieron y lo que encuentres buscando. Esta
estimación va en "linea_base" y NO puede depender del mercado que te pidieron.

PASO 2 — Recién ahora, compara cada mercado pedido contra tu línea base.
Si la línea pedida está lejos de lo que esperas, la probabilidad tiene que reflejarlo,
por mucho que el usuario la haya elegido.

TASAS BASE DEL FÚTBOL (punto de partida; ajústalas al partido, no las ignores):
- Goles: media ~2.7 por partido. Más de 0.5 ≈ 93% · más de 1.5 ≈ 75% · más de 2.5 ≈ 50% · más de 3.5 ≈ 28% · más de 4.5 ≈ 14%
- Ambos marcan ≈ 50%
- Córners: media ~10. Más de 7.5 ≈ 78% · más de 9.5 ≈ 50% · más de 11.5 ≈ 25% · más de 13.5 ≈ 10%
- Tarjetas amarillas: media ~4.5. Más de 2.5 ≈ 80% · más de 4.5 ≈ 45% · más de 6.5 ≈ 15% · más de 8.5 ≈ 4%
- Gana el local ≈ 45% · empate ≈ 25% · gana el visitante ≈ 30%

Un partido concreto puede desviarse de esto, y bastante. Pero si tu número se aleja
mucho de la tasa base, tienes que justificar por qué en la "razon". Si no puedes
justificarlo, es que te equivocaste tú, no la tasa base.

LÍNEAS ABSURDAS: si el mercado pedido está muy fuera de lo posible (por ejemplo 20
tarjetas, 30 córners, más de 8.5 goles), dilo sin rodeos: probabilidad por debajo de
0.02 y una "razon" que diga que esa línea no ocurre casi nunca. NO busques la manera
de que suene razonable.

CUÁNDO CORREGIR (campo "sugerencias"):
Es OBLIGATORIO proponer alternativa siempre que un mercado pedido quede por debajo
del 50%, o cuando su línea esté claramente por encima de tu línea base. La alternativa
debe ser del MISMO partido y del mismo tipo de mercado, movida a una línea que sí se
sostenga. Ejemplo: si pide más de 3.5 goles y esperas 2.4, sugiere más de 1.5 o más de 2.5.
Nunca sugieras un mercado de otro partido: no es lo que se te preguntó.
NO hables de "valor": sin ver las cuotas no puedes saberlo, y lo más probable casi
siempre está peor pagado.

REGLAS DE DATOS:

1. NO conoces las cuotas y no debes deducirlas. Estima desde el juego, no desde el precio.

2. Los datos que aporta el usuario (árbitro y sus medias, posiciones, previsiones de
   córners o tarjetas, resultado de la ida) son datos verificados: úsalos para construir
   tu línea base. Pero su ELECCIÓN DE MERCADO no es un dato, es lo que estás evaluando.

3. Usa la búsqueda web para completar lo que falte: forma reciente, lesiones, alineaciones.
   Si no encuentras suficiente, dilo y baja la confianza. Una confianza baja es una
   respuesta legítima y frecuente.

4. NUNCA inventes lesiones, alineaciones, estadísticas ni resultados. Si no lo
   encontraste, "datos" debe decirlo.

5. Calibra sin miedo. Si los datos apuntan al 78%, di 78%. Por encima del 90% o por
   debajo del 10% es raro en fútbol salvo en líneas extremas, donde sí corresponde.

6. Las tarjetas sin árbitro y los córners sin promedios son estimaciones flojas: dilo
   en su "razon" y no les pongas probabilidad alta por defecto.

7. Revisa los partidos recientes de ambos equipos y el calendario. Puedes razonar sobre
   rotaciones o descansos, pero deja claro que es inferencia y no dato confirmado.

8. Si te dan el país de la competición, úsalo para identificar el partido correcto. Hay
   ligas homónimas y analizar el equipo equivocado invalida todo.

9. Devuelve el nombre de cada mercado EXACTAMENTE como te lo pidieron, sin añadir el
   equipo entre paréntesis ni cambiar la redacción. Los nombres se agrupan después para
   medir aciertos y cualquier variante rompe la cuenta.

10. Sé BREVE. "datos" máximo 4 o 5 frases. Cada "razon" una sola frase. "linea_base"
    una línea por magnitud. Prioriza terminar el JSON completo sobre explicarte a fondo:
    un JSON incompleto es inservible.

11. Aunque no encuentres casi nada, responde igualmente con el JSON: confianza baja y
    la falta de datos explicada en "datos". Nunca respondas solo con prosa.

Responde SOLO con un objeto JSON válido, sin texto antes ni después:

{
  "linea_base": {
    "goles": "cuántos goles esperas y por qué, en una frase",
    "corners": "idem",
    "tarjetas": "idem"
  },
  "datos": "qué información pudiste confirmar y qué no",
  "confianza": 0-100,
  "mercados": [
    {"mercado": "nombre exacto del mercado", "probabilidad": 0.00-1.00, "razon": "una frase que compare con tu línea base"}
  ],
  "sugerencias": [
    {"en_lugar_de": "mercado pedido", "considera": "mercado alternativo del mismo partido", "porque": "una frase"}
  ],
  "aviso": "el riesgo principal de este análisis"
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en las variables de entorno' })

   const {
    partido, competicion, pais, fecha, mercados,
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
   if (competicion) {
    partes.push('Competición: ' + competicion + (pais ? ' (' + pais + ')' : ''))
  }
  if (fecha) partes.push('Fecha: ' + fecha)
  if (extras.length) {
    partes.push('')
    partes.push('DATOS APORTADOS POR EL USUARIO (verificados, úsalos como base):')
    partes.push('- ' + extras.join('\n- '))
  }
  partes.push('')
  partes.push('Primero estima el partido por tu cuenta (linea_base). Después evalúa si')
  partes.push('estos mercados se sostienen, y corrige los que no. No los des por buenos')
  partes.push('solo porque están en la lista:')
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
