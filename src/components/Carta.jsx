import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { familiaDe } from '../lib/mercados'
import { dibujarCarta, ANCHO, ALTO, momios } from '../lib/carta'

/* ---------------------------------------------------------------------
   CARTA PARA REDES · src/components/Carta.jsx

   Toma un partido YA analizado y lo convierte en una imagen de historia.
   Nada se inventa aquí: los mercados y las probabilidades salen del
   análisis guardado. Lo único que pones tú son las cuotas, porque esas
   las ves en tu casa de apuestas y cambian a cada rato.

   Los escudos de equipo, y ahora también el logo de la liga y el de
   país, se guardan en la misma tabla `escudos` (clave → imagen). La
   liga y el país se guardan con su propio nombre como clave, igual
   que un equipo más.
   --------------------------------------------------------------------- */

const norm = s => String(s || '').trim().toLowerCase()
const FORMATOS = [['decimal', 'Decimal'], ['americano', 'Americano'], ['fraccional', 'Fraccional']]

/** Reduce un escudo a 256px y lo deja como texto, para guardarlo en la
 *  base. Enlazado desde fuera, el teléfono se negaría a exportar. */
function aDataURI(archivo) {
  return new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onerror = () => mal(new Error('No se pudo leer la imagen'))
    lector.onload = () => {
      const img = new Image()
      img.onerror = () => mal(new Error('Esa imagen no se pudo abrir'))
      img.onload = () => {
        const L = 256
        const c = document.createElement('canvas')
        c.width = L; c.height = L
        const x = c.getContext('2d')
        const escala = Math.min(L / img.width, L / img.height)
        const w = img.width * escala, h = img.height * escala
        x.drawImage(img, (L - w) / 2, (L - h) / 2, w, h)
        ok(c.toDataURL('image/png'))
      }
      img.src = lector.result
    }
    lector.readAsDataURL(archivo)
  })
}

const cargarImagen = src => new Promise(ok => {
  const i = new Image()
  i.onload = () => ok(i)
  i.onerror = () => ok(null)
  i.src = src
})

export default function Carta({ toast }) {
  const [partidos, setPartidos] = useState([])
  const [sel, setSel] = useState(null)
  const [analisis, setAnalisis] = useState('')
  const [picks, setPicks] = useState([])
  const [formato, setFormato] = useState('decimal')
  const [escudos, setEscudos] = useState({})
  const [imgs, setImgs] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const lienzo = useRef(null)

  useEffect(() => {
    supabase.from('cola').select('*').eq('estado', 'listo')
      .order('creado_en', { ascending: false }).limit(40)
      .then(({ data }) => setPartidos(data || []))
    supabase.from('escudos').select('*')
      .then(({ data }) => setEscudos(Object.fromEntries((data || []).map(e => [e.equipo, e.imagen]))))
  }, [])

  /* Los escudos guardados (equipos, liga, país) se convierten en
     imágenes de verdad una sola vez. */
  useEffect(() => {
    let vivo = true
    Promise.all(Object.entries(escudos).map(async ([k, v]) => [k, await cargarImagen(v)]))
      .then(pares => { if (vivo) setImgs(Object.fromEntries(pares.filter(p => p[1]))) })
    return () => { vivo = false }
  }, [escudos])

  /** Al elegir partido, se arma la propuesta: análisis y mercados con su
   *  probabilidad. Todo editable: la carta es tuya, no del modelo. */
  function elegir(p) {
    setSel(p)
    const r = p.respuesta || {}
    const lb = r.linea_base || {}
    setAnalisis([lb.goles, lb.corners, lb.tarjetas].filter(Boolean).join(' ').slice(0, 420))

    const cuotas = p.cuotas || {}
    const vistos = new Set()
    const lista = [...(r.picks_ia || []), ...(r.mercados || [])]
      .filter(m => m && m.mercado && !vistos.has(norm(m.mercado)) && vistos.add(norm(m.mercado)))
      .map((m, i) => ({
        mercado: m.mercado,
        detalle: familiaDe(m.mercado) || '',
        probabilidad: Number(m.probabilidad) || null,
        cuota: cuotas[m.mercado] ? String(cuotas[m.mercado]) : '',
        elegido: i < 6
      }))
    setPicks(lista)
  }

  const elegidos = picks.filter(p => p.elegido)

  const pintar = useCallback(async () => {
    const c = lienzo.current
    if (!c || !sel) return
    if (document.fonts?.ready) await document.fonts.ready
    dibujarCarta(c.getContext('2d'), {
      local: sel.local, visitante: sel.visitante,
      competicion: sel.competicion, pais: sel.pais,
      fecha: sel.fecha_partido ? sel.fecha_partido.split('-').reverse().join('/') : '',
      hora: sel.hora || '',
      analisis,
      formato,
      picks: elegidos.slice(0, 6).map(p => ({ ...p, cuota: Number(p.cuota) || null })),
      escudoLocal: imgs[norm(sel.local)] || null,
      escudoVisitante: imgs[norm(sel.visitante)] || null,
      escudoLiga: sel.competicion ? (imgs[norm(sel.competicion)] || null) : null,
      escudoPais: sel.pais ? (imgs[norm(sel.pais)] || null) : null
    })
  }, [sel, analisis, picks, formato, imgs])

  useEffect(() => { pintar() }, [pintar])

  /** Sube el escudo de un equipo, o el logo de la liga o del país:
   *  todos se guardan igual, con su nombre como clave. */
  async function subirEscudo(clave, archivo) {
    if (!archivo) return
    try {
      const imagen = await aDataURI(archivo)
      const k = norm(clave)
      const { error } = await supabase.from('escudos')
        .upsert({ equipo: k, imagen }, { onConflict: 'user_id,equipo' })
      if (error) throw new Error(error.message)
      setEscudos(e => ({ ...e, [k]: imagen }))
      toast('Logo guardado para ' + clave)
    } catch (e) { toast(e.message) }
  }

  async function exportar(compartir) {
    setOcupado(true)
    try {
      await pintar()
      const blob = await new Promise(r => lienzo.current.toBlob(r, 'image/png'))
      if (!blob) throw new Error('No se pudo crear la imagen')
      const nombre = `KAL ${sel.local} vs ${sel.visitante}.png`.replace(/\s+/g, '-')
      const archivo = new File([blob], nombre, { type: 'image/png' })
      if (compartir && navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = nombre; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
        if (compartir) toast('Tu navegador no comparte imágenes: se descargó')
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message)
    } finally { setOcupado(false) }
  }

  return (
    <section>
      <header className="sec-head">
        <h2>Carta para redes</h2>
        <p className="lede">
          Convierte un partido ya analizado en una imagen de historia. Las cuotas
          las pones tú, tal como las ves en tu casa.
        </p>
      </header>

      {!partidos.length && (
        <div className="flag">
          <strong>Todavía no hay partidos analizados.</strong> Manda uno por la Cola
          y cuando esté listo aparecerá aquí.
        </div>
      )}

      <div className="field">
        <label htmlFor="c-partido">Partido</label>
        <select id="c-partido" value={sel?.id || ''}
                onChange={e => elegir(partidos.find(p => p.id === e.target.value))}>
          <option value="">Elige un partido analizado…</option>
          {partidos.map(p => (
            <option key={p.id} value={p.id}>
              {p.local} vs {p.visitante}{p.fecha_partido ? ` · ${p.fecha_partido}` : ''}
            </option>
          ))}
        </select>
      </div>

      {sel && (
        <>
          <div className="field">
            <label htmlFor="c-analisis">Análisis (edítalo a tu gusto)</label>
            <textarea id="c-analisis" rows={5} value={analisis}
                      onChange={e => setAnalisis(e.target.value.slice(0, 480))} />
            <p className="ayuda">{analisis.length}/480 · lo que no entre se recorta en la imagen.</p>
          </div>

          <div className="field">
            <label>Formato de cuota</label>
            <div className="segmented">
              {FORMATOS.map(([k, t]) => (
                <button key={k} className={formato === k ? 'on' : ''}
                        onClick={() => setFormato(k)}>{t}</button>
              ))}
            </div>
          </div>

          <h3 className="sub">Picks · marca hasta 6</h3>
          {picks.map((p, i) => {
            const m = momios(Number(p.cuota))
            return (
              <div key={i} className={`pick-carta ${p.elegido ? 'on' : ''}`}>
                <label className="pick-linea">
                  <input type="checkbox" checked={p.elegido}
                         onChange={e => setPicks(ps => ps.map((x, j) =>
                           j === i ? { ...x, elegido: e.target.checked } : x))} />
                  <span>
                    <b>{p.mercado}</b>
                    {p.probabilidad != null && <em> · {Math.round(p.probabilidad * 100)}%</em>}
                  </span>
                </label>
                {p.elegido && (
                  <div className="pick-cuota">
                    <input inputMode="decimal" placeholder="cuota" value={p.cuota}
                           onChange={e => setPicks(ps => ps.map((x, j) =>
                             j === i ? { ...x, cuota: e.target.value } : x))} />
                    <span>{m ? `${m.decimal} · ${m.americano} · ${m.fraccional}` : 'sin cuota'}</span>
                  </div>
                )}
              </div>
            )
          })}
          {elegidos.length > 6 && (
            <p className="ayuda">Has marcado {elegidos.length}: solo salen los 6 primeros.</p>
          )}

          <h3 className="sub">Escudos</h3>
          <p className="ayuda" style={{ marginTop: -6 }}>
            Sube el de cada equipo una vez y queda guardado. Sin escudo se dibujan
            las iniciales.
          </p>
          <div className="row c2">
            {[sel.local, sel.visitante].map(eq => (
              <label key={eq} className="subir-escudo">
                {imgs[norm(eq)]
                  ? <img src={escudos[norm(eq)]} alt="" />
                  : <span className="sin-escudo">sin escudo</span>}
                <span className="nom">{eq}</span>
                <input type="file" accept="image/*" hidden
                       onChange={e => subirEscudo(eq, e.target.files?.[0])} />
              </label>
            ))}
          </div>

          <h3 className="sub">Logo de liga y de país</h3>
          <p className="ayuda" style={{ marginTop: -6 }}>
            Opcional. Se guardan igual que un escudo, usando el nombre de la
            competición y del país como clave: si vuelve a salir la misma liga
            o el mismo país en otro partido, ya no hay que subirlo de nuevo.
          </p>
          <div className="row c2">
            {[
              { clave: sel.competicion, etiqueta: 'Liga / competición' },
              { clave: sel.pais, etiqueta: 'País' }
            ].filter(x => x.clave).map(({ clave, etiqueta }) => (
              <label key={clave} className="subir-escudo">
                {imgs[norm(clave)]
                  ? <img src={escudos[norm(clave)]} alt="" />
                  : <span className="sin-escudo">sin logo</span>}
                <span className="nom">{etiqueta}: {clave}</span>
                <input type="file" accept="image/*" hidden
                       onChange={e => subirEscudo(clave, e.target.files?.[0])} />
              </label>
            ))}
          </div>

          <h3 className="sub">Vista previa</h3>
          <canvas ref={lienzo} width={ANCHO} height={ALTO} className="lienzo-carta" />

          <div className="row c2" style={{ marginTop: 14 }}>
            <button className="act" disabled={ocupado} onClick={() => exportar(true)}>
              {ocupado ? 'Generando…' : 'Compartir'}
            </button>
            <button className="ghost" disabled={ocupado} onClick={() => exportar(false)}>
              Descargar
            </button>
          </div>

          <div className="flag" style={{ marginTop: 18 }}>
            <strong>Antes de publicar.</strong> Tus propios datos dicen que el modelo
            va en pérdida en córners over y en 1X2. Son los picks que más te
            expondrían si los publicas de forma habitual.
          </div>
        </>
      )}
    </section>
  )
}
