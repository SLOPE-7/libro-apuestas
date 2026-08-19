import { supabase } from '../lib/supabase'
import { cuotaTotal, estado, resultado } from '../lib/calc'

const money = v => (v < 0 ? '-' : '') + 'L' + Math.abs(v).toFixed(2)

export default function Historial({ apuestas, casas, onCambio, toast }) {
  const nombreCasa = id => casas.find(c => c.id === id)?.nombre ?? '—'

  async function marcar(sel, valor) {
    // Volver a tocar el mismo botón deshace la marca
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
        <h2>Historial</h2>
        <div className="empty">
          El libro está vacío.<br />Registra tu primera apuesta para empezar a medir.
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2>Historial</h2>
      <p className="lede">
        Marca cada selección con ✓ o ✗. La apuesta se resuelve sola: basta una fallada
        para perderla entera.
      </p>

      {apuestas.map(a => {
        const e = estado(a.selecciones)
        const r = resultado(a)
        const total = cuotaTotal(a.selecciones)
        const etiqueta = { ganada: 'Ganada', perdida: 'Perdida', pendiente: 'Pendiente' }[e]

        return (
          <div className={`bet ${e}`} key={a.id}>
            <div className="bet-top">
              <div className="bet-meta">{a.fecha} · {nombreCasa(a.casa_id)} · {etiqueta}</div>
              <div className={`bet-amt ${r < 0 ? 'neg' : r > 0 ? 'pos' : ''}`}>
                {e === 'pendiente' ? `${money(Number(a.stake))} →` : money(r)}
              </div>
            </div>
            <div className="bet-meta">
              {a.selecciones.length > 1 && `${a.selecciones.length} selecciones · `}
              cuota {total.toFixed(2)}
            </div>

            {a.selecciones.map(s => (
              <div className="sel" key={s.id}>
                <div className="sel-txt">
                  {s.partido}
                  {s.mercado && <em>{s.mercado}</em>}
                </div>
                <div className="sel-right">
                  <span className="odd">{Number(s.cuota).toFixed(2)}</span>
                  <button className={`tiny win ${s.estado === 'ganada' ? 'on' : ''}`}
                          onClick={() => marcar(s, 'ganada')} aria-label="Marcar acertada">✓</button>
                  <button className={`tiny lose ${s.estado === 'perdida' ? 'on' : ''}`}
                          onClick={() => marcar(s, 'perdida')} aria-label="Marcar fallada">✗</button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 10 }}>
              <button className="tiny" onClick={() => borrar(a.id)}>Borrar asiento</button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
