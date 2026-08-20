import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { comparar, costeMargen } from '../lib/margen'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v || 0).toFixed(2)

const mercadoVacio = () => ({ nombre: '', cuotas: ['', ''] })

export default function Analisis({ toast }) {
  const [vista, setVista] = useState('margen')

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

  const [registros, setRegistros] = useState([])
  const [partido, setPartido] = useState('')
  const [competicion, setCompeticion] = useState('')
  const [pidiendo, setPidiendo] = useState(false)
  const [respuesta, setRespuesta] = useState(null)

  useEffect(() => {
    supabase.from('sombra').select('*').order('creado_en', { ascending: false }).limit(50)
      .then(({ data }) => setRegistros(data || []))
  }, [])

  async function pedirAnalisis() {
    if (!partido.trim()) return toast('Escribe el partido')
    setPidiendo(true); setRespuesta(null)
    try {
      const r = await fetch('/api/analizar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partido: partido.trim(), competicion: competicion.trim() })
      })
      const data = await r.json()
      setPidiendo(false)
      if (data.error) return toast(data.error)
      setRespuesta(data)
    } catch (e) {
      setPidiendo(false)
      toast('No se pudo conectar con el análisis')
    }
  }

  async function guardarSombra(m) {
    const { error } = await supabase.from('sombra').insert({
      partido: partido.trim(),
      mercado_ia: m.mercado,
      prob_ia: m.probabilidad,
      confianza: respuesta.confianza ?? null,
      razonamiento: [respuesta.datos, m.razon].filter(Boolean).join(' — ').slice(0, 2000)
    })
    if (error) return toast('No se pudo guardar: ' + error.message)
    toast('Guardado en el registro sombra')
    const { data } = await supabase.from('sombra')
      .select('*').order('creado_en', { ascending: false }).limit(50)
    setRegistros(data || [])
  }

  async function marcarSombra(id, acerto) {
    const { error } = await supabase.from('sombra')
      .update({ acerto_ia: acerto }).eq('id', id)
    if (error) return toast('No se pudo marcar')
    setRegistros(rs => rs.map(r => (r.id === id ? { ...r, acerto_ia: acerto } : r)))
  }

  const resueltas = registros.filter(r => r.acerto_ia !== null && r.acerto_ia !== undefined)
  const aciertos = resueltas.filter(r => r.acerto_ia).length
  const probMedia = resueltas.length
    ? resueltas.reduce((a, r) => a + Number(r.prob_ia || 0), 0) / resueltas.length
    : null
  const tasaReal = resueltas.length ? aciertos / resueltas.length : null

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
            casa y sale de tu bolsillo antes de que ruede el balón. No es una estimación:
            es aritmética sobre las cuotas publicadas.
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
                {mercados.length > 1 &&
                  <button className="x" onClick={() => delMercado(i)}>×</button>}
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
                    {m.cuotas.length > 2 &&
                      <button className="x" onClick={() => delCuota(i, j)}>×</button>}
                  </div>
                ))}
              </div>
              <button className="mini" onClick={() => addCuota(i)}>+ Otra opción</button>
              <p className="ayuda">
                Tienen que ser <strong>todas</strong> las opciones del mercado: las tres del
                1X2, el más y el menos de un total, el sí y el no de ambos marcan. Con una sola
                cuota no se puede calcular nada.
              </p>
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
                Para tener ventaja, tu propia estimación tiene que superar ese número, no el
                de la cuota.
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
            acertaba más que el mercado o no. Hasta entonces no le des ningún peso.
          </div>

          {resueltas.length > 0 && (
            <div className="figs">
              <div className="fig">
                <div className="k">Predicciones resueltas</div>
                <div className="v">{resueltas.length}</div>
              </div>
              <div className="fig">
                <div className="k">Acertó</div>
                <div className="v">{pct(tasaReal)}</div>
              </div>
              <div className="fig">
                <div className="k">Decía que acertaría</div>
                <div className="v">{pct(probMedia)}</div>
              </div>
              <div className="fig">
                <div className="k">Desviación</div>
                <div className={`v ${tasaReal - probMedia < -0.05 ? 'neg' : ''}`}>
                  {probMedia != null ? pct(tasaReal - probMedia) : '—'}
                </div>
              </div>
            </div>
          )}

          {resueltas.length >= 20 && (
            <div className="verdict">
              {Math.abs(tasaReal - probMedia) < 0.05
                ? 'Las estimaciones van bien calibradas: acierta más o menos lo que dice que acertará. Eso todavía no significa que le gane al mercado.'
                : tasaReal < probMedia
                  ? 'Está sobreestimando: dice acertar más de lo que acierta. Es el fallo típico de estos análisis.'
                  : 'Está infraestimando: acierta más de lo que anuncia.'}
              {resueltas.length < 50 && ' Aún faltan predicciones para concluir.'}
            </div>
          )}

          <div className="card">
            <div className="row c2">
              <div className="field">
                <label htmlFor="pa">Partido</label>
                <input id="pa" value={partido} onChange={e => setPartido(e.target.value)}
                       placeholder="Celtic vs LASK" />
              </div>
              <div className="field">
                <label htmlFor="co">Competición</label>
                <input id="co" value={competicion} onChange={e => setCompeticion(e.target.value)}
                       placeholder="Champions League" />
              </div>
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
                  <div style={{ marginTop: 8 }}>
                    <button className="tiny" onClick={() => guardarSombra(m)}>
                      Guardar en sombra
                    </button>
                  </div>
                </div>
              ))}

              {respuesta.aviso && (
                <div className="flag" style={{ marginTop: 12 }}>
                  <strong>Riesgo del análisis.</strong> {respuesta.aviso}
                </div>
              )}
              {respuesta.crudo && <p className="ayuda">{respuesta.crudo}</p>}
            </div>
          )}

          {registros.length > 0 && (
            <>
              <span className="eyebrow">Registro sombra</span>
              {registros.map(r => (
                <div className="card" key={r.id} style={{ marginBottom: 10 }}>
                  <div className="sel-row">
                    <div className="sel-txt">
                      <b>{r.partido}</b>
                      <em>{r.mercado_ia} · decía {pct(Number(r.prob_ia))}</em>
                    </div>
                    <span className="odd">{String(r.creado_en).slice(0, 10)}</span>
                  </div>
                  <div className="marks">
                    <button className={`tiny win ${r.acerto_ia === true ? 'on' : ''}`}
                            onClick={() => marcarSombra(r.id, true)}>✓ acertó</button>
                    <button className={`tiny lose ${r.acerto_ia === false ? 'on' : ''}`}
                            onClick={() => marcarSombra(r.id, false)}>✗ falló</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  )
}
