import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v || 0).toFixed(2)

export default function Casas({ casas, movimientos, resumen, onCambio, toast }) {
  const [borrador, setBorrador] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')

  // se sincroniza cada vez que cambian las casas: sin esto, al añadir una nueva
  // no aparecía hasta reiniciar la app
  useEffect(() => {
    setBorrador(casas.map(c => ({
      id: c.id, nombre: c.nombre, saldo_inicial: String(c.saldo_inicial ?? 0)
    })))
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
    toast('Casa eliminada')
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

  return (
    <section>
      <header className="sec-head">
        <h2>Casas y saldos</h2>
        <p className="lede">
          Tu banca es la suma de todas, no bancas separadas. Los depósitos y retiros
          se registran aparte para que el saldo siempre cuadre.
        </p>
      </header>

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
              <div className="bet-sub" style={{ marginBottom: 10 }}>
                saldo {money(d.saldo)}
                {d.movimientos !== 0 && ` · movimientos ${money(d.movimientos)}`}
                {` · apuestas ${money(d.neto)}`}
              </div>
            )}

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
                <button className="tiny" onClick={() => quitar(c.id)}>Quitar casa</button>
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

      <div style={{ marginTop: 20 }}>
        <button className="tiny" onClick={salir}>Cerrar sesión</button>
      </div>
    </section>
  )
}
