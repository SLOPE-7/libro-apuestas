/* ---------------------------------------------------------------------
   CARTA PARA REDES · src/lib/carta.js

   Dibuja la imagen de 1080×1920 (historia) sobre un canvas. El mismo
   código corre en el teléfono y en cualquier sitio con un canvas, para
   poder revisar el diseño sin desplegar.

   No usa imágenes de fuera: todo lo que se pinta está aquí o lo subió
   el usuario como data URI. Si no, el teléfono se niega a exportar.
   --------------------------------------------------------------------- */

export const ANCHO = 1080
export const ALTO = 1920

const C = {
  papel: '#FBFAF7', papel2: '#F4F3EE',
  tinta: '#1C2226', tinta2: '#414A50', suave: '#6B7378', tenue: '#949A9C',
  linea: '#DCD8CC', linea2: '#C4BFB1',
  verde: '#245C4D', ambar: '#B8860B', ambarSuave: '#F6E9C8'
}

const SANS = 'IBM Plex Sans Condensed'
const SERIF = 'IBM Plex Serif'
const MONO = 'IBM Plex Mono'

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

/** Parte un texto en líneas que caben en un ancho. */
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
function parrafo(ctx, texto, x, y, ancho, alto) {
  const ls = lineas(ctx, texto, ancho)
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
  // una sola palabra da tres letras (BAR, MAD); varias, una por palabra
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

/* ── la carta ───────────────────────────────────────────────────────
   datos = {
     local, visitante, fecha, hora, competicion, pais,
     analisis, picks: [{ mercado, detalle, probabilidad, cuota }],
     formato: 'decimal' | 'americano' | 'fraccional',
     escudoLocal, escudoVisitante   (Image ya cargada, o null)
   }                                                                  */

export function dibujarCarta(ctx, datos) {
  const d = datos || {}
  const picks = (d.picks || []).slice(0, 6)
  const M = 72                       // margen lateral
  const ancho = ANCHO - M * 2

  ctx.fillStyle = C.papel
  ctx.fillRect(0, 0, ANCHO, ALTO)

  // renglones tenues, como el papel de la app
  ctx.strokeStyle = '#EFEDE4'; ctx.lineWidth = 2
  for (let y = 150; y < ALTO; y += 44) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ANCHO, y); ctx.stroke()
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

  // subrayado a mano
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
  // cada nombre en su columna, sin invadir el VS del medio
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

  // ── competición, fecha, sede ──
  y += 62
  fuente(ctx, MONO, 26, 500)
  ctx.fillStyle = C.suave
  const meta = [
    [d.competicion, d.pais].filter(Boolean).join(' · '),
    [d.fecha, d.hora].filter(Boolean).join('  ')
  ].filter(Boolean)
  ctx.textAlign = 'center'
  meta.forEach((t, i) => ctx.fillText(t, centro, y + i * 38))
  ctx.textAlign = 'left'
  y += meta.length * 38 + 26

  ctx.strokeStyle = C.linea; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(ANCHO - M, y); ctx.stroke()

  // ── análisis ──
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
  y += parrafo(ctx, d.analisis, M, y, ancho, 42)

  // ── picks ──
  y += 54
  fuente(ctx, SANS, 34, 700)
  ctx.fillStyle = C.ambarSuave
  const tp = `${picks.length} ${picks.length === 1 ? 'PICK POSIBLE' : 'PICKS POSIBLES'}`
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

  const altoFila = Math.min(126, Math.max(92, (1560 - y) / Math.max(picks.length, 1)))
  picks.forEach((p, i) => {
    const arriba = y + i * altoFila
    ctx.strokeStyle = C.linea; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(M, arriba); ctx.lineTo(ANCHO - M, arriba); ctx.stroke()

    const medio = arriba + altoFila / 2

    ctx.beginPath(); ctx.arc(M + 34, medio, 28, 0, Math.PI * 2)
    ctx.fillStyle = C.tinta; ctx.fill()
    ctx.fillStyle = C.papel
    fuente(ctx, MONO, 28, 600)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), M + 34, medio + 1)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'

    fuente(ctx, SANS, 34, 700)
    ctx.fillStyle = C.tinta
    const anchoMercado = ANCHO - M - 300 - (M + 96)
    const nombre = lineas(ctx, p.mercado, anchoMercado)[0]
    ctx.fillText(nombre, M + 96, medio + (p.detalle ? -4 : 12))
    if (p.detalle) {
      fuente(ctx, SANS, 25, 400)
      ctx.fillStyle = C.suave
      ctx.fillText(lineas(ctx, p.detalle, anchoMercado)[0], M + 96, medio + 30)
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
  })
  y += picks.length * altoFila
  ctx.strokeStyle = C.linea; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(ANCHO - M, y); ctx.stroke()

  // ── pie: advertencia y frases ──
  const pieAlto = 300
  const pieY = ALTO - pieAlto - 56
  caja(ctx, M, pieY, ancho, pieAlto, 26, C.tinta)

  fuente(ctx, SANS, 24, 400)
  ctx.fillStyle = '#B9C0C4'
  ctx.textAlign = 'center'
  const aviso = 'Análisis generado con inteligencia artificial a partir de estadísticas reales. No es una predicción: en el fútbol todo puede pasar. Apuesta solo lo que puedas perder.'
  const ls = lineas(ctx, aviso, ancho - 80)
  ls.forEach((l, i) => ctx.fillText(l, centro, pieY + 52 + i * 32))

  let py = pieY + 62 + ls.length * 32
  fuente(ctx, SERIF, 30, 700)
  ctx.fillStyle = C.papel
  ctx.fillText('"La mejor apuesta también puede ser no apostar."', centro, py)
  fuente(ctx, SERIF, 26, 600)
  ctx.fillStyle = '#D9C89A'
  ctx.fillText('"Ganar es saber cuándo entrar;', centro, py + 46)
  ctx.fillText('ganar a largo plazo es saber cuándo parar."', centro, py + 80)
  ctx.textAlign = 'left'
}
