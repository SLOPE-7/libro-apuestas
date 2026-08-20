import { supabase } from '../lib/supabase'
import { cuotaApuesta, cuotaTotal, estado, resultado } from '../lib/calc'

const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v).toFixed(2)

const ESTADOS = [
  ['ganada',        '✓',  'win'],
  ['perdida',       '✗',  'lose'],
  ['media_ganada',  '½✓', 'half'],
  ['media_perdida', '½✗', 'half'],
  ['anulada',       '∅',  'void']
]

export default function Historial({ apuestas, casas, onCambio, toast }) {
  const nombreCasa = id => casas.find(c => c.id === id)?.nombre ?? '—'

  async function marcar(sel, valor) {
    const nuevo = sel.estado === valor ? 'pendiente' : valor
    const { error } = await supabase
      .from('selecciones').update({ estado: nuevo }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    onCambio()
  }

  async function borrar(id) {
    const { error } = await supabase.from('apuestas').delete().eq('id', id)
    if (error) return toast('No se pudo borrar: ' + error.message)
    toast('Asiento borrado')
    onCambio()
  }

  if (!apuestas.length) {
    return (
      <section>
        <header className="sec-head"><h2>Historial</h2></header>
        <div className="empty">
          El libro está vacío.<br />Registra tu primera apuesta para empezar a medir.
        </div>
      </section>
    )
  }

  return (
    <section>
      <header className="sec-head">
        <h2>Historial</h2>
        <p className="lede">
          Marca cada selección y la apuesta se resuelve sola: basta una fallada para
          perderla entera. ½ es para hándicaps de cuarto, ∅ para eventos anulados.
        </p>
      </header>

      {apuestas.map(a => {
        const sel = a.selecciones || []
        const e = estado(sel)
        const r = resultado(a)
        const total = cuotaApuesta(a)
        const producto = cuotaTotal(sel)
        const ajustada = Number(a.cuota_total) > 1 && Math.abs(total / producto - 1) > 0.005
        const etiqueta = { ganada: 'Ganada', perdida: 'Perdida', pendiente: 'Pendiente' }[e]

        return (
          <article className={`bet ${e}`} key={a.id}>
            <div className="bet-top">
              <div className="bet-meta">
                <span>{a.fecha}</span>
                <span className="sep">·</span>
                <span>{nombreCasa(a.casa_id)}</span>
                <span className={`badge ${e}`}>{etiqueta}</span>
              </div>
              <div className={`bet-amt ${r < 0 ? 'neg' : r > 0 ? 'pos' : ''}`}>
                {e === 'pendiente' ? money(Number(a.stake)) : money(r)}
              </div>
            </div>

            <div className="bet-sub">
              {sel.length > 1 && <>{sel.length} selecciones <span className="sep">·</span> </>}
              cuota {total.toFixed(2)}
              {ajustada && <span className="marca-casa"> según la casa</span>}
              {e === 'pendiente' && <> <span className="sep">·</span> en juego</>}
            </div>

            {sel.map(s => (
              <div className="sel" key={s.id}>
                <div className="sel-row">
                  <div className="sel-txt">
                    <b>{s.partido}</b>
                    {s.mercado && <em>{s.mercado}</em>}
                  </div>
                  <span className="odd">{Number(s.cuota).toFixed(2)}</span>
                </div>
                <div className="marks">
                  {ESTADOS.map(([v, lbl, cls]) => (
                    <button key={v}
                            className={`tiny ${cls} ${s.estado === v ? 'on' : ''}`}
                            onClick={() => marcar(s, v)}
                            aria-label={v.replace('_', ' ')}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="bet-pie">
              <button className="tiny" onClick={() => borrar(a.id)}>Borrar asiento</button>
            </div>
          </article>
        )
      })}
    </section>
  )
}
