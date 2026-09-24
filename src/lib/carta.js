/* ---------------------------------------------------------------------
   CARTA PARA REDES · src/lib/carta.js

   Dibuja la imagen (1080px de ancho, alto variable) sobre un canvas. El
   mismo código corre en el teléfono y en cualquier sitio con un canvas,
   para poder revisar el diseño sin desplegar.

   No usa imágenes de fuera: todo lo que se pinta está aquí o lo subió
   el usuario como data URI. Si no, el teléfono se niega a exportar.

   IMPORTANTE — alto dinámico: 1920px (formato historia) es el alto
   MÍNIMO, no fijo. Si el análisis es largo o hay varios picks, la
   carta pide más alto con `calcularAltoCarta()` ANTES de dibujar, así
   el pie de página (el cuadro negro del final) nunca queda pegado
   encima de un pick y lo tapa. Quien use esto debe:

     const alto = calcularAltoCarta(ctx, datos)
     canvas.height = alto        // esto reinicia el canvas
     dibujarCarta(canvas.getContext('2d'), datos)

   Ver Carta.jsx para el ejemplo completo.
   --------------------------------------------------------------------- */

export const ANCHO = 1080
export const ALTO = 1920           // alto mínimo (formato historia)

const C = {
  papel: '#FBFAF7', papel2: '#F4F3EE',
  tinta: '#1C2226', tinta2: '#414A50', suave: '#6B7378', tenue: '#949A9C',
  linea: '#DCD8CC', linea2: '#C4BFB1',
  verde: '#245C4D', ambar: '#B8860B', ambarSuave: '#F6E9C8'
}

const SANS = 'IBM Plex Sans Condensed'
const SERIF = 'IBM Plex Serif'
const MONO = 'IBM Plex Mono'

const M = 72                       // margen lateral
const PIE_ALTO = 300
const PIE_MARGEN_INFERIOR = 56
const PIE_MARGEN_SUPERIOR = 24     // aire mínimo entre el último pick y el pie

/* ── cuotas ─────────────────────────────────────────────────────────
   Una misma cuota se escribe de tres formas según el país. Se calculan
   todas desde la decimal, que es la que usan las casas de Honduras. */

export function momios(decimal) {
  const d = Number(decimal)
  if (!Number.isFinite(d) || d <= 1) return null
  const americano = d >= 2
    ? '+' + Math.round((d - 1) * 100)
    : '−' + Math.round(100 / (d - 1))
  return {
    decimal: d.toFixed(2),
    americano,
    fraccional: fraccion(d - 1),
    implicita: 1 / d
  }
}

/** Aproxima un decimal a la fracción simple más cercana (17/20, 4/5…). */
function fraccion(x) {
  let mejor = [1, 1], error = Infinity
  for (let den = 1; den <= 50; den++) {
    const num = Math.round(x * den)
    if (num < 1) continue
    const e = Math.abs(x - num / den)
    if (e < error - 1e-9) { error = e; mejor = [num, den] }
    if (error < 1e-4) break
  }
  const g = mcd(mejor[0], mejor[1])
  return `${mejor[0] / g}/${mejor[1] / g}`
}
const mcd = (a, b) => b ? mcd(b, a % b) : a

/** Formato de cuota elegido por el usuario. */
export function cuotaTexto(decimal, formato) {
  const m = momios(decimal)
  if (!m) return '—'
  return formato === 'americano' ? m.americano
    : formato === 'fraccional' ? m.fraccional
      : m.decimal
}

/* ── utilidades de dibujo ──────────────────────────────────────────── */

const fuente = (ctx, familia, tam, peso = 400) => {
  ctx.font = `${peso} ${tam}px "${familia}"`
}

/** Parte un texto en líneas que caben en un ancho. Usa el font YA
 *  puesto en el ctx — quien llame debe fijarlo antes con `fuente()`. */
function lineas(ctx, texto, ancho) {
  const out = []
  for (const parrafo of String(texto || '').split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? linea + ' ' + palabra : palabra
      if (ctx.measureText(prueba).width > ancho && linea) { out.push(linea); linea = palabra }
      else linea = prueba
    }
    out.push(linea)
  }
  return out
}

/** Escribe un texto ya partido y devuelve la altura usada. */
function escribirParrafo(ctx, ls, x, y, alto) {
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * alto))
  return ls.length * alto
}

function caja(ctx, x, y, w, h, r, relleno, borde) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  if (relleno) { ctx.fillStyle = relleno; ctx.fill() }
  if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 2; ctx.stroke() }
}

/** Iniciales de un equipo, como los distintivos de la app. */
function iniciales(nombre) {
  const ruido = /^(fc|cf|sc|ac|as|ss|cd|ud|sd|afc|cfc|club|deportivo|real|atletico|atlético|the|de|del|la|el)$/i
  const ps = String(nombre || '').split(/\s+/).filter(p => p && !ruido.test(p) && !/^[ivxlcdm]+$/i.test(p) && !/^\d+$/.test(p))
  const base = ps.length ? ps : String(nombre || '?').split(/\s+/)
  const txt = base.length === 1
    ? base[0].slice(0, 3)
    : base.slice(0, 3).map(p => p[0]).join('')
  return txt.toUpperCase() || '?'
}

/** Color estable derivado del nombre, para el distintivo sin escudo. */
function colorDe(nombre) {
  let h = 0
  for (const c of String(nombre || '')) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h}, 32%, 34%)`
}

function distintivo(ctx, x, y, radio, nombre, imagen) {
  if (imagen) {
    ctx.save()
    ctx.beginPath(); ctx.arc(x, y, radio, 0, Math.PI * 2); ctx.clip()
    const lado = radio * 2
    ctx.drawImage(imagen, x - radio, y - radio, lado, lado)
    ctx.restore()
    return
  }
  ctx.beginPath(); ctx.arc(x, y, radio, 0, Math.PI * 2)
  ctx.fillStyle = colorDe(nombre); ctx.fill()
  ctx.fillStyle = '#FBFAF7'
  fuente(ctx, SANS, radio * 0.78, 700)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(iniciales(nombre), x, y + radio * 0.03)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
}

/* ── layout ─────────────────────────────────────────────────────────
   Calcula, SIN dibujar nada, todo lo que depende del contenido: en
   cuántas líneas cabe el análisis, cuántas líneas necesita el nombre
   de cada mercado y qué alto ocupa cada fila de pick, y en qué "y"
   terminaría el bloque de picks. Tanto `calcularAltoCarta()` como
   `dibujarCarta()` llaman a esto, así que SIEMPRE calculan lo mismo —
   no hay manera de que el alto que se reservó y lo que realmente se
   dibuja queden desincronizados. */
function construirLayout(ctx, datos) {
  const d = datos || {}
  const picks = d.picks || []
  const ancho = ANCHO - M * 2

  let y = 132
  y += 116   // cabecera
  y += 108   // fila de equipos
  y += 76    // antes de logos de liga/país

  const iconos = [
    d.escudoLiga ? { img: d.escudoLiga, etq: d.competicion } : null,
    d.escudoPais ? { img: d.escudoPais, etq: d.pais } : null
  ].filter(Boolean)
  const rIcono = 26
  if (iconos.length) y += rIcono * 2 + 24

  const meta = [
    [d.competicion, d.pais].filter(Boolean).join(' · '),
    [d.fecha, d.hora].filter(Boolean).join('  ')
  ].filter(Boolean)
  y += meta.length * 38 + 26

  y += 64   // antes de la etiqueta ANÁLISIS
  y += 48   // después de la etiqueta

  fuente(ctx, SANS, 30, 400)
  const analisisLineas = lineas(ctx, d.analisis, ancho)
  y += analisisLineas.length * 42

  y += 54 + 30 + 44   // etiqueta "N PICKS POSIBLES" + cabecera de columnas

  const anchoMercado = ANCHO - M - 300 - (M + 96)
  const MAX_LINEAS_MERCADO = 2
  const ALTO_LINEA_MERCADO = 38
  const ALTO_LINEA_DETALLE = 28

  const filas = picks.map(p => {
    fuente(ctx, SANS, 34, 700)
    const lineasMercado = lineas(ctx, p.mercado, anchoMercado).slice(0, MAX_LINEAS_MERCADO)
    let lineaDetalle = null
    if (p.detalle) {
      fuente(ctx, SANS, 25, 400)
      lineaDetalle = lineas(ctx, p.detalle, anchoMercado)[0]
    }
    const alto = Math.max(76, 36 + lineasMercado.length * ALTO_LINEA_MERCADO + (lineaDetalle ? ALTO_LINEA_DETALLE : 0))
    return { p, lineasMercado, lineaDetalle, alto }
  })

  y += filas.reduce((s, f) => s + f.alto, 0)

  return { yFinal: y, meta, analisisLineas, filas, iconos, rIcono, ancho, anchoMercado }
}

/** Cuánto alto necesita esta carta en concreto. Nunca menos que el
 *  mínimo de formato historia (1920px); crece si el análisis o los
 *  picks no caben ahí sin que el pie de página los tape. Llamar a
 *  esto y poner canvas.height = resultado ANTES de dibujarCarta(). */
export function calcularAltoCarta(ctx, datos) {
  const layout = construirLayout(ctx, datos)
  const necesario = Math.ceil(layout.yFinal + PIE_MARGEN_SUPERIOR + PIE_ALTO + PIE_MARGEN_INFERIOR)
  return Math.max(ALTO, necesario)
}

/* ── la carta ───────────────────────────────────────────────────────
   datos = {
     local, visitante, fecha, hora, competicion, pais,
     analisis, picks: [{ mercado, detalle, probabilidad, cuota }],
     formato: 'decimal' | 'americano' | 'fraccional',
     escudoLocal, escudoVisitante,        (Image ya cargada, o null)
     escudoLiga, escudoPais               (Image ya cargada, o null)
   }

   Dibuja sobre ctx.canvas tal cual esté de alto en este momento — por
   eso hay que llamar primero a calcularAltoCarta() y fijar
   canvas.height con el resultado. El pie de página se ancla siempre
   al fondo REAL del canvas (ctx.canvas.height), nunca a un número
   fijo, así que si el canvas se hizo más alto para que quepa todo,
   el pie baja con él en vez de quedar flotando a la mitad. */
export function dibujarCarta(ctx, datos) {
  const d = datos || {}
  const altoCanvas = ctx.canvas.height
  const layout = construirLayout(ctx, datos)
  const { meta, analisisLineas, filas, iconos, rIcono, ancho, anchoMercado } = layout

  ctx.fillStyle = C.papel
  ctx.fillRect(0, 0, ANCHO, altoCanvas)

  // renglones tenues, como el papel de la app
  ctx.strokeStyle = '#EFEDE4'; ctx.lineWidth = 2
  for (let ly = 150; ly < altoCanvas; ly += 44) {
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(ANCHO, ly); ctx.stroke()
  }

  let y = 132

  // ── cabecera ──
  fuente(ctx, SANS, 92, 700)
  ctx.fillStyle = C.tinta
  ctx.fillText('KAL', M, y)
  const anchoKal = ctx.measureText('KAL').width
  fuente(ctx, SERIF, 78, 700)
  ctx.fillStyle = C.tinta2
  ctx.fillText('Analysis', M + anchoKal + 22, y)

  ctx.strokeStyle = C.ambarSuave; ctx.lineWidth = 16; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(M + 6, y + 22); ctx.lineTo(M + anchoKal + 6, y + 22); ctx.stroke()
  ctx.lineCap = 'butt'

  fuente(ctx, MONO, 22, 500)
  ctx.fillStyle = C.suave
  ctx.fillText('D A T O S   ·   A N Á L I S I S   ·   V A L O R', M, y + 66)

  fuente(ctx, SERIF, 30, 600)
  ctx.fillStyle = C.tinta2
  ctx.textAlign = 'right'
  ctx.fillText('Más que apuestas,', ANCHO - M, y - 34)
  ctx.fillText('análisis.', ANCHO - M, y + 4)
  ctx.textAlign = 'left'

  y += 116
  ctx.strokeStyle = C.linea2; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(ANCHO - M, y); ctx.stroke()

  // ── equipos ──
  y += 108
  const R = 56
  distintivo(ctx, M + R, y - 18, R, d.local, d.escudoLocal)
  distintivo(ctx, ANCHO - M - R, y - 18, R, d.visitante, d.escudoVisitante)

  const centro = ANCHO / 2
  const huecoVS = 58
  const colIzq = [M + R * 2 + 26, centro - huecoVS]
  const colDer = [centro + huecoVS, ANCHO - M - R * 2 - 26]
  const anchoCol = Math.min(colIzq[1] - colIzq[0], colDer[1] - colDer[0])

  let tamNombre = 54
  const cabe = t => { fuente(ctx, SANS, tamNombre, 700); return ctx.measureText(t).width <= anchoCol }
  const nombreL = String(d.local || '').toUpperCase()
  const nombreV = String(d.visitante || '').toUpperCase()
  while (tamNombre > 26 && !(cabe(nombreL) && cabe(nombreV))) tamNombre -= 2

  ctx.textAlign = 'center'
  fuente(ctx, SANS, tamNombre, 700)
  ctx.fillStyle = C.tinta
  ctx.fillText(nombreL, (colIzq[0] + colIzq[1]) / 2, y - 4)
  ctx.fillText(nombreV, (colDer[0] + colDer[1]) / 2, y - 4)

  fuente(ctx, SERIF, 46, 700)
  ctx.fillStyle = C.ambar
  ctx.fillText('VS', centro, y - 2)
  ctx.textAlign = 'left'

  // ── logos de liga y país ──
  y += 76
  if (iconos.length) {
    const espacio = 14
    const anchoTotal = iconos.length * rIcono * 2 + (iconos.length - 1) * espacio
    let ix = centro - anchoTotal / 2 + rIcono
    iconos.forEach(ic => {
      distintivo(ctx, ix, y, rIcono, ic.etq, ic.img)
      ix += rIcono * 2 + espacio
    })
    y += rIcono + 24
  }

  // ── competición, fecha, sede ──
  fuente(ctx, MONO, 26, 500)
  ctx.fillStyle = C.suave
  ctx.textAlign = 'center'
  meta.forEach((t, i) => ctx.fillText(t, centro, y + i * 38))
  ctx.textAlign = 'left'
  y += meta.length * 38 + 26

  ctx.strokeStyle = C.linea; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(ANCHO - M, y); ctx.stroke()

  // ── análisis: texto completo, sin recortar ──
  y += 64
  fuente(ctx, SANS, 34, 700)
  ctx.fillStyle = C.tinta
  const etiqueta = 'ANÁLISIS'
  const anchoEt = ctx.measureText(etiqueta).width
  ctx.fillStyle = C.ambarSuave
  ctx.fillRect(M - 8, y - 32, anchoEt + 24, 42)
  ctx.fillStyle = C.tinta
  ctx.fillText(etiqueta, M + 4, y)

  y += 48
  fuente(ctx, SANS, 30, 400)
  ctx.fillStyle = C.tinta2
  y += escribirParrafo(ctx, analisisLineas, M, y, 42)

  // ── picks: todos los que vengan, con nombre de mercado completo ──
  y += 54
  fuente(ctx, SANS, 34, 700)
  ctx.fillStyle = C.ambarSuave
  const tp = `${filas.length} ${filas.length === 1 ? 'PICK POSIBLE' : 'PICKS POSIBLES'}`
  const anchoTp = ctx.measureText(tp).width
  ctx.fillRect(M - 8, y - 32, anchoTp + 24, 42)
  ctx.fillStyle = C.tinta
  ctx.fillText(tp, M + 4, y)

  y += 30
  fuente(ctx, MONO, 20, 500)
  ctx.fillStyle = C.tenue
  ctx.fillText('MERCADO', M + 96, y + 26)
  ctx.textAlign = 'center'
  ctx.fillText('PROB.', ANCHO - M - 236, y + 26)
  ctx.fillText('CUOTA', ANCHO - M - 82, y + 26)
  ctx.textAlign = 'left'
  y += 44

  const ALTO_LINEA_MERCADO = 38

  filas.forEach(({ p, lineasMercado, lineaDetalle, alto }, i) => {
    const arriba = y
    ctx.strokeStyle = C.linea; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(M, arriba); ctx.lineTo(ANCHO - M, arriba); ctx.stroke()

    const medio = arriba + alto / 2

    ctx.beginPath(); ctx.arc(M + 34, medio, 28, 0, Math.PI * 2)
    ctx.fillStyle = C.tinta; ctx.fill()
    ctx.fillStyle = C.papel
    fuente(ctx, MONO, 28, 600)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), M + 34, medio + 1)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'

    const bloqueAlto = lineasMercado.length * ALTO_LINEA_MERCADO + (lineaDetalle ? 28 : 0)
    let ty = medio - bloqueAlto / 2 + ALTO_LINEA_MERCADO * 0.72
    fuente(ctx, SANS, 34, 700)
    ctx.fillStyle = C.tinta
    lineasMercado.forEach(l => { ctx.fillText(l, M + 96, ty); ty += ALTO_LINEA_MERCADO })
    if (lineaDetalle) {
      fuente(ctx, SANS, 25, 400)
      ctx.fillStyle = C.suave
      ctx.fillText(lineaDetalle, M + 96, ty - 4)
    }

    ctx.textAlign = 'center'
    fuente(ctx, MONO, 40, 600)
    ctx.fillStyle = C.verde
    const prob = p.probabilidad == null ? '—' : Math.round(p.probabilidad * 100) + '%'
    ctx.fillText(prob, ANCHO - M - 236, medio + 14)

    fuente(ctx, MONO, 40, 600)
    ctx.fillStyle = C.tinta
    ctx.fillText(cuotaTexto(p.cuota, d.formato), ANCHO - M - 82, medio + 14)
    ctx.textAlign = 'left'

    y += alto
  })
  ctx.strokeStyle = C.linea; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(ANCHO - M, y); ctx.stroke()

  // ── pie: advertencia y frases — SIEMPRE anclado al fondo real del
  //    canvas, nunca a un ALTO fijo, para que jamás quede a la mitad
  //    de un pick. ──
  const pieY = altoCanvas - PIE_ALTO - PIE_MARGEN_INFERIOR
  caja(ctx, M, pieY, ancho, PIE_ALTO, 26, C.tinta)

  fuente(ctx, SANS, 24, 400)
  ctx.fillStyle = '#B9C0C4'
  ctx.textAlign = 'center'
  const aviso = 'Análisis generado con inteligencia artificial a partir de estadísticas reales. No es una predicción: en el fútbol todo puede pasar. Apuesta solo lo que puedas perder.'
  const lsAviso = lineas(ctx, aviso, ancho - 80)
  lsAviso.forEach((l, i) => ctx.fillText(l, centro, pieY + 52 + i * 32))

  let py = pieY + 62 + lsAviso.length * 32
  fuente(ctx, SERIF, 30, 700)
  ctx.fillStyle = C.papel
  ctx.fillText('"La mejor apuesta también puede ser no apostar."', centro, py)
  fuente(ctx, SERIF, 26, 600)
  ctx.fillStyle = '#D9C89A'
  ctx.fillText('"Ganar es saber cuándo entrar;', centro, py + 46)
  ctx.fillText('ganar a largo plazo es saber cuándo parar."', centro, py + 80)
  ctx.textAlign = 'left'
}
