import { useState } from 'react'
import { comparar, costeMargen } from '../lib/margen'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')
const money = v => (v < 0 ? '−' : '') + 'L' + Math.abs(v || 0).toFixed(2)

const mercadoVacio = () => ({ nombre: '', cuotas: ['', ''] })

export default function Analisis() {
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

  return (
    <section>
      <header className="sec-head">
        <h2>Comisión de la casa</h2>
        <p className="lede">
          Si sumas las probabilidades de todas las opciones de un mercado, debería dar
          100%. Siempre da más: ese exceso es lo que te cobra la casa, y sale de tu
          bolsillo antes de que ruede el balón.
        </p>
      </header>

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
            {mercados.length > 1 && <button className="x" onClick={() => delMercado(i)}>×</button>}
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
                {m.cuotas.length > 2 && <button className="x" onClick={() => delCuota(i, j)}>×</button>}
              </div>
            ))}
          </div>
          <button className="mini" onClick={() => addCuota(i)}>+ Otra opción</button>
          <p className="ayuda">
            Tienen que ser <strong>todas</strong> las opciones: las tres del 1X2, el más y
            el menos de un total, el sí y el no de ambos marcan. Con una sola cuota no se
            puede calcular nada.
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
            Para tener ventaja, tu estimación tiene que superar ese número, no el de la
            cuota.
          </p>
        </div>
      )}
    </section>
  )
}
