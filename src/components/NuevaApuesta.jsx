import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaTotal, probCombinada, filtro, kelly } from '../lib/calc'

const legVacia = () => ({ partido: '', mercados: [''], cuota: '', mi_prob: '', cuota_cierre: '' })

export default function NuevaApuesta({ casas, banca, onGuardado, toast }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tipo, setTipo] = useState('simple')          // 'simple' | 'combinada'
  const [fecha, setFecha] = useState(hoy)
  const [casaId, setCasaId] = useState(casas[0]?.id ?? '')
  const [stake, setStake] = useState('')
  const [legs, setLegs] = useState([legVacia()])
  const [guardando, setGuardando] = useState(false)

  const up = (i, k, v) => setLegs(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const upMercado = (i, j, v) =>
    setLegs(l => l.map((x, ix) =>
      ix === i ? { ...x, mercados: x.mercados.map((m, jx) => (jx === j ? v : m)) } : x))
  const addMercado = i =>
    setLegs(l => l.map((x, ix) => (ix === i ? { ...x, mercados: [...x.mercados, ''] } : x)))
  const delMercado = (i, j) =>
    setLegs(l => l.map((x, ix) =>
      ix === i ? { ...x, mercados: x.mercados.filter((_, jx) => jx !== j) } : x))

  const addLeg = () => setLegs(l => [...l, legVacia()])
  const delLeg = i => setLegs(l => l.filter((_, j) => j !== i))

  function cambiarTipo(t) {
    setTipo(t)
    if (t === 'simple') setLegs(l => [l[0]])           // se queda solo la primera
    else if (legs.length === 1) setLegs(l => [...l, legVacia()])
  }

  const sel = legs.map(l => ({ cuota: Number(l.cuota) })).filter(s => s.cuota > 1)
  const total = cuotaTotal(sel)
  const prob = probCombinada(sel)

  // Filtro y Kelly solo aplican a simples con probabilidad estimada
  const esSimple = tipo === 'simple' && Number(legs[0]?.cuota) > 1 && Number(legs[0]?.mi_prob) > 0
  const miProb = esSimple ? Number(legs[0].mi_prob) / 100 : 0
  const f = esSimple ? filtro(miProb, Number(legs[0].cuota)) : null
  const k = esSimple ? kelly(miProb, Number(legs[0].cuota)) : 0

  // Aviso si repites partido en una combinada
  const nombres = legs.map(l => l.partido.trim().toLowerCase()).filter(Boolean)
  const repetido = tipo === 'combinada' && new Set(nombres).size < nombres.length

  async function guardar() {
    const s = Number(stake)
    const validas = legs.filter(l => l.partido.trim() && Number(l.cuota) > 1)
    if (!(s > 0)) return toast('Falta el monto apostado')
    if (!validas.length) return toast('Falta al menos un partido con su cuota')

    setGuardando(true)
    const { data: apuesta, error: e1 } = await supabase
      .from('apuestas')
      .insert({ fecha, casa_id: casaId || null, stake: s })
      .select()
      .single()

    if (e1) { setGuardando(false); return toast('No se pudo guardar: ' + e1.message) }

    const { error: e2 } = await supabase.from('selecciones').insert(
      validas.map((l, i) => ({
        apuesta_id: apuesta.id,
        orden: i,
        partido: l.partido.trim(),
        mercado: l.mercados.map(m => m.trim()).filter(Boolean).join(' · ') || null,
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

      {/* selector de tipo */}
      <div className="tipos">
        <button
          className={`tipo ${tipo === 'simple' ? 'on' : ''}`}
          onClick={() => cambiarTipo('simple')}>
          Simple
        </button>
        <button
          className={`tipo ${tipo === 'combinada' ? 'on' : ''}`}
          onClick={() => cambiarTipo('combinada')}>
          Combinada
        </button>
      </div>

      <div className="card">
        <div className="row c2">
          <div>
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label htmlFor="casa">Casa</label>
            <select id="casa" value={casaId} onChange={e => setCasaId(e.target.value)}>
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
                <input id={`p${i}`} value={l.partido}
                       onChange={e => up(i, 'partido', e.target.value)}
                       placeholder="Celtic vs LASK" />
              </div>
            </div>

            {l.mercados.map((m, j) => (
              <div className="row" key={j}>
                <div>
                  <label htmlFor={`m${i}-${j}`}>
                    {j === 0 ? 'Mercado' : `Mercado ${j + 1} (mismo partido)`}
                  </label>
                  <div className="con-x">
                    <input id={`m${i}-${j}`} value={m}
                           onChange={e => upMercado(i, j, e.target.value)}
                           placeholder={j === 0 ? 'Más de 2.5' : 'Ambos marcan'} />
                    {l.mercados.length > 1 &&
                      <button className="x" onClick={() => delMercado(i, j)}
                              aria-label="Quitar mercado">×</button>}
                  </div>
                </div>
              </div>
            ))}

            <button className="mini" onClick={() => addMercado(i)}>
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
                : <><strong>{sel.length} partidos.</strong> Cuota combinada {total.toFixed(2)}.
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
