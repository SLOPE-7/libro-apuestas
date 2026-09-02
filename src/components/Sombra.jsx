import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CampoLento from './CampoLento'
import { normalizar } from '../lib/mercados'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')

export default function Sombra({ toast }) {
  const [registros, setRegistros] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [verMercados, setVerMercados] = useState(false)

  async function recargar() {
    const { data } = await supabase.from('sombra')
      .select('*').order('creado_en', { ascending: false }).limit(500)
    setRegistros(data || [])
  }

  useEffect(() => { recargar() }, [])

  async function marcar(id, acerto) {
    const actual = registros.find(r => r.id === id)?.acerto_ia
    const nuevo = actual === acerto ? null : acerto
    setRegistros(rs => rs.map(r => (r.id === id ? { ...r, acerto_ia: nuevo } : r)))
    const { error } = await supabase.from('sombra').update({ acerto_ia: nuevo }).eq('id', id)
    if (error) toast('No se pudo marcar')
  }

  async function guardarCuota(id, valor) {
    const v = Number(valor) > 1 ? Number(valor) : null
    setRegistros(rs => rs.map(r => (r.id === id ? { ...r, cuota_ia: v } : r)))
    const { error } = await supabase.from('sombra').update({ cuota_ia: v }).eq('id', id)
    if (error) toast('No se pudo guardar la cuota')
  }

  async function borrarGrupo(clave) {
    const ids = grupos.find(g => g.clave === clave)?.items.map(i => i.id) || []
    const { error } = await supabase.from('sombra').delete().in('id', ids)
    if (error) return toast('No se pudo borrar')
    setRegistros(rs => rs.filter(r => !ids.includes(r.id)))
    toast('Análisis borrado')
  }

  /* agrupado por partido y fecha */
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
  ).filter(g => {
    const resueltos = g.items.filter(i => i.acerto_ia != null).length
    const sinCuota = g.items.filter(i => i.acerto_ia != null && !(Number(i.cuota_ia) > 1)).length
    if (filtro === 'pendientes') return resueltos < g.items.length
    if (filtro === 'sincuota') return sinCuota > 0
    return true
  })

  const resueltas = registros.filter(r => r.acerto_ia != null)
  const aciertos = resueltas.filter(r => r.acerto_ia).length
  const probMedia = resueltas.length
    ? resueltas.reduce((a, r) => a + Number(r.prob_ia || 0), 0) / resueltas.length : null
  const tasaReal = resueltas.length ? aciertos / resueltas.length : null

  const conCuota = resueltas.filter(r => Number(r.cuota_ia) > 1)
  const sinCuota = resueltas.length - conCuota.length
  const retorno = conCuota.reduce((s, r) => s + (r.acerto_ia ? Number(r.cuota_ia) - 1 : -1), 0)
  const yieldSombra = conCuota.length ? retorno / conCuota.length : null
  const cuotaMedia = conCuota.length
    ? conCuota.reduce((s, r) => s + Number(r.cuota_ia), 0) / conCuota.length : null

  /* rendimiento por tipo de mercado, con los nombres ya unificados */
  const porMercado = Object.values(
    conCuota.reduce((acc, r) => {
      const k = normalizar(r.mercado_ia)
      if (!acc[k]) acc[k] = { mercado: k, n: 0, ok: 0, suma: 0, cuotas: 0 }
      acc[k].n++
      if (r.acerto_ia) acc[k].ok++
      acc[k].suma += r.acerto_ia ? Number(r.cuota_ia) - 1 : -1
      acc[k].cuotas += Number(r.cuota_ia)
      return acc
    }, {})
  ).map(m => ({ ...m, yield: m.suma / m.n, cuotaMedia: m.cuotas / m.n }))
   .filter(m => m.n >= 3)
   .sort((a, b) => b.yield - a.yield)

  if (!registros.length) {
    return (
      <section>
        <header className="sec-head"><h2>Sombra</h2></header>
        <div className="empty">
          Sin estimaciones guardadas.<br />
          Analiza partidos en la Cola y guárdalos aquí.
        </div>
      </section>
    )
  }

  return (
    <section>
      <header className="sec-head">
        <h2>Sombra</h2>
        <p className="lede">
          Estimaciones que el modelo hizo sin ver las cuotas. Marca si acertó y
          anota lo que pagaba la casa: sin la cuota, acertar no significa nada.
        </p>
      </header>

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

      <div className="figs">
        <div className="fig"><div className="k">Con cuota</div><div className="v">{conCuota.length}</div></div>
        <div className="fig">
          <div className="k">Yield</div>
          <div className={`v ${yieldSombra < 0 ? 'neg' : yieldSombra > 0 ? 'pos' : ''}`}>
            {pct(yieldSombra)}
          </div>
        </div>
        <div className="fig">
          <div className="k">Cuota media</div>
          <div className="v">{cuotaMedia ? cuotaMedia.toFixed(2) : '—'}</div>
        </div>
        <div className="fig">
          <div className="k">Sin cuota</div>
          <div className={`v ${sinCuota > conCuota.length ? 'neg' : ''}`}>{sinCuota}</div>
        </div>
      </div>

      {sinCuota > 0 && (
        <div className="flag">
          <strong>{sinCuota} estimaciones resueltas no tienen cuota.</strong> El yield solo
          cuenta las {conCuota.length} que sí la tienen. Si solo anotas la cuota de las que
          apostaste, el número mide tu criterio al elegir, no el del modelo. Anótalas todas.
        </div>
      )}

      {conCuota.length >= 30 && (
        <div className="verdict">
          {yieldSombra > 0.15
            ? `Yield del ${pct(yieldSombra)}. Es demasiado alto para ser real: ningún sistema sostiene eso. Casi seguro que faltan cuotas de las estimaciones que no apostaste, o la muestra aún es corta.`
            : yieldSombra > 0.02
              ? 'Yield positivo. Es la única señal que cuenta, pero necesita cientos de registros para ser fiable.'
              : yieldSombra > -0.02
                ? 'Yield cerca de cero: el modelo va a la par del mercado. No aporta ventaja.'
                : 'Yield negativo: siguiendo estas estimaciones habrías perdido dinero, por alto que parezca el acierto.'}
        </div>
      )}

      {cuotaMedia != null && cuotaMedia < 1.5 && (
        <div className="flag">
          <strong>Cuota media {cuotaMedia.toFixed(2)}.</strong> A ese precio necesitas acertar
          el {pct(1 / cuotaMedia)} solo para empatar. Son mercados sin margen de error: basta
          que el acierto baje unos puntos para que pasen a perder dinero.
        </div>
      )}

      {porMercado.length > 0 && (
        <>
          <button className="grupo-cab" onClick={() => setVerMercados(v => !v)}>
            <span className="grupo-tit">Rendimiento por mercado</span>
            <span className="grupo-datos">
              <span className="contador">{porMercado.length}</span>
              <span className="chevron">{verMercados ? '−' : '+'}</span>
            </span>
          </button>
          {verMercados && (
            <div className="card">
              <table>
                <tbody>
                  <tr><th>Mercado</th><th>N</th><th>Acierto</th><th>Cuota</th><th>Yield</th></tr>
                  {porMercado.map(m => (
                    <tr key={m.mercado}>
                      <td>{m.mercado}</td>
                      <td>{m.n}</td>
                      <td>{pct(m.ok / m.n)}</td>
                      <td>{m.cuotaMedia.toFixed(2)}</td>
                      <td className={m.yield < 0 ? 'neg' : m.yield > 0 ? 'pos' : ''}>
                        {pct(m.yield)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ayuda">
                Solo mercados con tres registros o más. Con menos de treinta por mercado
                estos números todavía son ruido.
              </p>
            </div>
          )}
        </>
      )}

      <div className="segmented" style={{ marginTop: 16 }}>
        <button className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>
          Todos
        </button>
        <button className={filtro === 'pendientes' ? 'on' : ''} onClick={() => setFiltro('pendientes')}>
          Sin marcar
        </button>
        <button className={filtro === 'sincuota' ? 'on' : ''} onClick={() => setFiltro('sincuota')}>
          Sin cuota
        </button>
      </div>

      <div className="sec-label" style={{ marginTop: 16 }}>
        <span className="eyebrow">Archivo</span>
        <span className="contador">{grupos.length}</span>
      </div>

      {grupos.map(g => {
        const hechas = g.items.filter(i => i.acerto_ia != null).length
        const ok = g.items.filter(i => i.acerto_ia === true).length
        const faltanCuotas = g.items.filter(i => i.acerto_ia != null && !(Number(i.cuota_ia) > 1)).length
        const completo = hechas === g.items.length
        const ab = abierto === g.clave
        return (
          <article className={`bet compacta ${completo ? 'ganada' : 'pendiente'}`} key={g.clave}>
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
                  {faltanCuotas > 0 && (
                    <><span className="sep">·</span><span className="marca-casa">
                      {faltanCuotas} sin cuota
                    </span></>
                  )}
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
                      <div className="sel-txt">{normalizar(r.mercado_ia)}</div>
                      <span className="odd">{pct(Number(r.prob_ia))}</span>
                    </div>
                    <div className="row c2" style={{ marginTop: 8, marginBottom: 8 }}>
                      <CampoLento id={`cu-${r.id}`} etiqueta="Cuota de la casa"
                                  valor={r.cuota_ia ?? ''} inputMode="decimal"
                                  placeholder="1.85"
                                  onGuardar={v => guardarCuota(r.id, v)} />
                      <div className="marks" style={{ alignSelf: 'end', marginBottom: 4 }}>
                        <button className={`tiny win ${r.acerto_ia === true ? 'on' : ''}`}
                                onClick={() => marcar(r.id, true)}>✓</button>
                        <button className={`tiny lose ${r.acerto_ia === false ? 'on' : ''}`}
                                onClick={() => marcar(r.id, false)}>✗</button>
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
    </section>
  )
}
