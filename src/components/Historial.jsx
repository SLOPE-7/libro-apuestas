import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  cuotaApuesta, cuotaTotal, estadoApuesta, estadoSeleccion,
  resultado, valorCierre, tieneAnuladaParcial, patasApuesta
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

export default function Historial({ apuestas, casas, onCambio, toast }) {
  const [abierta, setAbierta] = useState(null)
  const [cerrando, setCerrando] = useState(null)
  const [importe, setImporte] = useState('')
  const [verPerdidas, setVerPerdidas] = useState(false)
  const [verCerradas, setVerCerradas] = useState(false)
  const [verAnuladas, setVerAnuladas] = useState(false)
  const [verGanadas, setVerGanadas] = useState(true)
  /* Confirmación de borrado: guarda el id de la apuesta que está esperando el sí. */
  const [confirmando, setConfirmando] = useState(null)
  /* Último cambio de marcado, para poder revertirlo de un toque. */
  const [deshacer, setDeshacer] = useState(null)

  const nombreCasa = id => casas.find(c => c.id === id)?.nombre ?? '—'

  /* Sub-mercados de una selección BetBuilder. Con uno solo no hay nada que desglosar. */
  const subs = s => (Array.isArray(s.mercados) && s.mercados.length > 1 ? s.mercados : null)

  /**
   * Cuenta las partes resueltas de una apuesta.
   * Antes miraba s.estado incluso cuando la selección tenía sus mercados
   * dentro, así que el contador mentía en las de un solo mercado.
   */
  function progresoDe(sel = []) {
    let total = 0
    let hechas = 0
    for (const s of sel) {
      const lista = subs(s)
      if (lista) {
        total += lista.length
        hechas += lista.filter(m => m.e && m.e !== 'pendiente').length
      } else {
        total += 1
        if (estadoSeleccion(s) !== 'pendiente') hechas += 1
      }
    }
    return { total, hechas }
  }

  /**
   * Escribe la fecha en que la apuesta quedó resuelta.
   *
   * La curva de banca se ordenaba por la fecha en que registraste la apuesta,
   * no por la que se decidió, así que una del día 1 que se resuelve el 5
   * aparecía antes que una del día 2 ya cerrada. Eso distorsiona el drawdown
   * y las rachas.
   *
   * Se llama después de que el marcado ya se guardó. Si esto fallara, el
   * marcado sigue bien: solo se vería el orden viejo, así que no se avisa
   * ni se revierte nada.
   */
  async function sincronizarFecha(a, selecciones) {
    const e = estadoApuesta({ ...a, selecciones })
    const hoy = new Date().toISOString().slice(0, 10)
    const actual = a.fecha_resuelta ?? null
    const debe = e === 'pendiente' ? null : (actual || hoy)
    if (debe === actual) return
    await supabase.from('apuestas').update({ fecha_resuelta: debe }).eq('id', a.id)
  }

  async function tocarMercado(a, sel, i) {
    const previo = (sel.mercados || []).map(m => ({ ...m }))
    const lista = previo.map(m => ({ ...m }))
    const actual = lista[i].e || 'pendiente'
    lista[i].e = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length]
    const { error } = await supabase.from('selecciones')
      .update({ mercados: lista }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    await sincronizarFecha(a, (a.selecciones || [])
      .map(x => (x.id === sel.id ? { ...x, mercados: lista } : x)))
    setDeshacer({ id: sel.id, campo: 'mercados', valor: previo, texto: lista[i].t || 'mercado' })
    onCambio()
  }

  async function marcar(a, sel, valor) {
    const previo = sel.estado ?? 'pendiente'
    const nuevo = sel.estado === valor ? 'pendiente' : valor
    const { error } = await supabase.from('selecciones')
      .update({ estado: nuevo }).eq('id', sel.id)
    if (error) return toast('No se pudo actualizar: ' + error.message)
    await sincronizarFecha(a, (a.selecciones || [])
      .map(x => (x.id === sel.id ? { ...x, estado: nuevo } : x)))
    setDeshacer({ id: sel.id, campo: 'estado', valor: previo, texto: sel.partido || 'selección' })
    onCambio()
  }

  /* Revierte el último marcado. Sin esto, un toque mal dado corrompe los números en silencio. */
  async function revertir() {
    if (!deshacer) return
    const { error } = await supabase.from('selecciones')
      .update({ [deshacer.campo]: deshacer.valor }).eq('id', deshacer.id)
    if (error) return toast('No se pudo deshacer: ' + error.message)
    const dueña = apuestas.find(a => (a.selecciones || []).some(s => s.id === deshacer.id))
    if (dueña) await sincronizarFecha(dueña, (dueña.selecciones || [])
      .map(x => (x.id === deshacer.id ? { ...x, [deshacer.campo]: deshacer.valor } : x)))
    setDeshacer(null)
    toast('Cambio revertido')
    onCambio()
  }

  async function guardarCierre(a) {
    const v = Number(importe)
    if (!(v >= 0)) return toast('Escribe cuánto te devolvió la casa')
    const { error } = await supabase.from('apuestas').update({ cash_out: v }).eq('id', a.id)
    if (error) return toast('No se pudo cerrar: ' + error.message)
    await sincronizarFecha({ ...a, cash_out: v }, a.selecciones || [])
    setCerrando(null); setImporte('')
    toast('Apuesta cerrada'); onCambio()
  }

  async function deshacerCierre(a) {
    const { error } = await supabase.from('apuestas').update({ cash_out: null }).eq('id', a.id)
    if (error) return toast('No se pudo deshacer')
    await sincronizarFecha({ ...a, cash_out: null }, a.selecciones || [])
    toast('Cierre deshecho'); onCambio()
  }

  async function borrar(id) {
    const { error } = await supabase.from('apuestas').delete().eq('id', id)
    if (error) return toast('No se pudo borrar: ' + error.message)
    setConfirmando(null)
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

  const conEstado = apuestas.map(a => ({ ...a, _e: estadoApuesta(a), _r: resultado(a) }))
  const pendientes = conEstado.filter(a => a._e === 'pendiente')
  const ganadas    = conEstado.filter(a => a._e === 'ganada')
  const perdidas   = conEstado.filter(a => a._e === 'perdida')
  const cerradas   = conEstado.filter(a => a._e === 'cerrada')
  const anuladas   = conEstado.filter(a => a._e === 'anulada')

  const suma = arr => arr.reduce((s, a) => s + a._r, 0)

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
    const { total: partes, hechas } = progresoDe(sel)
    const sugerido = valorCierre(a)
    const patas = patasApuesta(a)

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
              <span>{patas === 1 ? '1 pata' : `${patas} patas`}</span>
              <span className="sep">·</span>
              <span>{total.toFixed(2)}</span>
              {ajustada && <span className="marca-casa">casa</span>}
              {e === 'pendiente' && hechas > 0 && (
                <><span className="sep">·</span><span>{hechas}/{partes}</span></>
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
            {e === 'anulada' && (
              <div className="cierre-info">
                Anulada entera. La casa devolvió lo apostado, así que no cuenta
                ni en tu acierto ni en tu rendimiento.
              </div>
            )}

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
                                      onClick={() => tocarMercado(a, s, i)}
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
                                  onClick={() => marcar(a, s, v)}
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

            {confirmando === a.id && (
              <div className="flag" style={{ margin: '12px 0 0' }}>
                <strong>¿Borrar este asiento?</strong> Se va también el detalle de sus
                selecciones y no se puede recuperar.
                <div className="row c2" style={{ marginTop: 10 }}>
                  <button className="act" onClick={() => borrar(a.id)}>Sí, borrar</button>
                  <button className="ghost" onClick={() => setConfirmando(null)}>Cancelar</button>
                </div>
              </div>
            )}

            <div className="bet-pie">
              {e === 'pendiente' && cerrando !== a.id && (
                <button className="tiny" onClick={() => { setCerrando(a.id); setImporte('') }}>
                  Cerrar apuesta
                </button>
              )}
              {confirmando !== a.id && (
                <button className="tiny" onClick={() => setConfirmando(a.id)}>Borrar asiento</button>
              )}
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
            <span className={total < 0 ? 'neg' : total > 0 ? 'pos' : ''}>{money(total)}</span>
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

      {deshacer && (
        <div className="cierre-info" style={{ marginBottom: 12 }}>
          Marcaste <b>{deshacer.texto}</b>.
          <button className="mini" onClick={revertir}>Deshacer</button>
          <button className="mini" onClick={() => setDeshacer(null)}>Está bien</button>
        </div>
      )}

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
        {grupo('Anuladas', anuladas, verAnuladas, () => setVerAnuladas(v => !v), 'anulada')}
        {grupo('Perdidas', perdidas, verPerdidas, () => setVerPerdidas(v => !v), 'perdida')}
      </div>
    </section>
  )
}
