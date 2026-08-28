import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { comparar, costeMargen } from '../lib/margen'
import AutoInput from './AutoInput'
import LineaMercado from './LineaMercado'
import CampoLento from './CampoLento'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v || 0).toFixed(2)

const mercadoVacio = () => ({ nombre: '', cuotas: ['', ''] })

const MERCADOS_BASE = [
  '1X2 - gana el local', 'Más de 2.5 goles', 'Más de 1.5 goles', 'Ambos equipos marcan'
]

const DISCRETOS = [
  '1X2 - gana el local', '1X2 - empate', '1X2 - gana el visitante',
  'Doble oportunidad - local o empate', 'Doble oportunidad - visitante o empate',
  'Ambos equipos marcan',
  'Más de 0.5 goles en la primera mitad', 'Más de 1.5 goles en la primera mitad'
]

const L_GOLES_MAS   = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_GOLES_MENOS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]

const L_CORNERS_MAS   = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
const L_CORNERS_MENOS = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5]

const L_TARJETAS_MAS   = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_TARJETAS_MENOS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]

export default function Analisis({ toast }) {
  const [vista, setVista] = useState('margen')

  /* ── comisiones ───────────────────────────────────────── */
  const [stake, setStake] = useState('20')
  const [mercados, setMercados] = useState([
    { nombre: '1X2', cuotas: ['', '', ''] },
    { nombre: 'Total de goles 2.5', cuotas: ['', ''] }
  ])

  const upNombre = (i, v) => setMercados(m => m.map((x, j) => (j === i ? { ...x, nombre: v } : x)))
  const upCuota = (i, j, v) =>
    setMercados(m => m.map((x, ix) =>
      ix === i ? { ...x, cuotas: x.cuotas.map((c, jx) => (jx === j ? v : c)) } : x))
  const addCuota = i =>
    setMercados(m => m.map((x, ix) => (ix === i ? { ...x, cuotas: [...x.cuotas, ''] } : x)))
  const delCuota = (i, j) =>
    setMercados(m => m.map((x, ix) =>
      ix === i ? { ...x, cuotas: x.cuotas.filter((_, jx) => jx !== j) } : x))
  const addMercado = () => setMercados(m => [...m, mercadoVacio()])
  const delMercado = i => setMercados(m => m.filter((_, j) => j !== i))

  const tabla = comparar(mercados.filter(m => m.nombre.trim()))

  /* ── sombra ───────────────────────────────────────────── */
  const [registros, setRegistros] = useState([])
  const [equipos, setEquipos] = useState([])
  const [local, setLocal] = useState('')
  const [visitante, setVisitante] = useState('')
  const [competicion, setCompeticion] = useState('')
  const [mercadosPedidos, setMercadosPedidos] = useState(MERCADOS_BASE)
  const [nuevoMercado, setNuevoMercado] = useState('')
  const [pidiendo, setPidiendo] = useState(false)
  const [respuesta, setRespuesta] = useState(null)
  const [abierto, setAbierto] = useState(null)

  const alternarMercado = m =>
    setMercadosPedidos(l => (l.includes(m) ? l.filter(x => x !== m) : [...l, m]))

  const anadirMercado = () => {
    const t = nuevoMercado.trim()
    if (t && !mercadosPedidos.includes(t)) setMercadosPedidos(l => [...l, t])
    setNuevoMercado('')
  }

  const partido = [local.trim(), visitante.trim()].filter(Boolean).join(' vs ')

  async function recargar() {
    const { data } = await supabase.from('sombra')
      .select('*').order('creado_en', { ascending: false }).limit(300)
    setRegistros(data || [])
  }

  useEffect(() => {
    recargar()
    supabase.from('selecciones').select('partido').limit(600).then(({ data }) => {
      if (!data) return
      setEquipos([...new Set(
        data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i))
            .map(t => t.trim()).filter(Boolean)
      )].sort())
    })
  }, [])

  async function pedirAnalisis() {
    if (!partido) return toast('Escribe los dos equipos')
    if (!mercadosPedidos.length) return toast('Elige al menos un mercado')
    setPidiendo(true); setRespuesta(null)
    try {
      const r = await fetch('/api/analizar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partido,
          competicion: competicion.trim(),
          mercados: mercadosPedidos
        })
      })
      const data = await r.json()
      setPidiendo(false)
      if (data.error) return toast(data.error)
      setRespuesta(data)
    } catch {
      setPidiendo(false)
      toast('No se pudo conectar con el análisis')
    }
  }

  async function guardarTodo() {
    const lista = (respuesta?.mercados || [])
    if (!lista.length) return
    const { error } = await supabase.from('sombra').insert(
      lista.map(m => ({
        partido,
        competicion: competicion.trim() || null,
        mercado_ia: m.mercado,
        prob_ia: m.probabilidad,
        confianza: respuesta.confianza ?? null,
        razonamiento: [respuesta.datos, respuesta.aviso].filter(Boolean).join('\n\n').slice(0, 4000)
      }))
    )
    if (error) return toast('No se pudo guardar: ' + error.message)
    toast(`${lista.length} estimaciones guardadas`)
    setRespuesta(null)
    recargar()
  }

  async function marcarSombra(id, acerto) {
    const actual = registros.find(r => r.id === id)?.acerto_ia
    const nuevo = actual === acerto ? null : acerto
    const { error } = await supabase.from('sombra').update({ acerto_ia: nuevo }).eq('id', id)
    if (error) return toast('No se pudo marcar')
    setRegistros(rs => rs.map(r => (r.id === id ? { ...r, acerto_ia: nuevo } : r)))
  }

  async function guardarCuota(id, valor) {
    const v = Number(valor) > 1 ? Number(valor) : null
    const { error } = await supabase.from('sombra').update({ cuota_ia: v }).eq('id', id)
    if (error) return toast('No se pudo guardar la cuota')
    setRegistros(rs => rs.map(r => (r.id === id ? { ...r, cuota_ia: v } : r)))
  }

  async function borrarGrupo(clave) {
    const ids = grupos.find(g => g.clave === clave)?.items.map(i => i.id) || []
    const { error } = await supabase.from('sombra').delete().in('id', ids)
    if (error) return toast('No se pudo borrar')
    toast('Análisis borrado')
    recargar()
  }

  const grupos = Object.values(
    registros.reduce((acc, r) => {
      const fecha = String(r.creado_en).slice(0, 10)
      const clave = `${r.partido}__${fecha}`
      if (!acc[clave]) acc[clave] = {
        clave, partido: r.partido, competicion: r.competicion,
        fecha, confianza: r.confianza, razonamiento: r.razonamiento, items: []
      }
      acc[clave].items.push(r)
      return acc
    }, {})
  )

  const resueltas = registros.filter(r => r.acerto_ia !== null && r.acerto_ia !== undefined)
  const aciertos = resueltas.filter(r => r.acerto_ia).length
  const probMedia = resueltas.length
    ? resueltas.reduce((a, r) => a + Number(r.prob_ia || 0), 0) / resueltas.length : null
  const tasaReal = resueltas.length ? aciertos / resueltas.length : null

  /* Lo que habrías ganado o perdido apostando una unidad a cada estimación.
     Es lo único que responde si el modelo sirve: acertar mucho en cuotas
     bajas pierde dinero, y acertar poco en cuotas altas lo gana. */
  const conCuota = resueltas.filter(r => Number(r.cuota_ia) > 1)
  const retorno = conCuota.reduce(
    (s, r) => s + (r.acerto_ia ? Number(r.cuota_ia) - 1 : -1), 0)
  const yieldSombra = conCuota.length ? retorno / conCuota.length : null

  return (
    <section>
      <header className="sec-head">
        <h2>Análisis</h2>
        <p className="lede">
          Dos herramientas: una calcula lo que te cobra la casa en cada mercado,
          la otra pone a prueba si un modelo acierta más que el precio de mercado.
        </p>
      </header>

      <div className="segmented">
        <button className={vista === 'margen' ? 'on' : ''} onClick={() => setVista('margen')}>
          Comisión
        </button>
        <button className={vista === 'sombra' ? 'on' : ''} onClick={() => setVista('sombra')}>
          Sombra
        </button>
      </div>

      {vista === 'margen' ? (
        <>
          <div className="flag">
            <strong>Qué es esto.</strong> Si sumas las probabilidades de todas las opciones
            de un mercado, debería dar 100%. Siempre da más: ese exceso es la comisión de la
            casa y sale de tu bolsillo antes de que ruede el balón.
          </div>

          <div className="card">
            <div className="field">
              <label htmlFor="st">Monto que sueles apostar</label>
              <div className="con-sufijo">
                <input id="st" inputMode="decimal" value={stake}
                       onChange={e => setStake(e.target.value)} />
                <span className="sufijo">L</span>
              </div>
            </div>
          </div>

          {mercados.map((m, i) => (
            <div className="card" key={i}>
              <div className="merc-head">
                <span className="merc-n">Mercado {i + 1}</span>
                {mercados.length > 1 && <button className="x" onClick={() => delMercado(i)}>×</button>}
              </div>
              <div className="field">
                <label htmlFor={`mn${i}`}>Nombre</label>
                <input id={`mn${i}`} value={m.nombre}
                       onChange={e => upNombre(i, e.target.value)}
                       placeholder="1X2, Ambos marcan, Total 2.5…" />
              </div>
              <label>Cuotas de todas las opciones</label>
              <div className="cuotas-fila">
                {m.cuotas.map((c, j) => (
                  <div className="cuota-item" key={j}>
                    <input inputMode="decimal" value={c} aria-label={`Cuota ${j + 1}`}
                           onChange={e => upCuota(i, j, e.target.value)} placeholder="1.85" />
                    {m.cuotas.length > 2 && <button className="x" onClick={() => delCuota(i, j)}>×</button>}
                  </div>
                ))}
              </div>
              <button className="mini" onClick={() => addCuota(i)}>+ Otra opción</button>
            </div>
          ))}

          <button className="ghost" onClick={addMercado}>+ Añadir mercado</button>

          {tabla.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <span className="eyebrow">Ordenados por comisión, de menor a mayor</span>
              <table style={{ marginTop: 10 }}>
                <tbody>
                  <tr><th>Mercado</th><th>Comisión</th><th>Te cuesta</th></tr>
                  {tabla.map((t, i) => (
                    <tr key={i}>
                      <td>{t.nombre}</td>
                      <td className={t.margen > 0.07 ? 'neg' : t.margen < 0.04 ? 'pos' : ''}>
                        {pct(t.margen)}
                      </td>
                      <td>{money(costeMargen(t.margen, stake))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tabla[0] && (
                <p className="ayuda">
                  <strong>{tabla[0].nombre}</strong> es el que menos comisión te cobra.{' '}
                  {tabla[0].juicio?.texto}{' '}
                  {tabla.length > 1 && (
                    <>Frente a <strong>{tabla[tabla.length - 1].nombre}</strong>, te ahorras{' '}
                    {money(costeMargen(tabla[tabla.length - 1].margen - tabla[0].margen, stake))} por
                    cada apuesta de {money(Number(stake))}.</>
                  )}
                </p>
              )}
            </div>
          )}

          {tabla[0]?.justas && (
            <div className="card">
              <span className="eyebrow">Cuotas sin comisión · {tabla[0].nombre}</span>
              <table style={{ marginTop: 10 }}>
                <tbody>
                  <tr><th>Cuota</th><th>Implícita</th><th>Real</th><th>Cuota justa</th></tr>
                  {tabla[0].justas.map((j, i) => (
                    <tr key={i}>
                      <td>{j.cuota.toFixed(2)}</td>
                      <td>{pct(j.implicita)}</td>
                      <td>{pct(j.sinComision)}</td>
                      <td>{j.cuotaJusta.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ayuda">
                La columna «real» es lo que el mercado cree de verdad, quitando la comisión.
                Para tener ventaja, tu estimación tiene que superar ese número, no el de la cuota.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flag">
            <strong>Esto no es un generador de picks.</strong> El modelo estima probabilidades
            <em> sin ver las cuotas</em>, para que no se ancle en ellas. Tú guardas su
            estimación y sigues apostando por tu criterio. Dentro de 50 partidos sabrás si
            acertaba más que el mercado o no.
          </div>

          {resueltas.length > 0 && (
            <div className="figs">
              <div className="fig"><div className="k">Resueltas</div><div className="v">{resueltas.length}</div></div>
              <div className="fig"><div className="k">Acertó</div><div className="v">{pct(tasaReal)}</div></div>
              <div className="fig"><div className="k">Decía acertar</div><div className="v">{pct(probMedia)}</div></div>
              <div className="fig">
                <div className="k">Desviación</div>
                <div className={`v ${tasaReal - probMedia < -0.05 ? 'neg' : ''}`}>
                  {probMedia != null ? pct(tasaReal - probMedia) : '—'}
                </div>
              </div>
            </div>
          )}

          {conCuota.length > 0 && (
            <div className="figs">
              <div className="fig">
                <div className="k">Con cuota anotada</div>
                <div className="v">{conCuota.length}</div>
              </div>
              <div className="fig">
                <div className="k">Yield si lo siguieras</div>
                <div className={`v ${yieldSombra < 0 ? 'neg' : yieldSombra > 0 ? 'pos' : ''}`}>
                  {pct(yieldSombra)}
                </div>
              </div>
            </div>
          )}

          {conCuota.length >= 30 && (
            <div className="verdict">
              {yieldSombra > 0.02
                ? 'Yield positivo: siguiendo estas estimaciones habrías ganado dinero. Es la única señal que cuenta, pero necesita muchas más apuestas para ser fiable.'
                : yieldSombra > -0.02
                  ? 'Yield cerca de cero: el modelo va a la par del mercado. No aporta ventaja, pero tampoco la destruye.'
                  : 'Yield negativo: siguiendo estas estimaciones habrías perdido dinero, por mucho que el porcentaje de acierto parezca alto.'}
            </div>
          )}

          {resueltas.length >= 20 && (
            <div className="verdict">
              {Math.abs(tasaReal - probMedia) < 0.05
                ? 'Bien calibrado: acierta más o menos lo que dice.'
                : tasaReal < probMedia
                  ? 'Sobreestima: dice acertar más de lo que acierta.'
                  : 'Infraestima: acierta más de lo que anuncia.'}
              {' '}Ojo: acertar mucho no significa ganar dinero. Anota las cuotas y mira el yield.
            </div>
          )}

          <div className="card">
            <div className="enfrenta">
              <div className="field">
                <label htmlFor="loc-s">Local</label>
                <AutoInput id="loc-s" value={local} opciones={equipos}
                           onChange={setLocal} placeholder="Marsella" />
              </div>
              <span className="vs" aria-hidden="true">vs</span>
              <div className="field">
                <label htmlFor="vis-s">Visitante</label>
                <AutoInput id="vis-s" value={visitante} opciones={equipos}
                           onChange={setVisitante} placeholder="Strasbourg" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="co">Competición</label>
              <input id="co" value={competicion} onChange={e => setCompeticion(e.target.value)}
                     placeholder="Ligue 1" />
            </div>

            <div className="field">
              <label>Mercados a estimar · {mercadosPedidos.length}</label>

              <LineaMercado titulo="Goles" unidad="goles"
                            lineasMas={L_GOLES_MAS} lineasMenos={L_GOLES_MENOS}
                            puestos={mercadosPedidos} onAlternar={alternarMercado} />

              <LineaMercado titulo="Córners" unidad="córners"
                            lineasMas={L_CORNERS_MAS} lineasMenos={L_CORNERS_MENOS}
                            puestos={mercadosPedidos} onAlternar={alternarMercado} />

              <LineaMercado titulo="Tarjetas" unidad="tarjetas"
                            lineasMas={L_TARJETAS_MAS} lineasMenos={L_TARJETAS_MENOS}
                            puestos={mercadosPedidos} onAlternar={alternarMercado} />

              <span className="eyebrow" style={{ display: 'block', margin: '14px 0 7px' }}>
                Resultado y otros
              </span>
              <div className="chips">
                {DISCRETOS.map(m => (
                  <button key={m}
                          className={`chip ${mercadosPedidos.includes(m) ? 'on' : ''}`}
                          onClick={() => alternarMercado(m)}>{m}</button>
                ))}
              </div>

              <div className="row c2" style={{ marginTop: 10 }}>
                <input value={nuevoMercado} onChange={e => setNuevoMercado(e.target.value)}
                       placeholder="otro mercado…" />
                <button className="ghost" onClick={anadirMercado}>Añadir</button>
              </div>

              {mercadosPedidos.length > 0 && (
                <div className="elegidos">
                  <span className="eyebrow">Se estimarán estos {mercadosPedidos.length}</span>
                  <div className="chips">
                    {mercadosPedidos.map(m => (
                      <button key={m} className="chip on" onClick={() => alternarMercado(m)}>
                        {m} ×
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="ayuda">
                Elige solo los que de verdad estabas considerando apostar. Si pides las tres
                opciones del 1X2, una acierta por fuerza y el registro sombra queda inflado.
                Entre 4 y 8 mercados funciona mejor que veinte. En córners y sobre todo en
                tarjetas espera confianzas bajas: dependen del árbitro y ese dato casi nunca
                se publica antes.
              </p>
            </div>

            <button className="act" onClick={pedirAnalisis} disabled={pidiendo}>
              {pidiendo ? 'Buscando información…' : 'Pedir estimación'}
            </button>
          </div>

          {respuesta && (
            <div className="card">
              <span className="eyebrow">Confianza declarada: {respuesta.confianza ?? '—'}/100</span>
              {respuesta.datos && <p className="ayuda" style={{ marginTop: 8 }}>{respuesta.datos}</p>}

              {(respuesta.mercados || []).map((m, i) => (
                <div className="merc" key={i} style={{ marginTop: 10 }}>
                  <div className="sel-row">
                    <div className="sel-txt">
                      <b>{m.mercado}</b>
                      {m.razon && <em>{m.razon}</em>}
                    </div>
                    <span className="odd">{pct(m.probabilidad)}</span>
                  </div>
                </div>
              ))}

              {respuesta.aviso && (
                <div className="flag" style={{ marginTop: 12 }}>
                  <strong>Riesgo del análisis.</strong> {respuesta.aviso}
                </div>
              )}
              {respuesta.crudo && <p className="ayuda">{respuesta.crudo}</p>}

              <div className="row c2" style={{ marginTop: 14 }}>
                <button className="act" onClick={guardarTodo}>Guardar todo en sombra</button>
                <button className="ghost" onClick={() => setRespuesta(null)}>Descartar</button>
              </div>
            </div>
          )}

                   {grupos.length > 0 && (
            <>
              <div className="sec-label" style={{ marginTop: 22 }}>
                <span className="eyebrow">Archivo de análisis</span>
                <span className="contador">{grupos.length}</span>
              </div>

              {grupos.map(g => {
                const hechas = g.items.filter(i => i.acerto_ia !== null && i.acerto_ia !== undefined).length
                const ok = g.items.filter(i => i.acerto_ia === true).length
                const completo = hechas === g.items.length
                const ab = abierto === g.clave
                return (
                  <article className={`bet compacta ${completo ? 'ganada' : 'pendiente'}`}
                           key={g.clave}>
                    <button className="bet-cabecera" onClick={() => setAbierto(ab ? null : g.clave)}
                            aria-expanded={ab}>
                      <div className="bet-izq">
                        <div className="cola-nom">{g.partido}</div>
                        <div className="bet-meta">
                          <span>{g.fecha.slice(5)}</span>
                          {g.competicion && <><span className="sep">·</span><span>{g.competicion}</span></>}
                          <span className="sep">·</span>
                          <span>{g.items.length} merc</span>
                          {hechas > 0 && <><span className="sep">·</span><span>{ok}/{hechas} ✓</span></>}
                        </div>
                      </div>
                      <div className="bet-der">
                        <span className="chevron" aria-hidden="true">{ab ? '−' : '+'}</span>
                      </div>
                    </button>

                    {ab && (
                      <div className="bet-cuerpo">
                        {g.razonamiento && <p className="razonamiento">{g.razonamiento}</p>}
                        {g.items.map(r => (
                          <div className="sel" key={r.id}>
                            <div className="sel-row">
                              <div className="sel-txt">{r.mercado_ia}</div>
                              <span className="odd">{pct(Number(r.prob_ia))}</span>
                            </div>
                            <div className="row c2" style={{ marginTop: 8, marginBottom: 8 }}>
                              <CampoLento id={`cu-${r.id}`} etiqueta="Cuota de la casa"
                                          valor={r.cuota_ia ?? ''} inputMode="decimal"
                                          placeholder="1.85"
                                          onGuardar={v => guardarCuota(r.id, v)} />
                              <div className="marks" style={{ alignSelf: 'end', marginBottom: 4 }}>
                                <button className={`tiny win ${r.acerto_ia === true ? 'on' : ''}`}
                                        onClick={() => marcarSombra(r.id, true)}>✓</button>
                                <button className={`tiny lose ${r.acerto_ia === false ? 'on' : ''}`}
                                        onClick={() => marcarSombra(r.id, false)}>✗</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="bet-pie">
                          <button className="tiny" onClick={() => borrarGrupo(g.clave)}>
                            Borrar análisis
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </>
          )}
    </section>
  )
}
