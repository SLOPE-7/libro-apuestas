import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaTotal, probCombinada, filtro, kelly } from '../lib/calc'

/* Tipos de mercado con sus selecciones frecuentes como atajo.
   Si falta alguno, se elige "Otro" y se escribe libre. */
const MERCADOS = {
  '1x2':                 ['1', 'X', '2'],
  'Doble oportunidad':   ['1X', '12', 'X2'],
  'Apuesta sin empate':  ['1', '2'],
  'Total de goles':      ['Más de 1.5', 'Más de 2.5', 'Más de 3.5', 'Menos de 2.5', 'Menos de 3.5', 'Más de 1.25', 'Más de 0.5'],
  'Hándicap':            ['+0.5', '+1', '+1.5', '+2', '-0.5', '-1', '-1.5', '-2'],
  'Hándicap 1x2':        ['1 (1:0)', '1 (2:0)', '2 (0:1)', '2 (0:2)'],
  'Ambos marcan':        ['Sí', 'No'],
  'Se clasifica':        ['1', '2'],
  'Total individual':    ['Más de 0.5', 'Más de 1.5', 'Más de 2.5'],
  'Primera mitad':       ['1', 'X', '2', 'Más de 0.5', 'Más de 1.5', 'Menos de 1.5'],
  'Segunda mitad':       ['1', 'X', '2', 'Más de 0.5', 'Más de 1.5'],
  'Marca en ambas':      ['Sí', 'No'],
  'Gana alguna mitad':   ['Sí', 'No'],
  'Resultado exacto':    [],
  'Tiros de esquina':    ['Más de 8.5', 'Más de 9.5', 'Más de 10.5', 'Menos de 10.5'],
  'Tarjetas':            ['Más de 3.5', 'Más de 4.5', 'Menos de 4.5'],
  'Marcador correcto':   [],
  'Primer goleador':     [],
  'Otro':                []
}
const TIPOS = Object.keys(MERCADOS)

const mercadoVacio  = () => ({ tipo: '1x2', seleccion: '' })
const legVacia = () => ({
  local: '', visitante: '', mercados: [mercadoVacio()],
  cuota: '', mi_prob: '', cuota_cierre: ''
})

let ultimaCasa = null   // se recuerda durante la sesión

export default function NuevaApuesta({ casas, banca, onGuardado, toast }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tipo, setTipo]         = useState('simple')
  const [fecha, setFecha]       = useState(hoy)
  const [casaId, setCasaId]     = useState(ultimaCasa ?? casas[0]?.id ?? '')
  const [stake, setStake]       = useState('')
  const [cuotaCasa, setCuotaCasa] = useState('')
  const [legs, setLegs]         = useState([legVacia()])
  const [guardando, setGuardando] = useState(false)

  const [histEquipos, setHistEquipos]   = useState([])
  const [histSelecciones, setHistSel]   = useState([])

  useEffect(() => {
    let vivo = true
    supabase.from('selecciones')
      .select('partido, mercado')
      .order('id', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!vivo || !data) return
        const equipos = [...new Set(
          data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i)).map(t => t.trim()).filter(Boolean)
        )].sort()
        const sels = [...new Set(
          data.flatMap(s => (s.mercado || '').split(' · '))
              .map(t => (t.includes(':') ? t.split(':').slice(1).join(':') : t).trim())
              .filter(Boolean)
        )].slice(0, 50)
        setHistEquipos(equipos)
        setHistSel(sels)
      })
    return () => { vivo = false }
  }, [])

  const up = (i, k, v) => setLegs(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const upMerc = (i, j, k, v) =>
    setLegs(l => l.map((x, ix) => ix === i
      ? { ...x, mercados: x.mercados.map((m, jx) => (jx === j ? { ...m, [k]: v } : m)) }
      : x))
  const addMerc = i =>
    setLegs(l => l.map((x, ix) => (ix === i ? { ...x, mercados: [...x.mercados, mercadoVacio()] } : x)))
  const delMerc = (i, j) =>
    setLegs(l => l.map((x, ix) => ix === i
      ? { ...x, mercados: x.mercados.filter((_, jx) => jx !== j) } : x))

  const addLeg = () => setLegs(l => [...l, legVacia()])
  const delLeg = i => setLegs(l => l.filter((_, j) => j !== i))

  function cambiarTipo(t) {
    setTipo(t)
    if (t === 'simple') { setLegs(l => [l[0]]); setCuotaCasa('') }
    else if (legs.length === 1) setLegs(l => [...l, legVacia()])
  }
  function elegirCasa(id) { setCasaId(id); ultimaCasa = id }

  const nombre = l => [l.local.trim(), l.visitante.trim()].filter(Boolean).join(' vs ')

  const conCuota   = legs.filter(l => Number(l.cuota) > 1)
  const conEquipos = legs.filter(l => l.local.trim() && l.visitante.trim())
  const sinCuota   = conEquipos.filter(l => !(Number(l.cuota) > 1)).length

  const sel        = conCuota.map(l => ({ cuota: Number(l.cuota) }))
  const producto   = cuotaTotal(sel)
  const manual     = Number(cuotaCasa)
  const totalReal  = manual > 1 ? manual : producto
  const prob       = totalReal > 1 ? 1 / totalReal : 0
  const desvia     = manual > 1 && producto > 1 && Math.abs(manual / producto - 1) > 0.02

  const esSimple = tipo === 'simple' && Number(legs[0]?.cuota) > 1 && Number(legs[0]?.mi_prob) > 0
  const miProb   = esSimple ? Number(legs[0].mi_prob) / 100 : 0
  const f = esSimple ? filtro(miProb, Number(legs[0].cuota)) : null
  const k = esSimple ? kelly(miProb, Number(legs[0].cuota)) : 0

  const nombres  = legs.map(l => nombre(l).toLowerCase()).filter(Boolean)
  const repetido = tipo === 'combinada' && new Set(nombres).size < nombres.length

  const acum = useMemo(() => {
    const out = []; let p = 1
    sel.forEach(s => { p *= 1 / s.cuota; out.push(p) })
    return out
  }, [sel.map(s => s.cuota).join()])

  const textoMercado = m => m.tipo === 'Otro'
    ? m.seleccion.trim()
    : [m.tipo, m.seleccion.trim()].filter(Boolean).join(': ')

  async function guardar() {
    const s = Number(stake)
    const validas = legs.filter(l => nombre(l) && Number(l.cuota) > 1)
    if (!(s > 0))        return toast('Falta el monto apostado')
    if (!validas.length) return toast('Falta al menos un partido con su cuota')

    setGuardando(true)
    const { data: apuesta, error: e1 } = await supabase.from('apuestas')
      .insert({
        fecha, casa_id: casaId || null, stake: s,
        cuota_total: manual > 1 ? manual : null
      })
      .select().single()
    if (e1) { setGuardando(false); return toast('No se pudo guardar: ' + e1.message) }

    const { error: e2 } = await supabase.from('selecciones').insert(
      validas.map((l, i) => ({
        apuesta_id: apuesta.id,
        orden: i,
        partido: nombre(l),
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

    setStake(''); setCuotaCasa(''); setLegs([legVacia()]); setTipo('simple')
    toast('Guardada')
    onGuardado()
  }

  return (
    <section>
      <header className="sec-head">
        <h2>Registrar apuesta</h2>
        <p className="lede">
          Anota todas, incluidas las de impulso. Un registro incompleto te dirá
          que vas mejor de lo que vas.
        </p>
      </header>

      <datalist id="dl-equipos">
        {histEquipos.map(e => <option key={e} value={e} />)}
      </datalist>
      <datalist id="dl-selecciones">
        {histSelecciones.map(s => <option key={s} value={s} />)}
      </datalist>

      <div className="segmented">
        <button className={tipo === 'simple' ? 'on' : ''}
                onClick={() => cambiarTipo('simple')}>Simple</button>
        <button className={tipo === 'combinada' ? 'on' : ''}
                onClick={() => cambiarTipo('combinada')}>Combinada</button>
      </div>

      <div className="card">
        <div className="row c2">
          <div className="field">
            <label htmlFor="fecha">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="casa">Casa</label>
            <select id="casa" value={casaId} onChange={e => elegirCasa(e.target.value)}>
              {casas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="stake">Monto apostado</label>
          <div className="con-sufijo">
            <input id="stake" inputMode="decimal" value={stake}
                   onChange={e => setStake(e.target.value)} placeholder="0.00" />
            <span className="sufijo">L</span>
          </div>
        </div>
      </div>

      <div className="sec-label">
        <span className="eyebrow">
          {tipo === 'simple' ? 'La selección' : 'Selecciones'}
        </span>
        {tipo === 'combinada' && <span className="contador">{legs.length}</span>}
      </div>

      <div className="card">
        {legs.map((l, i) => (
          <div className="leg" key={i}>
            {tipo === 'combinada' && (
              <div className="leg-head">
                <span className="leg-n">Partido {i + 1}</span>
                {legs.length > 1 &&
                  <button className="x" onClick={() => delLeg(i)}
                          aria-label={`Quitar partido ${i + 1}`}>×</button>}
              </div>
            )}

            <div className="enfrenta">
              <div className="field">
                <label htmlFor={`loc${i}`}>Local</label>
                <input id={`loc${i}`} value={l.local} list="dl-equipos"
                       onChange={e => up(i, 'local', e.target.value)} placeholder="Celtic" />
              </div>
              <span className="vs" aria-hidden="true">vs</span>
              <div className="field">
                <label htmlFor={`vis${i}`}>Visitante</label>
                <input id={`vis${i}`} value={l.visitante} list="dl-equipos"
                       onChange={e => up(i, 'visitante', e.target.value)} placeholder="LASK" />
              </div>
            </div>

            {l.mercados.map((m, j) => (
              <div className="merc" key={j}>
                <div className="merc-head">
                  <span className="merc-n">
                    {j === 0 ? 'Mercado' : `Mercado ${j + 1} · mismo partido`}
                  </span>
                  {l.mercados.length > 1 &&
                    <button className="x" onClick={() => delMerc(i, j)}
                            aria-label="Quitar mercado">×</button>}
                </div>
                <div className="row c2 tight">
                  <select value={m.tipo} aria-label="Tipo de mercado"
                          onChange={e => upMerc(i, j, 'tipo', e.target.value)}>
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input value={m.seleccion} list="dl-selecciones" aria-label="Selección"
                         onChange={e => upMerc(i, j, 'seleccion', e.target.value)}
                         placeholder={m.tipo === 'Otro' ? 'escríbelo entero' : 'la selección'} />
                </div>
                {MERCADOS[m.tipo].length > 0 && (
                  <div className="chips">
                    {MERCADOS[m.tipo].map(op => (
                      <button key={op} className={`chip ${m.seleccion === op ? 'on' : ''}`}
                              onClick={() => upMerc(i, j, 'seleccion', op)}>{op}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button className="mini" onClick={() => addMerc(i)}>
              + Otro mercado en este partido
            </button>

            <div className="row c2" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor={`c${i}`}>
                  {l.mercados.length > 1 ? 'Cuota combinada' : 'Cuota'}
                </label>
                <input id={`c${i}`} inputMode="decimal" value={l.cuota}
                       onChange={e => up(i, 'cuota', e.target.value)} placeholder="1.85" />
              </div>
              <div className="field">
                <label htmlFor={`y${i}`}>Cuota de cierre</label>
                <input id={`y${i}`} inputMode="decimal" value={l.cuota_cierre}
                       onChange={e => up(i, 'cuota_cierre', e.target.value)} placeholder="opcional" />
              </div>
            </div>
            {tipo === 'simple' && (
              <div className="field">
                <label htmlFor={`x${i}`}>Tu probabilidad estimada</label>
                <div className="con-sufijo">
                  <input id={`x${i}`} inputMode="decimal" value={l.mi_prob}
                         onChange={e => up(i, 'mi_prob', e.target.value)}
                         placeholder="antes de mirar la cuota" />
                  <span className="sufijo">%</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {tipo === 'combinada' &&
          <button className="ghost" onClick={addLeg}>+ Añadir otro partido</button>}
      </div>

      {tipo === 'combinada' && (
        <div className="card">
          <div className="field">
            <label htmlFor="cuota-casa">Cuota total según la casa</label>
            <input id="cuota-casa" inputMode="decimal" value={cuotaCasa}
                   onChange={e => setCuotaCasa(e.target.value)}
                   placeholder={producto > 1 ? producto.toFixed(2) : 'opcional'} />
          </div>
          <p className="ayuda">
            Las casas redondean cada pata, así que el total del boleto casi nunca
            coincide con multiplicar las cuotas. Copia aquí el número exacto de tu
            cupón y los cálculos usarán ese.
          </p>
        </div>
      )}

      {sinCuota > 0 && (
        <div className="flag">
          <strong>{sinCuota} {sinCuota === 1 ? 'partido no tiene' : 'partidos no tienen'} cuota.</strong>{' '}
          Sin cuota no cuentan y no se guardarán.
        </div>
      )}

      {repetido && (
        <div className="flag">
          <strong>Has puesto el mismo partido dos veces.</strong> Si son mercados del mismo
          encuentro, van juntos con «+ Otro mercado en este partido»: los resultados están
          correlacionados y tratarlos como independientes infla la probabilidad real.
        </div>
      )}

      <div className="medidor">
        {sel.length === 0 ? (
          <p className="medidor-vacio">
            Escribe las cuotas y aquí verás la probabilidad de que <strong>todo</strong> se cumpla.
          </p>
        ) : (
          <>
            <div className="medidor-top">
              <span className="eyebrow">Probabilidad combinada</span>
              <span className="medidor-pct">{(prob * 100).toFixed(1)}<i>%</i></span>
            </div>
            <div className="bars">
              {acum.map((v, i) => (
                <div className="bar" key={i} style={{ height: `${Math.max(v * 100, 2)}%` }}>
                  <span>{i + 1}</span>
                </div>
              ))}
            </div>
            <p className="medidor-nota">
              {sel.length === 1
                ? <>Apuesta simple. Cuota <b>{totalReal.toFixed(2)}</b>.</>
                : <><b>{sel.length} partidos.</b> Cuota total <b>{totalReal.toFixed(2)}</b>.
                    Fallar uno solo lo pierde todo, y cada partido extra suma el margen
                    de la casa otra vez.</>}
              {desvia && <> El producto de las cuotas daría {producto.toFixed(2)}.</>}
            </p>
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
