import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { cuotaApuesta, cuotaTotal, estadoApuesta, resultado, valorCierre } from '../lib/calc'

const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v).toFixed(2)

const ESTADOS = [
  ['ganada',        '✓',  'win'],
  ['perdida',       '✗',  'lose'],
  ['media_ganada',  '½✓', 'half'],
  ['media_perdida', '½✗', 'half'],
  ['anulada',       '∅',  'void']
]

const ETIQUETA = {
  ganada: 'Ganada', perdida: 'Perdida', pendiente: 'Pendiente', cerrada: 'Cerrada'
}

export default function Historial({ apuestas, casas, onCambio, toast }) {
  const [abierta, setAbierta] = useState(null)   // id de la apuesta desplegada
  const [cerrando, setCerrando] = useState(null) // id de la que se está cerrando
  const [importe, setImporte] = useState('')

  const nombreCasa = id => casas.find(c => c.id === id)?.nombre ?? '—'

  async function marcar(sel, valor) {
    const nuevo = sel.estado === valor ? 'pendiente' : valor
    const { error } = await supabase.from('selecciones').update({ estado: nuevo }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    onCambio()
  }

  async function guardarCierre(a) {
    const v = Number(importe)
    if (!(v >= 0)) return toast('Escribe cuánto te devolvió la casa')
    const { error } = await supabase.from('apuestas').update({ cash_out: v }).eq('id', a.id)
    if (error) return toast('No se pudo cerrar: ' + error.message)
    setCerrando(null); setImporte('')
    toast('Apuesta cerrada')
    onCambio()
  }

  async function deshacerCierre(a) {
    const { error } = await supabase.from('apuestas').update({ cash_out: null }).eq('id', a.id)
    if (error) return toast('No se pudo deshacer: ' + error.message)
    toast('Cierre deshecho')
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
          Toca una apuesta para abrirla. Marca cada selección y se resuelve sola:
          basta una fallada para perderla entera.
        </p>
      </header>

      {apuestas.map(a => {
        const sel = a.selecciones || []
        const e = estadoApuesta(a)
        const r = resultado(a)
        const total = cuotaApuesta(a)
        const producto = cuotaTotal(sel)
        const ajustada = Number(a.cuota_total) > 1 && Math.abs(total / producto - 1) > 0.005
        const abierto = abierta === a.id
        const acertadas = sel.filter(s => s.estado === 'ganada').length
        const decididas = sel.filter(s => s.estado && s.estado !== 'pendiente').length
        const sugerido = valorCierre(a)

        return (
          <article className={`bet ${e} ${abierto ? 'abierta' : ''}`} key={a.id}>
            <button className="bet-cabecera" onClick={() => setAbierta(abierto ? null : a.id)}
                    aria-expanded={abierto}>
              <div className="bet-izq">
                <div className="bet-meta">
                  <span>{a.fecha}</span>
                  <span className="sep">·</span>
                  <span>{nombreCasa(a.casa_id)}</span>
                  <span className={`badge ${e}`}>{ETIQUETA[e]}</span>
                </div>
                <div className="bet-sub">
                  {sel.length === 1 ? '1 selección' : `${sel.length} selecciones`}
                  <span className="sep"> · </span>
                  cuota {total.toFixed(2)}
                  {ajustada && <span className="marca-casa"> según la casa</span>}
                  {e === 'pendiente' && decididas > 0 &&
                    <> <span className="sep">·</span> {acertadas}/{sel.length} acertadas</>}
                </div>
              </div>
              <div className="bet-der">
                <span className={`bet-amt ${r < 0 ? 'neg' : r > 0 ? 'pos' : ''}`}>
                  {e === 'pendiente' ? money(Number(a.stake)) : money(r)}
                </span>
                <span className="chevron" aria-hidden="true">{abierto ? '−' : '+'}</span>
              </div>
            </button>

            {abierto && (
              <div className="bet-cuerpo">
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
                                aria-label={v.replace('_', ' ')}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                ))}

                {e === 'cerrada' && (
                  <div className="cierre-info">
                    Cerrada anticipadamente por <b>{money(Number(a.cash_out))}</b>.
                    <button className="mini" onClick={() => deshacerCierre(a)}>Deshacer cierre</button>
                  </div>
                )}

                {cerrando === a.id && (
                  <div className="cierre">
                    <div className="field">
                      <label htmlFor={`co${a.id}`}>¿Cuánto te devolvió la casa?</label>
                      <div className="con-sufijo">
                        <input id={`co${a.id}`} inputMode="decimal" value={importe}
                               onChange={ev => setImporte(ev.target.value)}
                               placeholder={sugerido.toFixed(2)} />
                        <span className="sufijo">L</span>
                      </div>
                    </div>
                    <p className="ayuda">
                      Con {acertadas} {acertadas === 1 ? 'selección acertada' : 'selecciones acertadas'},
                      esta apuesta vale hoy alrededor de <b>{money(sugerido)}</b> si el resto
                      estuviera a precio justo. La casa te ofrecerá menos: esa diferencia es
                      su margen. Apunta lo que realmente te dieron.
                    </p>
                    <div className="row c2" style={{ marginTop: 12 }}>
                      <button className="act" onClick={() => guardarCierre(a)}>Guardar cierre</button>
                      <button className="ghost" onClick={() => { setCerrando(null); setImporte('') }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="bet-pie">
                  {e === 'pendiente' && cerrando !== a.id && (
                    <button className="tiny" onClick={() => { setCerrando(a.id); setImporte('') }}>
                      Cerrar apuesta
                    </button>
                  )}
                  <button className="tiny" onClick={() => borrar(a.id)}>Borrar asiento</button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
