import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AutoInput from './AutoInput'
import LineaMercado from './LineaMercado'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')

const DISCRETOS = [
  '1X2 - gana el local', '1X2 - empate', '1X2 - gana el visitante',
  'Doble oportunidad - local o empate', 'Doble oportunidad - visitante o empate',
  'Ambos equipos marcan',
  'Más de 0.5 goles en la primera mitad', 'Más de 1.5 goles en la primera mitad'
]

const L_GOLES         = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_CORNERS_MAS   = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
const L_CORNERS_MENOS = [...L_CORNERS_MAS, 15.5, 16.5]
const L_TARJ_MAS      = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_TARJ_MENOS    = [...L_TARJ_MAS, 7.5]

const ESTADO_TXT = {
  pendiente: 'Sin analizar', analizando: 'Analizando…',
  listo: 'Listo', error: 'Error'
}

export default function Cola({ toast }) {
  const [items, setItems] = useState([])
  const [equipos, setEquipos] = useState([])
  const [arbitros, setArbitros] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [extras, setExtras] = useState({})
  const [seleccion, setSeleccion] = useState([])
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState(null)

  const [nuevo, setNuevo] = useState({
    local: '', visitante: '', competicion: '', fecha_partido: '', hora: ''
  })
  const [mercados, setMercados] = useState([
    '1X2 - gana el local', 'Más de 2.5 goles', 'Más de 1.5 goles', 'Ambos equipos marcan'
  ])

  const alternarMercado = m =>
    setMercados(l => (l.includes(m) ? l.filter(x => x !== m) : [...l, m]))

  async function recargar() {
    const { data } = await supabase.from('cola')
      .select('*').order('creado_en', { ascending: false })
    setItems(data || [])
  }

  async function recargarArbitros() {
    const { data } = await supabase.from('arbitros')
      .select('*').order('visto_en', { ascending: false })
    setArbitros(data || [])
  }

  useEffect(() => {
    recargar()
    recargarArbitros()
    supabase.from('selecciones').select('partido').limit(600).then(({ data }) => {
      if (!data) return
      setEquipos([...new Set(
        data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i))
            .map(t => t.trim()).filter(Boolean)
      )].sort())
    })
  }, [])

  async function anadir() {
    if (!nuevo.local.trim() || !nuevo.visitante.trim())
      return toast('Escribe los dos equipos')
    if (!mercados.length) return toast('Elige al menos un mercado')

    const { error } = await supabase.from('cola').insert({
      local: nuevo.local.trim(),
      visitante: nuevo.visitante.trim(),
      competicion: nuevo.competicion.trim() || null,
      fecha_partido: nuevo.fecha_partido || null,
      hora: nuevo.hora.trim() || null,
      mercados
    })
    if (error) return toast('No se pudo añadir: ' + error.message)
    setNuevo({ local: '', visitante: '', competicion: nuevo.competicion, fecha_partido: '', hora: '' })
    toast('Añadido a la cola')
    recargar()
  }

  async function guardarCampo(id, campo, valor) {
    const v = valor === '' ? null : valor
    const { error } = await supabase.from('cola').update({ [campo]: v }).eq('id', id)
    if (error) return toast('No se pudo guardar')
    setItems(l => l.map(i => (i.id === id ? { ...i, [campo]: v } : i)))
  }

  async function borrar(id) {
    const { error } = await supabase.from('cola').delete().eq('id', id)
    if (error) return toast('No se pudo borrar')
    setSeleccion(s => s.filter(x => x !== id))
    recargar()
  }

  const alternarSeleccion = id =>
    setSeleccion(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= 5 ? s : [...s, id]))

  /* ── memoria de árbitros ── */
  async function recordarArbitro(nombre, amarillas, rojas) {
    const n = (nombre || '').trim()
    if (!n) return
    const { error } = await supabase.from('arbitros').upsert({
      nombre: n,
      amarillas: amarillas === '' || amarillas == null ? null : Number(amarillas),
      rojas: rojas === '' || rojas == null ? null : Number(rojas),
      visto_en: new Date().toISOString()
    }, { onConflict: 'user_id,nombre' })
    if (!error) recargarArbitros()
  }

  async function elegirArbitro(it, nombre) {
    const a = arbitros.find(x => x.nombre === nombre)
    const cambios = {
      arbitro: nombre,
      ...(a ? { arb_amarillas: a.amarillas, arb_rojas: a.rojas } : {})
    }
    const { error } = await supabase.from('cola').update(cambios).eq('id', it.id)
    if (error) return toast('No se pudo guardar')
    setItems(l => l.map(x => (x.id === it.id ? { ...x, ...cambios } : x)))
    if (a) toast(`${nombre}: ${a.amarillas ?? '—'} amarillas de media`)
  }

  /* ── la cola: uno detrás de otro, nunca en paralelo ── */
  async function analizarSeleccion() {
    if (!seleccion.length) return toast('Marca los partidos a analizar')
    setCorriendo(true)

    const lista = items.filter(i => seleccion.includes(i.id))
    for (let n = 0; n < lista.length; n++) {
      const it = lista[n]
      setProgreso({ n: n + 1, total: lista.length, partido: `${it.local} vs ${it.visitante}` })
      await supabase.from('cola').update({ estado: 'analizando' }).eq('id', it.id)
      setItems(l => l.map(x => (x.id === it.id ? { ...x, estado: 'analizando' } : x)))

      try {
        const r = await fetch('/api/analizar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            partido: `${it.local} vs ${it.visitante}`,
            competicion: it.competicion || '',
            fecha: it.fecha_partido || '',
            mercados: it.mercados || [],
            arbitro: it.arbitro || '',
            arbAmarillas: it.arb_amarillas || '',
            arbRojas: it.arb_rojas || '',
            fase: it.fase || '',
            resultadoIda: it.resultado_ida || '',
            posLocal: it.pos_local || '',
            posVisitante: it.pos_visitante || '',
            prevCorners: it.prev_corners || '',
            prevTarjetas: it.prev_tarjetas || '',
            bajas: it.bajas || '',
            notas: it.notas || ''
          })
        })
        const data = await r.json()
        const estado = data.error && !data.mercados ? 'error' : 'listo'
        await supabase.from('cola')
          .update({ estado, respuesta: data, analizado_en: new Date().toISOString() })
          .eq('id', it.id)
        setItems(l => l.map(x => (x.id === it.id ? { ...x, estado, respuesta: data } : x)))
      } catch {
        await supabase.from('cola').update({ estado: 'error' }).eq('id', it.id)
        setItems(l => l.map(x => (x.id === it.id ? { ...x, estado: 'error' } : x)))
      }
    }

    setProgreso(null)
    setCorriendo(false)
    setSeleccion([])
    toast('Análisis terminado')
  }

  async function guardarEnSombra(it) {
    const lista = it.respuesta?.mercados || []
    if (!lista.length) return toast('Nada que guardar')
    const { error } = await supabase.from('sombra').insert(
      lista.map(m => ({
        partido: `${it.local} vs ${it.visitante}`,
        competicion: it.competicion || null,
        mercado_ia: m.mercado,
        prob_ia: m.probabilidad,
        confianza: it.respuesta.confianza ?? null,
        razonamiento: [it.respuesta.datos, it.respuesta.aviso].filter(Boolean).join('\n\n').slice(0, 4000)
      }))
    )
    if (error) return toast('No se pudo guardar: ' + error.message)
    toast(`${lista.length} estimaciones guardadas en sombra`)
  }

  const campo = (it, k, etiqueta, extra = {}) => (
    <div className="field">
      <label htmlFor={`${k}-${it.id}`}>{etiqueta}</label>
      <input id={`${k}-${it.id}`} defaultValue={it[k] ?? ''} {...extra}
             onBlur={e => guardarCampo(it.id, k, e.target.value)} />
    </div>
  )

  return (
    <section>
      <header className="sec-head">
        <h2>Cola de partidos</h2>
        <p className="lede">
          Añade los partidos que te interesen, rellena lo que sepas de Sofascore y
          analiza por tandas. Máximo cinco de una vez.
        </p>
      </header>

      <div className="card">
        <div className="enfrenta">
          <div className="field">
            <label htmlFor="n-loc">Local</label>
            <AutoInput id="n-loc" value={nuevo.local} opciones={equipos}
                       onChange={v => setNuevo(n => ({ ...n, local: v }))} placeholder="Celtic" />
          </div>
          <span className="vs" aria-hidden="true">vs</span>
          <div className="field">
            <label htmlFor="n-vis">Visitante</label>
            <AutoInput id="n-vis" value={nuevo.visitante} opciones={equipos}
                       onChange={v => setNuevo(n => ({ ...n, visitante: v }))} placeholder="LASK" />
          </div>
        </div>
        <div className="row c2">
          <div className="field">
            <label htmlFor="n-comp">Competición</label>
            <input id="n-comp" value={nuevo.competicion}
                   onChange={e => setNuevo(n => ({ ...n, competicion: e.target.value }))}
                   placeholder="Champions League" />
          </div>
          <div className="field">
            <label htmlFor="n-hora">Hora</label>
            <input id="n-hora" value={nuevo.hora}
                   onChange={e => setNuevo(n => ({ ...n, hora: e.target.value }))}
                   placeholder="13:00" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="n-fecha">Fecha</label>
          <input id="n-fecha" type="date" value={nuevo.fecha_partido}
                 onChange={e => setNuevo(n => ({ ...n, fecha_partido: e.target.value }))} />
        </div>

        <div className="field">
          <label>Mercados · {mercados.length}</label>
          <LineaMercado titulo="Goles" unidad="goles"
                        lineasMas={L_GOLES} lineasMenos={L_GOLES}
                        puestos={mercados} onAlternar={alternarMercado} />
          <LineaMercado titulo="Córners" unidad="córners"
                        lineasMas={L_CORNERS_MAS} lineasMenos={L_CORNERS_MENOS}
                        puestos={mercados} onAlternar={alternarMercado} />
          <LineaMercado titulo="Tarjetas" unidad="tarjetas"
                        lineasMas={L_TARJ_MAS} lineasMenos={L_TARJ_MENOS}
                        puestos={mercados} onAlternar={alternarMercado} />
          <span className="eyebrow" style={{ display: 'block', margin: '14px 0 7px' }}>
            Resultado y otros
          </span>
          <div className="chips">
            {DISCRETOS.map(m => (
              <button key={m} className={`chip ${mercados.includes(m) ? 'on' : ''}`}
                      onClick={() => alternarMercado(m)}>{m}</button>
            ))}
          </div>
        </div>

        <button className="act" onClick={anadir}>+ Añadir a la cola</button>
      </div>

      {progreso && (
        <div className="progreso">
          <b>{progreso.n} de {progreso.total}</b> · analizando {progreso.partido}
          <div className="progreso-barra">
            <div className="progreso-relleno"
                 style={{ width: `${(progreso.n / progreso.total) * 100}%` }} />
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="sec-label" style={{ marginTop: 20 }}>
            <span className="eyebrow">En cola</span>
            <span className="contador">{seleccion.length}/5 marcados</span>
          </div>

          {items.map(it => {
            const ab = abierto === it.id
            const ex = extras[it.id]
            const marcado = seleccion.includes(it.id)
            return (
              <article className={`cola-item ${it.estado}`} key={it.id}>
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  <button className="tiny" style={{ margin: 13, alignSelf: 'center' }}
                          onClick={() => alternarSeleccion(it.id)}
                          aria-label="Marcar para analizar">
                    {marcado ? '☑' : '☐'}
                  </button>
                  <button className="cola-cab" onClick={() => setAbierto(ab ? null : it.id)}>
                    <div>
                      <div className="cola-nom">{it.local} vs {it.visitante}</div>
                      <div className="cola-meta">
                        {it.competicion || 'sin competición'}
                        {it.hora && ` · ${it.hora}`}
                        {` · ${ESTADO_TXT[it.estado]}`}
                        {it.respuesta?.confianza != null && ` · confianza ${it.respuesta.confianza}`}
                      </div>
                    </div>
                    <span className="chevron">{ab ? '−' : '+'}</span>
                  </button>
                </div>

                {ab && (
                  <div className="cola-cuerpo">
                    {it.respuesta?.mercados?.length > 0 && (
                      <>
                        {it.respuesta.datos && (
                          <p className="razonamiento">{it.respuesta.datos}</p>
                        )}
                        {it.respuesta.mercados.map((m, i) => (
                          <div className="sel" key={i}>
                            <div className="sel-row">
                              <div className="sel-txt">
                                <b>{m.mercado}</b>
                                {m.razon && <em>{m.razon}</em>}
                              </div>
                              <span className="odd">{pct(m.probabilidad)}</span>
                            </div>
                          </div>
                        ))}
                        {it.respuesta.aviso && (
                          <div className="flag"><strong>Riesgo.</strong> {it.respuesta.aviso}</div>
                        )}
                        <button className="act" style={{ marginTop: 12 }}
                                onClick={() => guardarEnSombra(it)}>
                          Guardar en sombra
                        </button>
                      </>
                    )}

                    {it.respuesta?.error && !it.respuesta?.mercados && (
                      <div className="flag"><strong>No se pudo analizar.</strong> {it.respuesta.error}</div>
                    )}

                    <button className="extras-toggle"
                            onClick={() => setExtras(e => ({ ...e, [it.id]: !e[it.id] }))}>
                      {ex ? '− Ocultar datos de Sofascore' : '+ Datos de Sofascore'}
                    </button>

                    {ex && (
                      <div style={{ marginTop: 12 }}>
                        <div className="field">
                          <label>Árbitro</label>
                          <AutoInput value={it.arbitro ?? ''}
                                     opciones={arbitros.map(a => a.nombre)}
                                     onChange={v => elegirArbitro(it, v)}
                                     placeholder="Mateo Busquets Ferrer" />
                        </div>
                        <div className="row c2">
                          <div className="field">
                            <label htmlFor={`am-${it.id}`}>Media amarillas</label>
                            <input id={`am-${it.id}`} inputMode="decimal" placeholder="5.48"
                                   defaultValue={it.arb_amarillas ?? ''}
                                   key={`am-${it.id}-${it.arb_amarillas}`}
                                   onBlur={e => {
                                     guardarCampo(it.id, 'arb_amarillas', e.target.value)
                                     recordarArbitro(it.arbitro, e.target.value, it.arb_rojas)
                                   }} />
                          </div>
                          <div className="field">
                            <label htmlFor={`ro-${it.id}`}>Media rojas</label>
                            <input id={`ro-${it.id}`} inputMode="decimal" placeholder="0.39"
                                   defaultValue={it.arb_rojas ?? ''}
                                   key={`ro-${it.id}-${it.arb_rojas}`}
                                   onBlur={e => {
                                     guardarCampo(it.id, 'arb_rojas', e.target.value)
                                     recordarArbitro(it.arbitro, it.arb_amarillas, e.target.value)
                                   }} />
                          </div>
                        </div>
                        <div className="row c2">
                          {campo(it, 'prev_corners', 'Córners previstos', { inputMode: 'decimal', placeholder: '9' })}
                          {campo(it, 'prev_tarjetas', 'Tarjetas previstas', { inputMode: 'decimal', placeholder: '4' })}
                        </div>
                        <div className="row c2">
                          {campo(it, 'pos_local', 'Posición local', { placeholder: '3º · 24 pts' })}
                          {campo(it, 'pos_visitante', 'Posición visitante', { placeholder: '11º · 14 pts' })}
                        </div>
                        <div className="row c2">
                          {campo(it, 'fase', 'Fase', { placeholder: 'ida / vuelta / único' })}
                          {campo(it, 'resultado_ida', 'Resultado de la ida', { placeholder: '2-0' })}
                        </div>
                        {campo(it, 'bajas', 'Bajas conocidas')}
                        {campo(it, 'notas', 'Notas')}
                        <p className="ayuda">
                          Todo opcional. Los árbitros se recuerdan: la próxima vez que
                          escribas uno ya conocido, sus medias se rellenan solas. El árbitro
                          y su media de amarillas son lo que más cambia las estimaciones de
                          tarjetas. Los campos se guardan al salir de cada casilla.
                        </p>
                      </div>
                    )}

                    <div className="bet-pie">
                      <button className="tiny" onClick={() => borrar(it.id)}>Quitar de la cola</button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}

          <button className="act" style={{ marginTop: 14 }}
                  onClick={analizarSeleccion} disabled={corriendo || !seleccion.length}>
            {corriendo
              ? 'Analizando…'
              : `Analizar ${seleccion.length || ''} ${seleccion.length === 1 ? 'partido' : 'partidos'}`}
          </button>
        </>
      )}
    </section>
  )
}
