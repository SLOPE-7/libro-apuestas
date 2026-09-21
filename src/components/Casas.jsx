import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { inicialParaCuadrar } from '../lib/calc'
import Avisos from './Avisos'

const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v || 0).toFixed(2)

export default function Casas({ casas, movimientos, apuestas = [], resumen, onCambio, toast }) {
  const [borrador, setBorrador] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  /* Lo que ves en la app de cada casa, apuntado a mano. Es la única forma
     de saber si el libro cuadra: la app solo conoce lo que le registraste. */
  const [reales, setReales] = useState({})
  const [confirmarQuitar, setConfirmarQuitar] = useState(null)
  const [confirmarReinicio, setConfirmarReinicio] = useState(false)

  // se sincroniza cada vez que cambian las casas: sin esto, al añadir una nueva
  // no aparecía hasta reiniciar la app
  useEffect(() => {
    setBorrador(casas.map(c => ({
      id: c.id, nombre: c.nombre, saldo_inicial: String(c.saldo_inicial ?? 0)
    })))
    setReales(Object.fromEntries(
      casas.map(c => [c.id, c.saldo_real != null ? String(c.saldo_real) : ''])))
  }, [casas])

  const up = (i, k, v) => setBorrador(b => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function anadir() {
    const { error } = await supabase.from('casas')
      .insert({ nombre: 'Nueva casa', saldo_inicial: 0 })
    if (error) return toast('No se pudo añadir: ' + error.message)
    toast('Casa añadida')
    onCambio()
  }

  async function quitar(id) {
    const { error } = await supabase.from('casas').delete().eq('id', id)
    if (error) return toast('No se pudo quitar: ' + error.message)
    setConfirmarQuitar(null)
    toast('Casa eliminada · sus apuestas y movimientos se conservan')
    onCambio()
  }

  /** Guarda el saldo que muestra la casa. Se apunta a mano, cuando lo miras. */
  async function guardarReal(id, valor) {
    const v = String(valor).trim() === '' ? null : Number(valor)
    if (v != null && !Number.isFinite(v)) return
    const hoy = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('casas')
      .update({ saldo_real: v, saldo_real_fecha: v == null ? null : hoy }).eq('id', id)
    if (error) return toast('No se pudo guardar el saldo real: ' + error.message)
    onCambio()
  }

  /**
   * Registra la diferencia entre lo que dice la app y lo que dice la casa.
   * Si la casa tiene más, faltó registrar un depósito o una ganancia; si
   * tiene menos, faltó un retiro o una pérdida. Se deja la nota para que
   * se distinga de un movimiento real y se pueda deshacer.
   */
  async function cuadrar(casaId, diferencia) {
    const m = Math.round(Math.abs(diferencia) * 100) / 100
    if (!(m > 0)) return
    const { error } = await supabase.from('movimientos').insert({
      casa_id: casaId, tipo: diferencia > 0 ? 'deposito' : 'retiro', monto: m,
      nota: 'Ajuste de cuadre con el saldo real de la casa'
    })
    if (error) return toast('No se pudo cuadrar: ' + error.message)
    toast('Cuadrado · ' + (diferencia > 0 ? 'depósito' : 'retiro') + ' de ' + money(m))
    onCambio()
  }

  /**
   * REINICIO DE BANCA. Cada casa pasa a empezar hoy con lo que muestra su app.
   * El historial de apuestas no se toca: Sombra, rendimiento y acierto siguen
   * contando todo. Solo cambia desde cuándo se cuenta el dinero.
   */
  async function reiniciar() {
    const hoy = new Date().toISOString().slice(0, 10)
    for (const c of casas) {
      const inicial = inicialParaCuadrar(c, c.saldo_real, apuestas, movimientos || [], hoy)
      const { error } = await supabase.from('casas')
        .update({ saldo_inicial: inicial, corte: hoy }).eq('id', c.id)
      if (error) return toast('No se pudo reiniciar ' + c.nombre + ': ' + error.message +
        ' · ¿corriste la migración?')
    }
    setConfirmarReinicio(false)
    toast('Banca reiniciada · desde hoy cuadra con tus casas')
    onCambio()
  }

  async function guardar() {
    setGuardando(true)
    for (const c of borrador) {
      const { error } = await supabase.from('casas').update({
        nombre: c.nombre.trim() || 'Sin nombre',
        saldo_inicial: Number(c.saldo_inicial) || 0
      }).eq('id', c.id)
      if (error) { setGuardando(false); return toast('No se pudo guardar: ' + error.message) }
    }
    setGuardando(false)
    toast('Saldos guardados')
    onCambio()
  }

  async function movimiento(casaId, tipo) {
    const m = Number(monto)
    if (!(m > 0)) return toast('Escribe un monto')
    const { error } = await supabase.from('movimientos')
      .insert({ casa_id: casaId, tipo, monto: m, nota: nota.trim() || null })
    if (error) return toast('No se pudo registrar: ' + error.message)
    setMonto(''); setNota('')
    toast(tipo === 'deposito' ? 'Depósito registrado' : 'Retiro registrado')
    onCambio()
  }

  async function borrarMovimiento(id) {
    const { error } = await supabase.from('movimientos').delete().eq('id', id)
    if (error) return toast('No se pudo borrar')
    onCambio()
  }

  async function salir() { await supabase.auth.signOut() }

  const datos = id => resumen?.porCasa?.find(c => c.id === id)

  const conReal = casas.filter(c => c.saldo_real != null)
  const totalReal = conReal.reduce((t, c) => t + Number(c.saldo_real), 0)
  const faltanReales = casas.length - conReal.length
  const inicialTotal = casas.reduce((t, c) => t + Number(c.saldo_inicial || 0), 0)
  /* Se compara lo DISPONIBLE (sin lo que está en juego) porque es lo que
     enseña la app de la casa: apostaste 100 de 900 y ves 800. */
  const disponibleApp = (resumen?.porCasa || []).reduce((t, c) => t + (c.disponible || 0), 0)
  const descuadre = faltanReales ? null
    : Math.round((disponibleApp - totalReal) * 100) / 100

  return (
    <section>
      <header className="sec-head">
        <h2>Casas y saldos</h2>
        <p className="lede">
          Tu banca es la suma de todas, no bancas separadas. Los depósitos y retiros
          se registran aparte para que el saldo siempre cuadre.
        </p>
      </header>

      <div className="cuadre">
        <span className="eyebrow">¿Cuadra con tus casas?</span>
        <div className="cuadre-filas">
          <div><span>La app dice que ves</span><b>{money(disponibleApp)}</b></div>
          <div><span>Tus casas muestran</span><b>{faltanReales ? '—' : money(totalReal)}</b></div>
          {descuadre != null && (
            <div className={`cuadre-dif ${Math.abs(descuadre) < 1 ? 'ok' : 'mal'}`}>
              <span>{Math.abs(descuadre) < 1 ? 'Cuadra' : 'Diferencia'}</span>
              <b>{Math.abs(descuadre) < 1 ? '✓' : money(descuadre)}</b>
            </div>
          )}
        </div>
        <p className="ayuda">
          {faltanReales
            ? `Apunta abajo el saldo que ves en ${faltanReales === casas.length ? 'cada casa'
                : faltanReales === 1 ? 'la casa que falta' : `las ${faltanReales} casas que faltan`}.`
            : Math.abs(descuadre) < 1
              ? 'El libro cuadra con tus casas.'
              : 'No cuadra. Puedes cuadrar casa por casa, o reiniciar la banca desde hoy.'}
        </p>

        {!faltanReales && Math.abs(descuadre) >= 1 && (
          confirmarReinicio ? (
            <div className="flag">
              <strong>¿Reiniciar la banca desde hoy?</strong>{' '}
              Cada casa empezará con lo que muestra ahora ({casas.map(c =>
                `${c.nombre} ${money(c.saldo_real)}`).join(' · ')}). Las apuestas
              abiertas se tienen en cuenta. Tu historial, Sombra, el rendimiento y el
              acierto <b>no cambian</b>: solo desde cuándo se cuenta el dinero.
              <div className="row c2" style={{ marginTop: 10 }}>
                <button className="act" onClick={reiniciar}>Sí, reiniciar</button>
                <button className="ghost" onClick={() => setConfirmarReinicio(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className="act" style={{ marginTop: 4 }}
                    onClick={() => setConfirmarReinicio(true)}>
              Reiniciar banca desde hoy
            </button>
          )
        )}
      </div>

      <div className="figs">
        <div className="fig">
          <div className="k">Banca actual</div>
          <div className="v">{money(resumen?.banca)}</div>
        </div>
        <div className="fig">
          <div className="k">Resultado neto</div>
          <div className={`v ${resumen?.neto < 0 ? 'neg' : resumen?.neto > 0 ? 'pos' : ''}`}>
            {money(resumen?.neto)}
          </div>
        </div>
        <div className="fig">
          <div className="k">Depositado</div>
          <div className="v">{money(resumen?.depositado)}</div>
        </div>
        <div className="fig">
          <div className="k">Retirado</div>
          <div className="v pos">{money(resumen?.retirado)}</div>
        </div>
      </div>

      {borrador.map((c, i) => {
        const d = datos(c.id)
        const abierto = abierta === c.id
        const movs = (movimientos || []).filter(m => m.casa_id === c.id)
        return (
          <div className="card" key={c.id}>
            <div className="row c2">
              <div className="field">
                <label htmlFor={`n${i}`}>Nombre</label>
                <input id={`n${i}`} value={c.nombre} onChange={e => up(i, 'nombre', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`s${i}`}>Saldo inicial (L)</label>
                <input id={`s${i}`} inputMode="decimal" value={c.saldo_inicial}
                       onChange={e => up(i, 'saldo_inicial', e.target.value)} />
              </div>
            </div>

            {d && (
              <div className="casa-cifras">
                <div><span>Saldo inicial</span><b>{money(d.saldo_inicial)}</b></div>
                <div><span>Saldo actual</span><b>{money(d.disponible)}</b></div>
                <div><span>Ganancias</span><b className="pos">+{money(d.ganancias)}</b></div>
                <div><span>Pérdidas</span><b className="neg">−{money(d.perdidas)}</b></div>
              </div>
            )}
            {d && (
              <p className="casa-nota">
                {d.enJuego > 0 && <>{money(d.enJuego)} en juego · </>}
                {d.movimientos !== 0 && <>movimientos {money(d.movimientos)} · </>}
                {d.corte ? `contando desde el ${d.corte}` : 'contando desde el principio'}
              </p>
            )}

            <div className="real-casa">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`r${i}`}>Saldo real (lo que ves en la casa)</label>
                <input id={`r${i}`} inputMode="decimal" placeholder="0.00"
                       value={reales[c.id] ?? ''}
                       onChange={e => setReales(r => ({ ...r, [c.id]: e.target.value }))}
                       onBlur={e => guardarReal(c.id, e.target.value)} />
              </div>
              {(() => {
                const casa = casas.find(x => x.id === c.id)
                if (!d || casa?.saldo_real == null) return null
                const dif = Math.round((Number(casa.saldo_real) - d.disponible) * 100) / 100
                if (Math.abs(dif) < 1) return <p className="real-ok">✓ Cuadra</p>
                return (
                  <div className="real-dif">
                    <span>
                      La casa tiene <b>{money(Math.abs(dif))}</b> {dif > 0 ? 'más' : 'menos'} de lo
                      que calcula la app.
                      {casa.saldo_real_fecha && <em> Apuntado el {casa.saldo_real_fecha}.</em>}
                    </span>
                    <button className="tiny" onClick={() => cuadrar(c.id, dif)}>
                      Cuadrar con un {dif > 0 ? 'depósito' : 'retiro'}
                    </button>
                  </div>
                )
              })()}
            </div>

            <button className="extras-toggle"
                    onClick={() => { setAbierta(abierto ? null : c.id); setMonto(''); setNota('') }}>
              {abierto ? '− Cerrar movimientos' : `+ Depositar o retirar${movs.length ? ` · ${movs.length}` : ''}`}
            </button>

            {abierto && (
              <div style={{ marginTop: 12 }}>
                <div className="row c2">
                  <div className="field">
                    <label htmlFor={`mo${i}`}>Monto</label>
                    <div className="con-sufijo">
                      <input id={`mo${i}`} inputMode="decimal" value={monto}
                             onChange={e => setMonto(e.target.value)} placeholder="0.00" />
                      <span className="sufijo">L</span>
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`no${i}`}>Nota</label>
                    <input id={`no${i}`} value={nota} onChange={e => setNota(e.target.value)}
                           placeholder="opcional" />
                  </div>
                </div>
                <div className="row c2">
                  <button className="ghost" onClick={() => movimiento(c.id, 'deposito')}>
                    ↓ Depositar
                  </button>
                  <button className="act" onClick={() => movimiento(c.id, 'retiro')}>
                    ↑ Retirar
                  </button>
                </div>

                {movs.length > 0 && (
                  <table style={{ marginTop: 14 }}>
                    <tbody>
                      <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th></th></tr>
                      {movs.map(m => (
                        <tr key={m.id}>
                          <td>{m.fecha}</td>
                          <td>{m.tipo === 'deposito' ? 'Depósito' : 'Retiro'}</td>
                          <td className={m.tipo === 'retiro' ? 'pos' : ''}>
                            {m.tipo === 'retiro' ? '−' : '+'}{money(Number(m.monto)).replace('L', 'L')}
                          </td>
                          <td>
                            <button className="tiny" onClick={() => borrarMovimiento(m.id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {borrador.length > 1 && (
              <div style={{ marginTop: 12 }}>
                {confirmarQuitar === c.id ? (
                  <div className="flag" style={{ width: '100%' }}>
                    <strong>¿Quitar {c.nombre}?</strong>{' '}
                    Sus apuestas y movimientos se conservan sin casa, así que la banca no
                    cambia. Si ya no tienes dinero ahí, apunta su saldo real en 0 antes.
                    <div className="row c2" style={{ marginTop: 10 }}>
                      <button className="act" onClick={() => quitar(c.id)}>Sí, quitar</button>
                      <button className="ghost" onClick={() => setConfirmarQuitar(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="tiny" onClick={() => setConfirmarQuitar(c.id)}>
                    Quitar casa
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button className="ghost" onClick={anadir}>+ Añadir casa</button>
      <div style={{ height: 12 }} />
      <button className="act" onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar nombres y saldos'}
      </button>

      <div className="flag" style={{ marginTop: 24 }}>
        <strong>Retirar ganancias es buena costumbre.</strong> Deja tu banca en el tamaño
        que decidiste y evita que las rachas buenas se conviertan en apuestas más grandes.
        Regístralo aquí y el saldo seguirá cuadrando.
      </div>

      <div style={{ marginTop: 24 }}>
        <Avisos toast={toast} />
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="tiny" onClick={salir}>Cerrar sesión</button>
      </div>
    </section>
  )
}
