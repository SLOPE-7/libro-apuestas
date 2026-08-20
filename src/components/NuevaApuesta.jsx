import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaTotal, probCombinada, filtro, kelly } from '../lib/calc'

/* Tipos de mercado más usados, con sus selecciones frecuentes como atajo.
   Si falta alguno, se escribe a mano eligiendo "Otro". */
const MERCADOS = {
  '1x2':                ['1', 'X', '2'],
  'Doble oportunidad':  ['1X', '12', 'X2'],
  'Apuesta sin empate': ['1', '2'],
  'Total de goles':     ['Más de 1.5', 'Más de 2.5', 'Menos de 2.5', 'Más de 1.25', 'Más de 0.5'],
  'Hándicap':           ['+0.5', '+1', '+1.5', '-0.5', '-1', '-1.5'],
  'Hándicap 1x2':       ['1 (1:0)', '1 (2:0)', '2 (0:1)', '2 (0:2)'],
  'Ambos marcan':       ['Sí', 'No'],
  'Se clasifica':       ['1', '2'],
  'Total individual':   ['Más de 0.5', 'Más de 1.5', 'Más de 2.5'],
  'Primera mitad':      ['Más de 0.5', 'Más de 1.5', 'Menos de 1.5', '1', 'X', '2'],
  'Tiros de esquina':   ['Más de 8.5', 'Más de 9.5', 'Menos de 10.5'],
  'Tarjetas':           ['Más de 3.5', 'Menos de 4.5'],
  'Otro':               []
}
const TIPOS = Object.keys(MERCADOS)

const mercadoVacio = () => ({ tipo: '1x2', seleccion: '' })
const legVacia = () => ({ partido: '', mercados: [mercadoVacio()], cuota: '', mi_prob: '', cuota_cierre: '' })

let ultimaCasa = null   // se recuerda mientras dure la sesión

export default function NuevaApuesta({ casas, banca, onGuardado, toast }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tipo, setTipo] = useState('simple')
  const [fecha, setFecha] = useState(hoy)
  const [casaId, setCasaId] = useState(ultimaCasa ?? casas[0]?.id ?? '')
  const [stake, setStake] = useState('')
  const [legs, setLegs] = useState([legVacia()])
  const [guardando, setGuardando] = useState(false)

  // Historial para sugerencias
  const [histPartidos, setHistPartidos] = useState([])
  const [histSelecciones, setHistSelecciones] = useState([])

  useEffect(() => {
    let vivo = true
    supabase
      .from('selecciones')
      .select('partido, mercado')
      .order('id', { ascending: false })
      .limit(400)
      .then(({ data }) => {
        if (!vivo || !data) return
        const partidos = [...new Set(data.map(s => s.partido).filter(Boolean))].slice(0, 60)
        // De "Total de goles: Más de 2.5 · Ambos marcan: Sí" saca las selecciones sueltas
        const sels = [...new Set(
          data.flatMap(s => (s.mercado || '').split(' · '))
              .map(t => (t.includes(':') ? t.split(':').slice(1).join(':') : t).trim())
              .filter(Boolean)
        )].slice(0, 40)
        setHistPartidos(partidos)
        setHistSelecciones(sels)
      })
    return () => { vivo = false }
  }, [])

  const up = (i, k, v) => setLegs(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const upMerc = (i, j, k, v) =>
    setLegs(l => l.map((x, ix) =>
      ix === i
        ? { ...x, mercados: x.mercados.map((m, jx) => (jx === j ? { ...m, [k]: v } : m)) }
        : x))
  const addMerc = i =>
    setLegs(l => l.map((x, ix) => (ix === i ? { ...x, mercados: [...x.mercados, mercadoVacio()] } : x)))
  const delMerc = (i, j) =>
    setLegs(l => l.map((x, ix) =>
      ix === i ? { ...x, mercados: x.mercados.filter((_, jx) => jx !== j) } : x))

  const addLeg = () => setLegs(l => [...l, legVacia()])
  const delLeg = i => setLegs(l => l.filter((_, j) => j !== i))

  function cambiarTipo(t) {
    setTipo(t)
    if (t === 'simple') setLegs(l => [l[0]])
    else if (legs.length === 1) setLegs(l => [...l, legVacia()])
  }
  function elegirCasa(id) { setCasaId(id); ultimaCasa = id }

  const conCuota = legs.filter(l => Number(l.cuota) > 1)
  const conPartido = legs.filter(l => l.partido.trim())
  const faltanCuota = conPartido.length - conCuota.filter(l => l.partido.trim()).length

  const sel = conCuota.map(l => ({ cuota: Number(l.cuota) }))
  const total = cuotaTotal(sel)
  const prob = probCombinada(sel)

  const esSimple = tipo === 'simple' && Number(legs[0]?.cuota) > 1 && Number(legs[0]?.mi_prob) > 0
  const miProb = esSimple ? Number(legs[0].mi_prob) / 100 : 0
  const f = esSimple ? filtro(miProb, Number(legs[0].cuota)) : null
  const k = esSimple ? kelly(miProb, Number(legs[0].cuota)) : 0

  const nombres = legs.map(l => l.partido.trim().toLowerCase()).filter(Boolean)
  const repetido = tipo === 'combinada' && new Set(nombres).size < nombres.length

  const textoMercado = m =>
    m.tipo === 'Otro'
      ? m.seleccion.trim()
      : [m.tipo, m.seleccion.trim()].filter(Boolean).join(': ')

  async function guardar() {
    const s = Number(stake)
    const validas = legs.filter(l => l.partido.trim() && Number(l.cuota) > 1)
    if (!(s > 0)) return toast('Falta el monto apostado')
    if (!validas.length) return toast('Falta al menos un partido con su cuota')

    setGuardando(true)
    const { data: apuesta, error: e1 } = await supabase
      .from('apuestas')
      .insert({ fecha, casa_id: casaId || null, stake: s })
      .select().single()

    if (e1) { setGuardando(false); return toast('No se pudo guardar: ' + e1.message) }

    const { error: e2 } = await supabase.from('selecciones').insert(
      validas.map((l, i) => ({
        apuesta_id: apuesta.id,
        orden: i,
        partido: l.partido.trim(),
        mercado: l.mercados.map(textoMercado).filter(Boolean).join(' · ') || null,
        cuota: Number(l.cuota),
        mi_prob: Number(l.mi_prob) > 0 ? Number(l.mi_prob) / 100 : null,
        cuota_cierre: Number(l.cuota_cierre) > 1 ? Number(l.cuota_cierre) : null
      }))
    )
    setGuardando(false)

    if (e2) {
      await supabase.from('apuestas').delete().eq('id', apuesta.id)
      return toast('No se pudo guardar: ' + e2.message)
    }

    setStake(''); setLegs([legVacia()]); setTipo('simple')
    toast('Guardada')
    onGuardado()
  }

  const acum = []
  let p = 1
  sel.forEach(s => { p *= 1 / s.cuota; acum.push(p) })

  return (
    <section>
      <h2>Registrar apuesta</h2>
      <p className="lede">
        Anota todas, incluidas las de impulso. Un registro incompleto te dirá que vas
        mejor de lo que vas.
      </p>

      {/* listas de sugerencias */}
      <datalist id="dl-partidos">
        {histPartidos.map(p => <option key={p} value={p} />)}
      </datalist>
      <datalist id="dl-selecciones">
        {histSelecciones.map(s => <option key={s} value={s} />)}
      </datalist>

      <div className="tipos">
        <button className={`tipo ${tipo === 'simple' ? 'on' : ''}`}
                onClick={() => cambiarTipo('simple')}>Simple</button>
        <button className={`tipo ${tipo === 'combinada' ? 'on' : ''}`}
                onClick={() => cambiarTipo('combinada')}>Combinada</button>
      </div>

      <div className="card">
        <div className="row c2">
          <div>
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label htmlFor="casa">Casa</label>
            <select id="casa" value={casaId} onChange={e => elegirCasa(e.target.value)}>
              {casas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="stake">Monto apostado (L)</label>
            <input id="stake" inputMode="decimal" value={stake}
                   onChange={e => setStake(e.target.value)} placeholder="0.00" />
          </div>
        </div>
      </div>

      <span className="eyebrow">
        {tipo === 'simple' ? 'La selección' : `Selecciones (${legs.length})`}
      </span>

      <div className="card">
        {legs.map((l, i) => (
          <div className="leg" key={i}>
            {tipo === 'combinada' && (
              <div className="leg-head">
                <span className="leg-n">PARTIDO {i + 1}</span>
                {legs.length > 1 &&
                  <button className="x" onClick={() => delLeg(i)}
                          aria-label={`Quitar partido ${i + 1}`}>×</button>}
              </div>
            )}

            <div className="row">
              <div>
                <label htmlFor={`p${i}`}>Partido</label>
                <input id={`p${i}`} value={l.partido} list="dl-partidos"
                       onChange={e => up(i, 'partido', e.target.value)}
                       placeholder="Celtic vs LASK" />
              </div>
            </div>

            {l.mercados.map((m, j) => (
              <div className="merc" key={j}>
                <div className="merc-top">
                  <label htmlFor={`mt${i}-${j}`} style={{ margin: 0 }}>
                    {j === 0 ? 'Mercado' : `Mercado ${j + 1} · mismo partido`}
                  </label>
                  {l.mercados.length > 1 &&
                    <button className="x" onClick={() => delMerc(i, j)}
                            aria-label="Quitar mercado">×</button>}
                </div>

                <div className="row c2" style={{ marginBottom: 7 }}>
                  <select id={`mt${i}-${j}`} value={m.tipo}
                          onChange={e => upMerc(i, j, 'tipo', e.target.value)}>
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input value={m.seleccion} list="dl-selecciones"
                         onChange={e => upMerc(i, j, 'seleccion', e.target.value)}
                         placeholder={m.tipo === 'Otro' ? 'escríbelo entero' : 'la selección'}
                         aria-label="Selección" />
                </div>

                {MERCADOS[m.tipo].length > 0 && (
                  <div className="chips">
                    {MERCADOS[m.tipo].map(op => (
                      <button key={op}
                              className={`chip ${m.seleccion === op ? 'on' : ''}`}
                              onClick={() => upMerc(i, j, 'seleccion', op)}>
                        {op}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button className="mini" onClick={() => addMerc(i)}>
              + Otro mercado en este partido
            </button>

            <div className="row c2" style={{ marginTop: 11 }}>
              <div>
                <label htmlFor={`c${i}`}>
                  {l.mercados.length > 1 ? 'Cuota combinada' : 'Cuota'}
                </label>
                <input id={`c${i}`} inputMode="decimal" value={l.cuota}
                       onChange={e => up(i, 'cuota', e.target.value)} placeholder="1.85" />
              </div>
              <div>
                <label htmlFor={`x${i}`}>Tu probabilidad %</label>
                <input id={`x${i}`} inputMode="decimal" value={l.mi_prob}
                       onChange={e => up(i, 'mi_prob', e.target.value)} placeholder="opcional" />
              </div>
            </div>
            <div className="row">
              <div>
                <label htmlFor={`y${i}`}>Cuota de cierre</label>
                <input id={`y${i}`} inputMode="decimal" value={l.cuota_cierre}
                       onChange={e => up(i, 'cuota_cierre', e.target.value)}
                       placeholder="la cuota justo antes del pitazo" />
              </div>
            </div>
          </div>
        ))}

        {tipo === 'combinada' &&
          <button className="ghost" onClick={addLeg}>+ Añadir otro partido</button>}
      </div>

      {faltanCuota > 0 && (
        <div className="flag">
          <strong>{faltanCuota} {faltanCuota === 1 ? 'partido no tiene' : 'partidos no tienen'} cuota.</strong>{' '}
          Sin cuota no cuentan y no se guardarán.
        </div>
      )}

      {repetido && (
        <div className="flag">
          <strong>Has puesto el mismo partido dos veces.</strong> Si son mercados del mismo
          encuentro, van juntos en una sola selección con «+ Otro mercado en este partido»:
          los resultados están correlacionados y tratarlos como independientes infla la
          probabilidad real.
        </div>
      )}

      <div className="collapse">
        {sel.length === 0 ? (
          <div className="note" style={{ marginTop: 0 }}>
            Escribe las cuotas y aquí verás la probabilidad de que{' '}
            <strong>todo</strong> se cumpla.
          </div>
        ) : (
          <>
            <div className="top">
              <span className="eyebrow" style={{ margin: 0 }}>Probabilidad combinada</span>
              <span className="pct">{(prob * 100).toFixed(1)}%</span>
            </div>
            <div className="bars">
              {acum.map((v, i) => (
                <div className="bar" key={i} style={{ height: `${Math.max(v * 100, 3)}%` }}>
                  <span>{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="note">
              {sel.length === 1
                ? <>Apuesta simple. Cuota <strong>{total.toFixed(2)}</strong>.</>
                : <><strong>{sel.length} partidos con cuota.</strong> Cuota combinada {total.toFixed(2)}.
                    Fallar uno solo lo pierde todo, y cada partido extra suma el margen
                    de la casa otra vez.</>}
            </div>
          </>
        )}
      </div>

      {f && (
        <div className="flag">
          <strong>{f.ok ? 'Pasa los filtros.' : 'No pasa los filtros.'}</strong> {f.texto}
          {f.ok && banca > 0 &&
            <> · Stake sugerido (¼ Kelly): <strong>L{(banca * k).toFixed(2)}</strong></>}
        </div>
      )}

      <button className="act" onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar en el libro'}
      </button>
    </section>
  )
}
