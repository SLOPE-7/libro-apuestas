import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  cuotaApuesta, cuotaTotal, estadoApuesta, estadoSeleccion,
  resultado, valorCierre, tieneAnuladaParcial
} from '../lib/calc'

const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v).toFixed(2)

const CICLO = ['pendiente', 'ganada', 'anulada', 'perdida']
const CARA = {
  pendiente: { txt: '·',  cls: '' },
  ganada:    { txt: '✓',  cls: 'win' },
  anulada:   { txt: '∅',  cls: 'void' },
  perdida:   { txt: '✗',  cls: 'lose' }
}

const ESTADOS = [
  ['ganada', '✓', 'win'], ['perdida', '✗', 'lose'],
  ['media_ganada', '½✓', 'half'], ['media_perdida', '½✗', 'half'],
  ['anulada', '∅', 'void']
]

const ETIQUETA = {
  ganada: 'Ganada', perdida: 'Perdida', pendiente: 'Pendiente', cerrada: 'Cerrada'
}

export default function Historial({ apuestas, casas, onCambio, toast }) {
  const [abierta, setAbierta] = useState(null)
  const [cerrando, setCerrando] = useState(null)
  const [importe, setImporte] = useState('')
  const [verPerdidas, setVerPerdidas] = useState(false)
  const [verCerradas, setVerCerradas] = useState(false)
  const [verGanadas, setVerGanadas] = useState(true)

  const nombreCasa = id => casas.find(c => c.id === id)?.nombre ?? '—'
  const subs = s => (Array.isArray(s.mercados) && s.mercados.length > 1 ? s.mercados : null)

  async function tocarMercado(sel, i) {
    const lista = (sel.mercados || []).map(m => ({ ...m }))
    const actual = lista[i].e || 'pendiente'
    lista[i].e = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length]
    const { error } = await supabase.from('selecciones')
      .update({ mercados: lista }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    onCambio()
  }

  async function marcar(sel, valor) {
    const nuevo = sel.estado === valor ? 'pendiente' : valor
    const { error } = await supabase.from('selecciones')
      .update({ estado: nuevo }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    onCambio()
  }

  async function guardarCierre(a) {
    const v = Number(importe)
    if (!(v >= 0)) return toast('Escribe cuánto te devolvió la casa')
    const { error } = await supabase.from('apuestas').update({ cash_out: v }).eq('id', a.id)
    if (error) return toast('No se pudo cerrar: ' + error.message)
    setCerrando(null); setImporte('')
    toast('Apuesta cerrada'); onCambio()
  }

  async function deshacerCierre(a) {
    const { error } = await supabase.from('apuestas').update({ cash_out: null }).eq('id', a.id)
    if (error) return toast('No se pudo deshacer')
    toast('Cierre deshecho'); onCambio()
  }

  async function borrar(id) {
    const { error } = await supabase.from('apuestas').delete().eq('id', id)
    if (error) return toast('No se pudo borrar: ' + error.message)
    toast('Asiento borrado'); onCambio()
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

  /* agrupar por estado */
  const conEstado = apuestas.map(a => ({ ...a, _e: estadoApuesta(a), _r: resultado(a) }))
  const pendientes = conEstado.filter(a => a._e === 'pendiente')
  const ganadas    = conEstado.filter(a => a._e === 'ganada')
  const perdidas   = conEstado.filter(a => a._e === 'perdida')
  const cerradas   = conEstado.filter(a => a._e === 'cerrada')

  const suma = arr => arr.reduce((s, a) => s + a._r, 0)

  /* partidos de fechas pasadas que siguen sin marcar */
  const hoy = new Date().toISOString().slice(0, 10)
  const atrasadas = pendientes.filter(a => a.fecha < hoy)

  function tarjeta(a) {
    const sel = a.selecciones || []
    const e = a._e
    const r = a._r
    const total = cuotaApuesta(a)
    const producto = cuotaTotal(sel)
    const ajustada = Number(a.cuota_total) > 1 && Math.abs(total / producto - 1) > 0.005
    const abierto = abierta === a.id
    const partes = sel.flatMap(s => subs(s) || [{ e: s.estado }])
    const hechas = partes.filter(p => p.e && p.e !== 'pendiente').length
    const sugerido = valorCierre(a)

    return (
      <article className={`bet compacta ${e} ${abierto ? 'abierta' : ''}`} key={a.id}>
        <button className="bet-cabecera" onClick={() => setAbierta(abierto ? null : a.id)}
                aria-expanded={abierto}>
          <div className="bet-izq">
            <div className="bet-meta">
              <span>{a.fecha.slice(5)}</span>
              <span className="sep">·</span>
              <span>{nombreCasa(a.casa_id)}</span>
              <span className="sep">·</span>
              <span>{sel.length === 1 ? '1 sel' : `${sel.length} sels`}</span>
              <span className="sep">·</span>
              <span>{total.toFixed(2)}</span>
              {ajustada && <span className="marca-casa">casa</span>}
              {e === 'pendiente' && hechas > 0 && (
                <><span className="sep">·</span><span>{hechas}/{partes.length}</span></>
              )}
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
            {sel.map(s => {
              const lista = subs(s)
              const es = estadoSeleccion(s)
              return (
                <div className={`sel sel-${es}`} key={s.id}>
                  <div className="sel-row">
                    <div className="sel-txt"><b>{s.partido}</b></div>
                    <span className="odd">{Number(s.cuota).toFixed(2)}</span>
                  </div>

                  {lista ? (
                    <>
                      <ul className="submercados">
                        {lista.map((m, i) => {
                          const cara = CARA[m.e || 'pendiente']
                          return (
                            <li key={i} className={`sub sub-${m.e || 'pendiente'}`}>
                              <button className={`sub-btn ${cara.cls}`}
                                      onClick={() => tocarMercado(s, i)}
                                      aria-label={`${m.t}: ${m.e || 'pendiente'}`}>
                                {cara.txt}
                              </button>
                              <span className="sub-txt">{m.t}</span>
                            </li>
                          )
                        })}
                      </ul>
                      {tieneAnuladaParcial(s) && (
                        <div className="flag" style={{ margin: '10px 0 0' }}>
                          <strong>Se anuló una parte.</strong> La casa recalcula la cuota de
                          esta selección. Corrígela en tu cupón y ajusta la cuota total.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {s.mercado && <em className="sel-mercado">{s.mercado}</em>}
                      <div className="marks">
                        {ESTADOS.map(([v, lbl, cls]) => (
                          <button key={v}
                                  className={`tiny ${cls} ${s.estado === v ? 'on' : ''}`}
                                  onClick={() => marcar(s, v)}
                                  aria-label={v.replace('_', ' ')}>{lbl}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}

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
                  Con lo ya resuelto, esta apuesta vale hoy alrededor de <b>{money(sugerido)}</b>
                  {' '}si el resto estuviera a precio justo. La casa te ofrecerá menos.
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
  }

  const grupo = (titulo, lista, abierto, alternar, clase) => {
    if (!lista.length) return null
    const total = suma(lista)
    return (
      <>
        <button className={`grupo-cab ${clase}`} onClick={alternar} aria-expanded={abierto}>
          <span className="grupo-tit">{titulo}</span>
          <span className="grupo-datos">
            <span className="contador">{lista.length}</span>
            {clase !== 'pendiente' && (
              <span className={total < 0 ? 'neg' : total > 0 ? 'pos' : ''}>{money(total)}</span>
            )}
            <span className="chevron">{abierto ? '−' : '+'}</span>
          </span>
        </button>
        {abierto && lista.map(tarjeta)}
      </>
    )
  }

  return (
    <section>
      <header className="sec-head">
        <h2>Historial</h2>
        <p className="lede">
          Toca una apuesta para abrirla. En las de varios mercados, cada uno lleva su
          botón: un toque acierta, dos anula, tres falla.
        </p>
      </header>

      {atrasadas.length > 0 && (
        <div className="flag">
          <strong>{atrasadas.length} {atrasadas.length === 1 ? 'apuesta' : 'apuestas'} de
          días anteriores sin marcar.</strong> Si no las cierras, tus números dirán que vas
          mejor de lo que vas.
        </div>
      )}

      {pendientes.length > 0 && (
        <>
          <div className="sec-label" style={{ marginTop: 6 }}>
            <span className="eyebrow">En juego</span>
            <span className="contador">
              {money(pendientes.reduce((s, a) => s + Number(a.stake), 0))}
            </span>
          </div>
          {pendientes.map(tarjeta)}
        </>
      )}

      <div style={{ marginTop: 18 }}>
        {grupo('Ganadas', ganadas, verGanadas, () => setVerGanadas(v => !v), 'ganada')}
        {grupo('Cerradas', cerradas, verCerradas, () => setVerCerradas(v => !v), 'cerrada')}
        {grupo('Perdidas', perdidas, verPerdidas, () => setVerPerdidas(v => !v), 'perdida')}
      </div>
    </section>
  )
}
