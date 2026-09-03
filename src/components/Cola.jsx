import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import AutoInput from './AutoInput'
import LineaMercado from './LineaMercado'
import CampoLento from './CampoLento'
import { parseCola } from '../lib/parseCola'
import { paisDe, PAISES } from '../lib/paises'
import {
  DISCRETOS, L_GOLES, L_CORNERS_MAS, L_CORNERS_MENOS, L_TARJ_MAS, L_TARJ_MENOS
} from '../lib/mercados'
import { permisoAvisos, pedirPermiso, programar, cancelar } from '../lib/avisos'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')

const ESTADO_TXT = {
  pendiente: 'Sin analizar', analizando: 'Analizando…',
  listo: 'Listo', error: 'Error'
}

/** Momento de inicio del partido, o null si falta fecha u hora. */
function inicioDe(it) {
  if (!it.fecha_partido || !it.hora) return null
  const [h, m] = String(it.hora).split(':').map(Number)
  if (Number.isNaN(h)) return null
  const d = new Date(`${it.fecha_partido}T00:00:00`)
  d.setHours(h, m || 0, 0, 0)
  return d
}

/** Se da por jugado dos horas y media después del pitido inicial. */
function terminado(it, ahora) {
  const ini = inicioDe(it)
  if (!ini) return false
  return ini.getTime() + 2.5 * 60 * 60 * 1000 <= ahora
}

export default function Cola({ toast }) {
  const [items, setItems] = useState([])
  const [equipos, setEquipos] = useState([])
  const [arbitros, setArbitros] = useState([])
  const [competiciones, setCompeticiones] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [extras, setExtras] = useState({})
  const [editando, setEditando] = useState({})
  const [gruposAbiertos, setGruposAbiertos] = useState({})
  const [seleccion, setSeleccion] = useState([])
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [permiso, setPermiso] = useState(permisoAvisos())
  const [ahora, setAhora] = useState(Date.now())

  const [pegando, setPegando] = useState(false)
  /* El formulario de añadir arranca cerrado. Antes ocupaba media pantalla
     con las barras y los chips aunque solo vinieras a mirar la cola. */
  const [anadiendo, setAnadiendo] = useState(false)
  const [verMercados, setVerMercados] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(null)
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false)
  const [cupon, setCupon] = useState('')
  const [ligaCupon, setLigaCupon] = useState('')
  const [paisCupon, setPaisCupon] = useState('')

  const esperas = useRef({})

  const [nuevo, setNuevo] = useState({
    local: '', visitante: '', competicion: '', pais: '', fecha_partido: '', hora: ''
  })
  const [mercados, setMercados] = useState([])

  const alternarMercado = m =>
    setMercados(l => (l.includes(m) ? l.filter(x => x !== m) : [...l, m]))

  async function recargar() {
    const { data } = await supabase.from('cola')
      .select('*').order('creado_en', { ascending: false })
    setItems(data || [])
  }

  useEffect(() => {
    recargar()
    supabase.from('arbitros').select('*').order('visto_en', { ascending: false })
      .then(({ data }) => setArbitros(data || []))
    supabase.from('competiciones').select('*').order('visto_en', { ascending: false })
      .then(({ data }) => setCompeticiones(data || []))
    supabase.from('selecciones').select('partido').limit(600).then(({ data }) => {
      if (!data) return
      setEquipos([...new Set(
        data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i))
            .map(t => t.trim()).filter(Boolean)
      )].sort())
    })
    const pendientes = esperas.current
    return () => Object.values(pendientes).forEach(t => clearTimeout(t))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    const alVolver = () => { if (!document.hidden) setAhora(Date.now()) }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  useEffect(() => {
    if (permiso !== 'granted') return
    items.forEach(it => {
      if (it.fecha_partido && it.hora) {
        programar(it.id, `${it.local} vs ${it.visitante}`, it.fecha_partido, it.hora)
      } else {
        cancelar(it.id)
      }
    })
  }, [items, permiso])

  const nombresComp = competiciones.map(c => c.nombre)

  /* El país se adivina del nombre, y si ya usaste esa liga antes se recuerda. */
  function paisPara(comp) {
    const guardado = competiciones.find(c => c.nombre === comp)?.pais
    return guardado || paisDe(comp) || ''
  }

  async function recordarCompeticion(nombre, pais) {
    const n = (nombre || '').trim()
    if (!n) return
    const fila = { nombre: n, pais: pais || paisDe(n) || null, visto_en: new Date().toISOString() }
    const { error } = await supabase.from('competiciones')
      .upsert(fila, { onConflict: 'user_id,nombre' })
    if (!error) setCompeticiones(l => [fila, ...l.filter(c => c.nombre !== n)])
  }

  async function recordarArbitro(nombre, amarillas, rojas) {
    const n = (nombre || '').trim()
    if (!n) return
    const fila = {
      nombre: n,
      amarillas: amarillas === '' || amarillas == null ? null : Number(amarillas),
      rojas: rojas === '' || rojas == null ? null : Number(rojas),
      visto_en: new Date().toISOString()
    }
    const { error } = await supabase.from('arbitros')
      .upsert(fila, { onConflict: 'user_id,nombre' })
    if (!error) setArbitros(l => [fila, ...l.filter(a => a.nombre !== n)])
  }

  async function ponerArbitro(it, a) {
    const cambios = { arbitro: a.nombre, arb_amarillas: a.amarillas, arb_rojas: a.rojas }
    setItems(l => l.map(x => (x.id === it.id ? { ...x, ...cambios } : x)))
    const { error } = await supabase.from('cola').update(cambios).eq('id', it.id)
    if (error) return toast('No se pudo guardar')
    toast(`${a.nombre}: ${a.amarillas ?? '—'} amarillas de media`)
  }

  async function importarCupon() {
    const leidos = parseCola(cupon)
    if (!leidos.length) return toast('No reconocí ningún partido en ese texto')

    const liga = ligaCupon.trim() || null
    const pais = paisCupon.trim() || paisPara(liga) || null

    const filas = leidos.map(p => ({
      local: p.local,
      visitante: p.visitante,
      competicion: liga,
      pais,
      fecha_partido: p.fecha_partido,
      hora: p.hora,
      mercados: p.mercados,
      cuota_mercado: p.cuota
    }))

    const { data, error } = await supabase.from('cola').insert(filas).select()
    if (error) return toast('No se pudo guardar: ' + error.message)

    if (liga) recordarCompeticion(liga, pais)
    setItems(l => [...(data || []), ...l])
    setPegando(false)
    setCupon('')

    const sinMercados = leidos.filter(p => !p.mercados.length).length
    let msg = `${leidos.length} ${leidos.length === 1 ? 'partido leído' : 'partidos leídos'}`
    if (sinMercados) msg += ` · ${sinMercados} sin mercados`
    toast(msg + ' — revísalos')
  }

  async function anadir() {
    if (!nuevo.local.trim() || !nuevo.visitante.trim())
      return toast('Escribe los dos equipos')
    if (!mercados.length) {
      setVerMercados(true)
      return toast('Elige al menos un mercado')
    }

    const liga = nuevo.competicion.trim() || null
    const pais = nuevo.pais.trim() || paisPara(liga) || null

    const { data, error } = await supabase.from('cola').insert({
      local: nuevo.local.trim(),
      visitante: nuevo.visitante.trim(),
      competicion: liga,
      pais,
      fecha_partido: nuevo.fecha_partido || null,
      hora: nuevo.hora.trim() || null,
      mercados
    }).select().single()
    if (error) return toast('No se pudo añadir: ' + error.message)

    if (liga) recordarCompeticion(liga, pais)
    setItems(l => [data, ...l])
    setNuevo({
      local: '', visitante: '', competicion: nuevo.competicion,
      pais: nuevo.pais, fecha_partido: '', hora: ''
    })
    setMercados([])
    setVerMercados(false)
    setAnadiendo(false)
    toast('Añadido a la cola')
  }

  function guardarCampo(id, campo, valor) {
    const v = valor === '' ? null : valor
    setItems(l => l.map(i => (i.id === id ? { ...i, [campo]: v } : i)))

    const clave = `${id}:${campo}`
    clearTimeout(esperas.current[clave])
    esperas.current[clave] = setTimeout(async () => {
      const cambios = { [campo]: v }
      // al cambiar la liga, el país se rellena solo si lo conocemos
      if (campo === 'competicion' && v) {
        const p = paisPara(v)
        if (p) cambios.pais = p
      }
      const { error } = await supabase.from('cola').update(cambios).eq('id', id)
      if (error) toast('No se pudo guardar')
      else {
        if (cambios.pais) setItems(l => l.map(i => (i.id === id ? { ...i, pais: cambios.pais } : i)))
        if (campo === 'competicion' && v) recordarCompeticion(v, cambios.pais)
      }
      delete esperas.current[clave]
    }, 500)
  }

  function alternarMercadoItem(it, m) {
    const lista = Array.isArray(it.mercados) ? it.mercados : []
    const nueva = lista.includes(m) ? lista.filter(x => x !== m) : [...lista, m]
    setItems(l => l.map(x => (x.id === it.id ? { ...x, mercados: nueva } : x)))

    const clave = `${it.id}:mercados`
    clearTimeout(esperas.current[clave])
    esperas.current[clave] = setTimeout(async () => {
      await supabase.from('cola').update({ mercados: nueva }).eq('id', it.id)
      delete esperas.current[clave]
    }, 400)
  }

  async function borrar(id) {
    const { error } = await supabase.from('cola').delete().eq('id', id)
    if (error) return toast('No se pudo borrar')
    setConfirmarBorrar(null)
    cancelar(id)
    setSeleccion(s => s.filter(x => x !== id))
    setItems(l => l.filter(i => i.id !== id))
  }

  /** Vacía los partidos ya jugados: si terminaron, ya no sirven. */
  async function limpiarJugados() {
    const viejos = items.filter(it => terminado(it, ahora))
    if (!viejos.length) return toast('No hay partidos jugados que quitar')
    const ids = viejos.map(v => v.id)
    const { error } = await supabase.from('cola').delete().in('id', ids)
    if (error) return toast('No se pudo limpiar')
    ids.forEach(cancelar)
    setSeleccion(s => s.filter(x => !ids.includes(x)))
    setItems(l => l.filter(i => !ids.includes(i.id)))
    setConfirmarLimpiar(false)
    toast(`${viejos.length} ${viejos.length === 1 ? 'partido quitado' : 'partidos quitados'}`)
  }

  /* El tope de cinco existe por el coste del análisis. Antes el sexto toque
     no hacía nada y no decía por qué. */
  const alternarSeleccion = id =>
    setSeleccion(s => {
      if (s.includes(id)) return s.filter(x => x !== id)
      if (s.length >= 5) { toast('Máximo cinco por tanda'); return s }
      return [...s, id]
    })

  async function analizarSeleccion() {
    if (!seleccion.length) return toast('Marca los partidos a analizar')
    const sinMercados = items.filter(i => seleccion.includes(i.id) && !(i.mercados || []).length)
    if (sinMercados.length) return toast('Hay partidos marcados sin mercados elegidos')

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
            pais: it.pais || '',
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
      } catch (e) {
        const data = { error: 'No se pudo conectar con el servidor', detalle: String(e).slice(0, 300) }
        await supabase.from('cola').update({ estado: 'error', respuesta: data }).eq('id', it.id)
        setItems(l => l.map(x => (x.id === it.id ? { ...x, estado: 'error', respuesta: data } : x)))
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
    toast(`${lista.length} guardadas · anota las cuotas en Sombra`)
  }

  const campo = (it, k, etiqueta, extra = {}) => (
    <CampoLento id={`${k}-${it.id}`} etiqueta={etiqueta} valor={it[k] ?? ''}
                onGuardar={v => guardarCampo(it.id, k, v)} {...extra} />
  )

  const empezados = items.filter(it => {
    const ini = inicioDe(it)
    return ini && ini.getTime() <= ahora
  })
  const jugados = items.filter(it => terminado(it, ahora))

  const grupos = Object.values(
    items.reduce((acc, it) => {
      const clave = it.competicion
        ? it.competicion + (it.pais ? ` · ${it.pais}` : '')
        : 'Sin competición'
      if (!acc[clave]) acc[clave] = { clave, items: [] }
      acc[clave].items.push(it)
      return acc
    }, {})
  ).map(g => ({
    ...g,
    items: g.items.slice().sort((a, b) => ((a.hora || '99') < (b.hora || '99') ? -1 : 1))
  }))

  return (
    <section>
      <header className="sec-head">
        <h2>Cola de partidos</h2>
        <p className="lede">
          Pega el cupón de la casa o añade partidos a mano. Rellena lo que sepas de
          Sofascore y analiza por tandas. Máximo cinco de una vez.
        </p>
      </header>

      {empezados.length > 0 && (
        <div className="flag">
          <strong>
            {empezados.length === 1 ? 'Un partido ya empezó' : `${empezados.length} partidos ya empezaron`}.
          </strong>{' '}
          {empezados.slice(0, 4).map(e => `${e.local} vs ${e.visitante}`).join(' · ')}
          {empezados.length > 4 && ` y ${empezados.length - 4} más`}.
        </div>
      )}

      {jugados.length > 0 && (
        confirmarLimpiar ? (
          <div className="flag">
            <strong>¿Quitar {jugados.length} {jugados.length === 1 ? 'partido' : 'partidos'} ya {jugados.length === 1 ? 'jugado' : 'jugados'}?</strong>{' '}
            Se van con su análisis. Lo que ya guardaste en Sombra se queda.
            <div className="row c2" style={{ marginTop: 10 }}>
              <button className="act" onClick={limpiarJugados}>Sí, quitar</button>
              <button className="ghost" onClick={() => setConfirmarLimpiar(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button className="ghost" style={{ marginBottom: 14 }}
                  onClick={() => setConfirmarLimpiar(true)}>
            Quitar {jugados.length} {jugados.length === 1 ? 'partido jugado' : 'partidos jugados'}
          </button>
        )
      )}

      {permiso !== 'granted' && permiso !== 'no-soportado' && (
        <div className="flag">
          <strong>Avisos al empezar el partido.</strong> iOS congela los temporizadores en
          cuanto sales de la app, así que el aviso casi nunca llega. El recuadro de arriba
          es lo que sí funciona.{' '}
          <button className="mini" style={{ padding: 0 }}
                  onClick={async () => setPermiso(await pedirPermiso())}>
            Activar de todos modos
          </button>
        </div>
      )}

      {!pegando && !anadiendo && (
        <div className="row c2" style={{ marginBottom: 16 }}>
          <button className="ghost" onClick={() => setPegando(true)}>⎘ Pegar cupón</button>
          <button className="ghost" onClick={() => setAnadiendo(true)}>+ Añadir partido</button>
        </div>
      )}

      {pegando && (
        <div className="card pegar">
          <div className="field">
            <label htmlFor="cupon-cola">Pega aquí el texto del cupón</label>
            <textarea id="cupon-cola" rows={8} value={cupon}
                      onChange={e => setCupon(e.target.value)}
                      placeholder={'30/08/2026 • 07:00\nEquipo A\nvs\nEquipo B\n2.25\n1x2\n1\nTotal de goles\nMás de 1.5\n…'} />
          </div>
          <div className="row c2">
            <div className="field">
              <label htmlFor="liga-cupon">Competición</label>
              <AutoInput id="liga-cupon" value={ligaCupon} opciones={nombresComp}
                         onChange={v => { setLigaCupon(v); const p = paisPara(v); if (p) setPaisCupon(p) }}
                         placeholder="Premier League" />
            </div>
            <div className="field">
              <label htmlFor="pais-cupon">País</label>
              <AutoInput id="pais-cupon" value={paisCupon} opciones={PAISES}
                         onChange={setPaisCupon} placeholder="Inglaterra" />
            </div>
          </div>
          <p className="ayuda">
            El país importa: hay ligas homónimas en varios países y sin él el modelo puede
            analizar el partido equivocado. Se rellena solo si reconozco la competición.
          </p>
          <div className="row c2" style={{ marginTop: 12 }}>
            <button className="act" onClick={importarCupon}>Leer cupón</button>
            <button className="ghost" onClick={() => { setPegando(false); setCupon('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {anadiendo && (
      <div className="card">
        <div className="enfrenta">
          <div className="field">
            <label htmlFor="n-loc">Local</label>
            <AutoInput id="n-loc" value={nuevo.local} opciones={equipos}
                       onChange={v => setNuevo(n => ({ ...n, local: v }))} placeholder="Equipo A" />
          </div>
          <span className="vs" aria-hidden="true">vs</span>
          <div className="field">
            <label htmlFor="n-vis">Visitante</label>
            <AutoInput id="n-vis" value={nuevo.visitante} opciones={equipos}
                       onChange={v => setNuevo(n => ({ ...n, visitante: v }))} placeholder="Equipo B" />
          </div>
        </div>
        <div className="row c2">
          <div className="field">
            <label htmlFor="n-comp">Competición</label>
            <AutoInput id="n-comp" value={nuevo.competicion} opciones={nombresComp}
                       onChange={v => {
                         const p = paisPara(v)
                         setNuevo(n => ({ ...n, competicion: v, pais: p || n.pais }))
                       }}
                       placeholder="Liga/Copa/UEFA" />
          </div>
          <div className="field">
            <label htmlFor="n-pais">País</label>
            <AutoInput id="n-pais" value={nuevo.pais} opciones={PAISES}
                       onChange={v => setNuevo(n => ({ ...n, pais: v }))}
                       placeholder="Inglaterra" />
          </div>
        </div>
        <div className="row c2">
          <div className="field">
            <label htmlFor="n-fecha">Fecha</label>
            <input id="n-fecha" type="date" value={nuevo.fecha_partido}
                   onChange={e => setNuevo(n => ({ ...n, fecha_partido: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="n-hora">Hora</label>
            <input id="n-hora" value={nuevo.hora}
                   onChange={e => setNuevo(n => ({ ...n, hora: e.target.value }))}
                   placeholder="13:00" />
          </div>
        </div>

        <div className="field">
          <button className="extras-toggle" onClick={() => setVerMercados(v => !v)}>
            {verMercados
              ? '− Cerrar mercados'
              : `+ Elegir mercados${mercados.length ? ` · ${mercados.length}` : ''}`}
          </button>

          {/* Con el selector cerrado sigue viéndose lo elegido: plegar no
              es esconder. */}
          {!verMercados && mercados.length > 0 && (
            <div className="chips" style={{ marginTop: 8 }}>
              {mercados.map(m => (
                <button key={m} className="chip on" onClick={() => alternarMercado(m)}>
                  {m} ×
                </button>
              ))}
            </div>
          )}

          {verMercados && (<>
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

          {mercados.length > 0 ? (
            <div className="elegidos">
              <span className="eyebrow">Se estimarán estos {mercados.length}</span>
              <div className="chips">
                {mercados.map(m => (
                  <button key={m} className="chip on" onClick={() => alternarMercado(m)}>
                    {m} ×
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="ayuda">
              Ningún mercado elegido. Marca solo los que de verdad ibas a apostar.
            </p>
          )}
          </>)}
        </div>

        <div className="row c2">
          <button className="act" onClick={anadir}>+ Añadir a la cola</button>
          <button className="ghost"
                  onClick={() => { setAnadiendo(false); setVerMercados(false) }}>
            Cancelar
          </button>
        </div>
      </div>
      )}

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

          {grupos.map(g => {
            const ga = gruposAbiertos[g.clave] !== false
            return (
              <div key={g.clave}>
                <button className="grupo-cab"
                        onClick={() => setGruposAbiertos(x => ({ ...x, [g.clave]: !ga }))}>
                  <span className="grupo-tit">{g.clave}</span>
                  <span className="grupo-datos">
                    <span className="contador">{g.items.length}</span>
                    <span className="chevron">{ga ? '−' : '+'}</span>
                  </span>
                </button>

                {ga && g.items.map(it => {
                  const ab = abierto === it.id
                  const ex = extras[it.id]
                  const ed = editando[it.id]
                  const marcado = seleccion.includes(it.id)
                  const ini = inicioDe(it)
                  const yaEmpezo = ini && ini.getTime() <= ahora
                  const susMercados = Array.isArray(it.mercados) ? it.mercados : []
                  return (
                    <article className={`cola-item ${it.estado}`} key={it.id}>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        <button className="tiny" style={{ margin: 11, alignSelf: 'center' }}
                                onClick={() => alternarSeleccion(it.id)}
                                aria-label="Marcar para analizar">
                          {marcado ? '☑' : '☐'}
                        </button>
                        <button className="cola-cab" onClick={() => setAbierto(ab ? null : it.id)}>
                          <div>
                            <div className="cola-nom">{it.local} vs {it.visitante}</div>
                            <div className="cola-meta">
                              {it.hora || 'sin hora'}
                              {yaEmpezo && ' · YA EMPEZÓ'}
                              {` · ${susMercados.length} merc`}
                              {` · ${ESTADO_TXT[it.estado]}`}
                              {it.respuesta?.confianza != null && ` · conf ${it.respuesta.confianza}`}
                            </div>
                          </div>
                          <span className="chevron">{ab ? '−' : '+'}</span>
                        </button>
                      </div>

                      {ab && (
                        <div className="cola-cuerpo">
                          {!susMercados.length && (
                            <div className="flag">
                              <strong>Sin mercados.</strong> Elige abajo qué quieres que
                              estime antes de mandarlo a analizar.
                            </div>
                          )}

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

                              {it.respuesta.sugerencias?.length > 0 && (
                                <div className="flag" style={{ marginTop: 12 }}>
                                  <strong>Mercados alternativos.</strong>
                                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                    {it.respuesta.sugerencias.map((s, i) => (
                                      <li key={i} style={{ marginBottom: 5 }}>
                                        En lugar de <b>{s.en_lugar_de}</b>, considera{' '}
                                        <b>{s.considera}</b> — {s.porque}
                                      </li>
                                    ))}
                                  </ul>
                                  <p style={{ marginTop: 8, fontSize: 12 }}>
                                    Más probable no significa mejor apuesta: lo que más se
                                    cumple suele estar peor pagado.
                                  </p>
                                </div>
                              )}

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
                            <div className="flag">
                              <strong>No se pudo analizar.</strong> {it.respuesta.error}
                              {it.respuesta.detalle && (
                                <p className="razonamiento" style={{ marginTop: 8 }}>
                                  {it.respuesta.detalle}
                                </p>
                              )}
                              {it.respuesta.crudo && (
                                <p className="razonamiento" style={{ marginTop: 8 }}>
                                  {it.respuesta.crudo}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="row c2" style={{ marginTop: 12 }}>
                            <button className="extras-toggle"
                                    onClick={() => setEditando(e => ({ ...e, [it.id]: !e[it.id] }))}>
                              {ed ? '− Cerrar edición' : '✎ Editar y mercados'}
                            </button>
                            <button className="extras-toggle"
                                    onClick={() => setExtras(e => ({ ...e, [it.id]: !e[it.id] }))}>
                              {ex ? '− Ocultar Sofascore' : '+ Datos de Sofascore'}
                            </button>
                          </div>

                          {ed && (
                            <div style={{ marginTop: 12 }}>
                              <div className="row c2">
                                {campo(it, 'local', 'Local')}
                                {campo(it, 'visitante', 'Visitante')}
                              </div>
                              <div className="row c2">
                                {campo(it, 'competicion', 'Competición', { placeholder: 'Liga/Copa/UEFA' })}
                                {campo(it, 'pais', 'País', { placeholder: 'Inglaterra' })}
                              </div>
                              <div className="row c2">
                                <div className="field">
                                  <label htmlFor={`fe-${it.id}`}>Fecha</label>
                                  <input id={`fe-${it.id}`} type="date"
                                         value={it.fecha_partido ?? ''}
                                         onChange={e => guardarCampo(it.id, 'fecha_partido', e.target.value)} />
                                </div>
                                {campo(it, 'hora', 'Hora', { placeholder: '13:00' })}
                              </div>

                              <div className="field" style={{ marginTop: 14 }}>
                                <label>Mercados de este partido · {susMercados.length}</label>
                                <LineaMercado titulo="Goles" unidad="goles"
                                              lineasMas={L_GOLES} lineasMenos={L_GOLES}
                                              puestos={susMercados}
                                              onAlternar={m => alternarMercadoItem(it, m)} />
                                <LineaMercado titulo="Córners" unidad="córners"
                                              lineasMas={L_CORNERS_MAS} lineasMenos={L_CORNERS_MENOS}
                                              puestos={susMercados}
                                              onAlternar={m => alternarMercadoItem(it, m)} />
                                <LineaMercado titulo="Tarjetas" unidad="tarjetas"
                                              lineasMas={L_TARJ_MAS} lineasMenos={L_TARJ_MENOS}
                                              puestos={susMercados}
                                              onAlternar={m => alternarMercadoItem(it, m)} />
                                <span className="eyebrow" style={{ display: 'block', margin: '14px 0 7px' }}>
                                  Resultado y otros
                                </span>
                                <div className="chips">
                                  {DISCRETOS.map(m => (
                                    <button key={m}
                                            className={`chip ${susMercados.includes(m) ? 'on' : ''}`}
                                            onClick={() => alternarMercadoItem(it, m)}>{m}</button>
                                  ))}
                                </div>
                                {susMercados.length > 0 && (
                                  <div className="elegidos">
                                    <span className="eyebrow">Se estimarán estos {susMercados.length}</span>
                                    <div className="chips">
                                      {susMercados.map(m => (
                                        <button key={m} className="chip on"
                                                onClick={() => alternarMercadoItem(it, m)}>
                                          {m} ×
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {ex && (
                            <div style={{ marginTop: 12 }}>
                              <CampoLento id={`ar-${it.id}`} etiqueta="Árbitro"
                                          valor={it.arbitro ?? ''}
                                          placeholder="Nombre del árbitro"
                                          onGuardar={v => {
                                            guardarCampo(it.id, 'arbitro', v)
                                            if (v.trim()) recordarArbitro(v, it.arb_amarillas, it.arb_rojas)
                                          }} />

                              {arbitros.length > 0 && (() => {
                                const q = (it.arbitro || '').trim().toLowerCase()
                                const cerca = q
                                  ? arbitros.filter(a => a.nombre.toLowerCase().includes(q))
                                  : arbitros
                                const muestra = cerca.slice(0, q ? 5 : 4)
                                if (!muestra.length) return null
                                return (
                                  <div style={{ marginTop: -4, marginBottom: 12 }}>
                                    <span className="eyebrow">
                                      {q ? 'Coincidencias' : 'Últimos usados'}
                                    </span>
                                    <div className="chips" style={{ marginTop: 6 }}>
                                      {muestra.map(a => (
                                        <button key={a.nombre}
                                                className={`chip ${it.arbitro === a.nombre ? 'on' : ''}`}
                                                onClick={() => ponerArbitro(it, a)}>
                                          {a.nombre}
                                          {a.amarillas != null && ` · ${a.amarillas}`}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}

                              <div className="row c2">
                                <CampoLento id={`am-${it.id}`} etiqueta="Media amarillas"
                                            valor={it.arb_amarillas ?? ''} inputMode="decimal"
                                            placeholder="5.48"
                                            onGuardar={v => {
                                              guardarCampo(it.id, 'arb_amarillas', v)
                                              recordarArbitro(it.arbitro, v, it.arb_rojas)
                                            }} />
                                <CampoLento id={`ro-${it.id}`} etiqueta="Media rojas"
                                            valor={it.arb_rojas ?? ''} inputMode="decimal"
                                            placeholder="0.39"
                                            onGuardar={v => {
                                              guardarCampo(it.id, 'arb_rojas', v)
                                              recordarArbitro(it.arbitro, it.arb_amarillas, v)
                                            }} />
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
                            </div>
                          )}

                          <div className="bet-pie">
                            {confirmarBorrar === it.id ? (
                              <>
                                <span className="cola-meta">¿Seguro?</span>
                                <button className="tiny lose on" onClick={() => borrar(it.id)}>
                                  Sí, quitar
                                </button>
                                <button className="tiny" onClick={() => setConfirmarBorrar(null)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button className="tiny" onClick={() => setConfirmarBorrar(it.id)}>
                                Quitar de la cola
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
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
