import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaTotal, probCombinada, filtro, kelly } from '../lib/calc'

const legVacia = () => ({ partido: '', mercado: '', cuota: '', mi_prob: '', cuota_cierre: '' })

export default function NuevaApuesta({ casas, banca, onGuardado, toast }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [casaId, setCasaId] = useState(casas[0]?.id ?? '')
  const [stake, setStake] = useState('')
  const [legs, setLegs] = useState([legVacia()])
  const [guardando, setGuardando] = useState(false)

  const up = (i, k, v) => setLegs(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const add = () => setLegs(l => [...l, legVacia()])
  const del = i => setLegs(l => l.filter((_, j) => j !== i))

  const sel = legs.map(l => ({ cuota: Number(l.cuota) })).filter(s => s.cuota > 1)
  const total = cuotaTotal(sel)
  const prob = probCombinada(sel)

  // El filtro y Kelly solo tienen sentido en apuestas simples con probabilidad estimada
  const simple = legs.length === 1 && Number(legs[0].cuota) > 1 && Number(legs[0].mi_prob) > 0
  const miProb = simple ? Number(legs[0].mi_prob) / 100 : 0
  const f = simple ? filtro(miProb, Number(legs[0].cuota)) : null
  const k = simple ? kelly(miProb, Number(legs[0].cuota)) : 0

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
        mercado: l.mercado.trim() || null,
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

    setStake(''); setLegs([legVacia()])
    toast('Guardada')
    onGuardado()
  }

  // Probabilidad acumulada tras cada selección: el medidor de colapso
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

      <span className="eyebrow">Selecciones</span>
      <div className="card">
        {legs.map((l, i) => (
          <div className="leg" key={i}>
            <div className="leg-head">
              <span className="leg-n">SELECCIÓN {i + 1}</span>
              {legs.length > 1 &&
                <button className="x" onClick={() => del(i)} aria-label={`Quitar selección ${i + 1}`}>×</button>}
            </div>
            <div className="row">
              <div>
                <label htmlFor={`p${i}`}>Partido</label>
                <input id={`p${i}`} value={l.partido}
                       onChange={e => up(i, 'partido', e.target.value)} placeholder="Celtic vs LASK" />
              </div>
            </div>
            <div className="row c2">
              <div>
                <label htmlFor={`m${i}`}>Mercado</label>
                <input id={`m${i}`} value={l.mercado}
                       onChange={e => up(i, 'mercado', e.target.value)} placeholder="Más de 2.5" />
              </div>
              <div>
                <label htmlFor={`c${i}`}>Cuota</label>
                <input id={`c${i}`} inputMode="decimal" value={l.cuota}
                       onChange={e => up(i, 'cuota', e.target.value)} placeholder="1.85" />
              </div>
            </div>
            <div className="row c2">
              <div>
                <label htmlFor={`mp${i}`}>Tu probabilidad %</label>
                <input id={`mp${i}`} inputMode="decimal" value={l.mi_prob}
                       onChange={e => up(i, 'mi_prob', e.target.value)} placeholder="42" />
              </div>
              <div>
                <label htmlFor={`cc${i}`}>Cuota de cierre</label>
                <input id={`cc${i}`} inputMode="decimal" value={l.cuota_cierre}
                       onChange={e => up(i, 'cuota_cierre', e.target.value)} placeholder="opcional" />
              </div>
            </div>
          </div>
        ))}
        <button className="ghost" onClick={add}>+ Añadir selección</button>
      </div>

      <div className="collapse">
        {sel.length === 0 ? (
          <div className="note" style={{ marginTop: 0 }}>
            Escribe las cuotas y aquí verás la probabilidad de que{' '}
            <strong>todas</strong> se cumplan.
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
                ? <>Selección simple. Cuota <strong>{total.toFixed(2)}</strong>.</>
                : <><strong>{sel.length} selecciones.</strong> Cuota combinada {total.toFixed(2)}.
                    Fallar una sola lo pierde todo, y cada selección extra suma el margen
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
