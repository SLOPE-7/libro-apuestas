import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaTotal, filtro, kelly, evaluarCombinada, REGLAS } from '../lib/calc'
import { parseCupon } from '../lib/parseCupon'
import AutoInput from './AutoInput'

const BASE = {
  '1x2':                ['1', 'X', '2'],
  'Doble oportunidad':  ['1X', '12', 'X2'],
  'Apuesta sin empate': ['1', '2'],
  'Total de goles':     ['Más de 1.5', 'Más de 1.75', 'Más de 2.5', 'Menos de 2.5', 'Más de 1.25'],
  'Hándicap':           ['+0.5', '+1', '+1.5', '-0.5', '-1', '-1.5'],
  'Hándicap 1x2':       ['1 (1:0)', '1 (2:0)', '2 (0:1)', '2 (0:2)'],
  'Ambos equipos marcan': ['Sí', 'No'],
  'Se clasifica':       ['1', '2'],
  'Total individual':   ['Más de 0.5', 'Más de 1.5', 'Más de 2.5'],
  '1ª Mitad - total':   ['Más de 0.5', 'Más de 1.5', 'Menos de 1.5'],
  '1ª Mitad - doble oportunidad': [],
  'Marca en ambos tiempos': ['Sí', 'No'],
  'Gana alguna mitad':  ['Sí', 'No'],
  'Total Tiros De Esquina': ['Más de 8.5', 'Más de 9.5', 'Menos de 10.5'],
  'Total de tarjetas':  ['Más de 3.5', 'Menos de 4.5'],
  'Resultado exacto':   [],
  'Otro':               []
}

const mercadoVacio = () => ({ tipo: '1x2', seleccion: '' })
const legVacia = () => ({
  local: '', visitante: '', mercados: [mercadoVacio()],
  cuota: '', mi_prob: '', cuota_cierre: ''
})

let ultimaCasa = null

export default function NuevaApuesta({ casas, banca, onGuardado, toast }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tipo, setTipo]           = useState('simple')
  const [fecha, setFecha]         = useState(hoy)
  const [casaId, setCasaId]       = useState(ultimaCasa ?? casas[0]?.id ?? '')
  const [stake, setStake]         = useState('')
  const [cuotaCasa, setCuotaCasa] = useState('')
  const [legs, setLegs]           = useState([legVacia()])
  const [guardando, setGuardando] = useState(false)
  /* Cuando la apuesta no pasa las reglas, guardar exige un segundo toque.
     La regla no prohíbe: obliga a decidirlo a conciencia. */
  const [forzar, setForzar]       = useState(false)

  const [pegando, setPegando] = useState(false)
  const [cupon, setCupon]     = useState('')

  const [histEquipos, setHistEquipos] = useState([])
  const [histTipos, setHistTipos]     = useState([])
  const [histSel, setHistSel]         = useState([])

  useEffect(() => {
    let vivo = true
    supabase.from('selecciones')
      .select('partido, mercado')
      .order('id', { ascending: false })
      .limit(600)
      .then(({ data }) => {
        if (!vivo || !data) return
        setHistEquipos([...new Set(
          data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i))
              .map(t => t.trim()).filter(Boolean)
        )].sort())
        const partes = data.flatMap(s => (s.mercado || '').split(' · ')).filter(Boolean)
        setHistTipos([...new Set(
          partes.map(t => (t.includes(':') ? t.split(':')[0] : '').trim()).filter(Boolean)
        )].sort())
        setHistSel([...new Set(
          partes.map(t => (t.includes(':') ? t.split(':').slice(1).join(':') : t).trim())
                .filter(Boolean)
        )])
      })
    return () => { vivo = false }
  }, [])

  const TIPOS = useMemo(
    () => [...new Set([...Object.keys(BASE).filter(t => t !== 'Otro'), ...histTipos, 'Otro'])],
    [histTipos]
  )
  const atajos = t => BASE[t] ?? []

  const up = (i, k, v) => setLegs(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const upMerc = (i, j, k, v) =>
    setLegs(l => l.map((x, ix) => ix === i
      ? { ...x, mercados: x.mercados.map((m, jx) => (jx === j ? { ...m, [k]: v } : m)) } : x))
  const addMerc = i =>
    setLegs(l => l.map((x, ix) => ix === i ? { ...x, mercados: [...x.mercados, mercadoVacio()] } : x))
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

  function importar() {
    const r = parseCupon(cupon)
    if (!r.legs.length) return toast('No reconocí ninguna selección en ese texto')

    setLegs(r.legs.map(l => ({
      local: l.local,
      visitante: l.visitante,
      mercados: l.mercados.map(m => ({ tipo: m.tipo || 'Otro', seleccion: m.seleccion || '' })),
      cuota: l.cuota != null ? String(l.cuota) : '',
      mi_prob: '',
      cuota_cierre: ''
    })))
    if (r.stake != null) setStake(String(r.stake))
    if (r.total != null) setCuotaCasa(String(r.total))
    setTipo(r.legs.length > 1 ? 'combinada' : 'simple')
    setPegando(false)
    setCupon('')

    const sinCuotaLeidas = r.legs.filter(l => l.cuota == null).length
    const deducidas = r.legs.filter(l => l.deducida).length
    let msg = `${r.legs.length} ${r.legs.length === 1 ? 'selección leída' : 'selecciones leídas'}`
    if (sinCuotaLeidas) msg += ` · ${sinCuotaLeidas} sin cuota`
    if (deducidas) msg += ` · ${deducidas} cuota deducida del total`
    toast(msg + ' — revísalas')
  }

  const nombre = l => [l.local.trim(), l.visitante.trim()].filter(Boolean).join(' vs ')

  const conCuota   = legs.filter(l => Number(l.cuota) > 1)
  const conEquipos = legs.filter(l => l.local.trim() || l.visitante.trim())
  const sinCuota   = conEquipos.filter(l => !(Number(l.cuota) > 1)).length

  const sel       = conCuota.map(l => ({ cuota: Number(l.cuota) }))
  const producto  = cuotaTotal(sel)
  const manual    = Number(cuotaCasa)
  const totalReal = manual > 1 ? manual : producto
  const prob      = totalReal > 1 ? 1 / totalReal : 0
  const desvia    = manual > 1 && producto > 1 && Math.abs(manual / producto - 1) > 0.02

  const esSimple = tipo === 'simple' && Number(legs[0]?.cuota) > 1 && Number(legs[0]?.mi_prob) > 0
  const miProb   = esSimple ? Number(legs[0].mi_prob) / 100 : 0
  const f = esSimple ? filtro(miProb, Number(legs[0].cuota)) : null
  const k = esSimple ? kelly(miProb, Number(legs[0].cuota)) : 0

  /* El veredicto de la combinada. Antes esto no existía: filtro() y kelly()
     se apagaban solos en cuanto había más de una pata, o sea justo donde
     el margen se acumula y la varianza se dispara. */
  const ev = tipo === 'combinada'
    ? evaluarCombinada(legs, manual > 1 ? manual : null)
    : null

  const faltanProbs = ev && !ev.completa
  const bloquea = (f && !f.ok) || (ev && ev.juzgable && !ev.ok)

  /* Cualquier cambio real invalida un "guardar igual" ya concedido. */
  const firma = legs.map(l => `${l.cuota}|${l.mi_prob}|${l.mercados.length}`).join(';')
             + `|${cuotaCasa}|${tipo}`
  useEffect(() => { setForzar(false) }, [firma])

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
    if (!casaId)         return toast('Elige la casa antes de guardar')
    if (!(s > 0))        return toast('Falta el monto apostado')
    if (!validas.length) return toast('Falta al menos un partido con su cuota')

    if (bloquea && !forzar) {
      setForzar(true)
      return toast('No pasa tus reglas. Toca guardar otra vez si aun así la quieres')
    }

    setGuardando(true)
    const { data: apuesta, error: e1 } = await supabase.from('apuestas')
      .insert({ fecha, casa_id: casaId, stake: s, cuota_total: manual > 1 ? manual : null })
      .select().single()
    if (e1) { setGuardando(false); return toast('No se pudo guardar: ' + e1.message) }

    const { error: e2 } = await supabase.from('selecciones').insert(
      validas.map((l, i) => ({
        apuesta_id: apuesta.id,
        orden: i,
        partido: nombre(l),
        mercado: l.mercados.map(textoMercado).filter(Boolean).join(' · ') || null,
        mercados: l.mercados.length > 1
          ? l.mercados.map(textoMercado).filter(Boolean).map(t => ({ t, e: 'pendiente' }))
          : null,
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

    setStake(''); setCuotaCasa(''); setLegs([legVacia()]); setTipo('simple'); setForzar(false)
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

      {!pegando ? (
        <button className="ghost" style={{ marginBottom: 16 }} onClick={() => setPegando(true)}>
          ⎘ Pegar cupón de la casa
        </button>
      ) : (
        <div className="card pegar">
          <div className="field">
            <label htmlFor="cupon">Pega aquí el texto del cupón</label>
            <textarea id="cupon" rows={7} value={cupon}
                      onChange={e => setCupon(e.target.value)}
                      placeholder={'Equipo A vs. Equipo B\nApuesta sin empate: 1   Cuotas: 1.25\n…'} />
          </div>
          <p className="ayuda">
            En la casa, abre el cupón, selecciona el texto y cópialo. No sirve una captura
            de pantalla: tiene que ser el texto. Al copiar desde el móvil las tablas se
            rompen y algún número puede perderse, así que <strong>revisa cada línea</strong>
            antes de guardar.
          </p>
          <div className="row c2" style={{ marginTop: 12 }}>
            <button className="act" onClick={importar}>Leer cupón</button>
            <button className="ghost" onClick={() => { setPegando(false); setCupon('') }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
              <option value="">— elige casa —</option>
              {casas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="sec-label">
        <span className="eyebrow">{tipo === 'simple' ? 'La selección' : 'Selecciones'}</span>
        {tipo === 'combinada' && <span className="contador">{legs.length}</span>}
      </div>

      <div className="card">
        {legs.map((l, i) => {
          const floja = ev?.flojas?.includes(i)
          return (
            <div className={`leg ${floja ? 'leg-floja' : ''}`} key={i}>
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
                  <AutoInput id={`loc${i}`} value={l.local} opciones={histEquipos}
                             onChange={v => up(i, 'local', v)} placeholder="Equipo A" />
                </div>
                <span className="vs" aria-hidden="true">vs</span>
                <div className="field">
                  <label htmlFor={`vis${i}`}>Visitante</label>
                  <AutoInput id={`vis${i}`} value={l.visitante} opciones={histEquipos}
                             onChange={v => up(i, 'visitante', v)} placeholder="Equipo B" />
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

                  <div className="row tight">
                    <AutoInput value={m.tipo} opciones={TIPOS} ariaLabel="Tipo de mercado"
                               onChange={v => upMerc(i, j, 'tipo', v)}
                               placeholder="Total de goles" />
                  </div>
                  <div className="row tight">
                    <AutoInput value={m.seleccion} opciones={histSel} ariaLabel="Selección"
                               onChange={v => upMerc(i, j, 'seleccion', v)}
                               placeholder="Más de 2.5" />
                  </div>

                  {atajos(m.tipo).length > 0 && (
                    <div className="chips">
                      {atajos(m.tipo).map(op => (
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

              {/* La probabilidad va antes que la cuota a propósito: si ya viste
                  el precio, tu estimación deja de ser tuya. */}
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor={`x${i}`}>
                  {tipo === 'simple'
                    ? 'Tu probabilidad estimada'
                    : `Tu probabilidad para el partido ${i + 1}`}
                </label>
                <div className="con-sufijo">
                  <input id={`x${i}`} inputMode="decimal" value={l.mi_prob}
                         onChange={e => up(i, 'mi_prob', e.target.value)}
                         placeholder="antes de mirar la cuota" />
                  <span className="sufijo">%</span>
                </div>
              </div>

              <div className="row c2">
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

              {floja && (
                <p className="ayuda" style={{ color: 'var(--loss)' }}>
                  Esta pata no pasaría los filtros como apuesta simple. Metida en una
                  combinada no mejora: solo se le pega a las demás.
                </p>
              )}
            </div>
          )
        })}

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
            Las casas redondean cada pata, así que el total del boleto casi nunca coincide
            con multiplicar las cuotas. Copia aquí el número exacto de tu cupón y los
            cálculos usarán ese.
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

            {/* Ese porcentaje es el de la casa, y lleva su comisión dentro.
                Enseñar el descuento es el punto entero de la pantalla. */}
            {ev && ev.n > 1 && (
              <p className="medidor-nota" style={{ marginTop: 8 }}>
                Ese <b>{(ev.probCasa * 100).toFixed(1)}%</b> es el que te paga la casa, con su
                comisión dentro. Descontando alrededor de un {(REGLAS.margenPorPata * 100).toFixed(0)}%
                por pata, la probabilidad honesta ronda el <b>{(ev.probHonesta * 100).toFixed(1)}%</b>:
                estás pagando un <b>{(ev.margen * 100).toFixed(1)}%</b> de margen acumulado antes
                de que ruede el balón.
              </p>
            )}
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

      {ev && faltanProbs && ev.patas <= REGLAS.patasMax && (
        <div className="flag">
          <strong>Faltan tus probabilidades.</strong> Sin estimar cada partido no se puede
          saber si esta combinada vale el precio. Es el único dato que la app no puede
          sacar sola.
        </div>
      )}

      {ev && ev.juzgable && (
        <div className="flag">
          <strong>{ev.ok ? 'La combinada pasa tus reglas.' : 'No pasa tus reglas.'}</strong>{' '}
          {ev.ok
            ? <>Edge del {(ev.edgeTotal * 100).toFixed(1)}%
                {banca > 0 &&
                  <> · Stake sugerido: <strong>L{(banca * ev.kelly).toFixed(2)}</strong> (tope
                     del {(REGLAS.topeParlay * 100).toFixed(0)}% de banca, más bajo que en
                     simples porque una combinada falla entera)</>}.</>
            : <>{ev.motivos.join(' · ')}.</>}
        </div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="stake">Monto apostado</label>
          <div className="con-sufijo">
            <input id="stake" inputMode="decimal" value={stake}
                   onChange={e => setStake(e.target.value)} placeholder="0.00" />
            <span className="sufijo">L</span>
          </div>
        </div>
        {banca > 0 && Number(stake) > banca * 0.05 && (
          <p className="ayuda" style={{ color: 'var(--loss)' }}>
            Son {((Number(stake) / banca) * 100).toFixed(1)}% de tu banca. Por encima del 3%
            una racha normal de derrotas te deja sin margen para seguir.
          </p>
        )}
      </div>

      {forzar && (
        <div className="flag">
          <strong>Vas a registrarla igual.</strong> Está bien, pero queda anotada como lo
          que es. Toca guardar otra vez para confirmar.
        </div>
      )}

      <button className={`act ${bloquea ? 'act-riesgo' : ''}`}
              onClick={guardar} disabled={guardando}>
        {guardando
          ? 'Guardando…'
          : bloquea && forzar
            ? 'Guardar de todos modos'
            : 'Guardar en el libro'}
      </button>
    </section>
  )
}
