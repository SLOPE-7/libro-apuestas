import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Casas({ casas, onCambio, toast }) {
  const [borrador, setBorrador] = useState(
    casas.map(c => ({ id: c.id, nombre: c.nombre, saldo_inicial: String(c.saldo_inicial) }))
  )
  const [guardando, setGuardando] = useState(false)

  const up = (i, k, v) => setBorrador(b => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function anadir() {
    const { error } = await supabase.from('casas').insert({ nombre: 'Nueva casa', saldo_inicial: 0 })
    if (error) return toast('No se pudo añadir: ' + error.message)
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
      const { error } = await supabase
        .from('casas')
        .update({
          nombre: c.nombre.trim() || 'Sin nombre',
          saldo_inicial: Number(c.saldo_inicial) || 0
        })
        .eq('id', c.id)
      if (error) { setGuardando(false); return toast('No se pudo guardar: ' + error.message) }
    }
    setGuardando(false)
    toast('Saldos guardados')
    onCambio()
  }

  async function salir() {
    await supabase.auth.signOut()
  }

  return (
    <section>
      <h2>Casas y saldos</h2>
      <p className="lede">Tu banca es la suma de las tres, no tres bancas separadas.</p>

      {borrador.map((c, i) => (
        <div className="card" key={c.id}>
          <div className="row c2">
            <div>
              <label htmlFor={`n${i}`}>Nombre</label>
              <input id={`n${i}`} value={c.nombre} onChange={e => up(i, 'nombre', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`s${i}`}>Saldo inicial (L)</label>
              <input id={`s${i}`} inputMode="decimal" value={c.saldo_inicial}
                     onChange={e => up(i, 'saldo_inicial', e.target.value)} />
            </div>
          </div>
          {casas.length > 1 &&
            <button className="tiny" onClick={() => quitar(c.id)}>Quitar</button>}
        </div>
      ))}

      <button className="ghost" onClick={anadir}>+ Añadir casa</button>
      <div style={{ height: 12 }} />
      <button className="act" onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar saldos'}
      </button>

      <div className="flag" style={{ marginTop: 24 }}>
        <strong>Sobre los picks automáticos.</strong> Este libro no genera pronósticos. Un
        modelo sin datos de alineaciones, lesiones y cuotas en vivo produciría picks que
        suenan seguros y no lo son — exactamente lo que más caro sale. La probabilidad
        implícita sale de la cuota, que ya es la mejor estimación disponible del mercado.
        Tu ventaja, si existe, está en discrepar de ella con criterio y anotarlo.
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="tiny" onClick={salir}>Cerrar sesión</button>
      </div>
    </section>
  )
}
