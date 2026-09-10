import { useState } from 'react'
import { varianza } from '../lib/varianza'

/**
 * Enseña qué se siente vivir una probabilidad, no predice nada.
 * Va plegado: es contexto para cuando dudas, no algo que mirar siempre.
 */
export default function Varianza({ mercado, prob, cuota }) {
  const [abierto, setAbierto] = useState(false)
  const v = varianza(prob, cuota, 20, 10000, mercado || '')
  if (!v) return null

  const rojo = v.esperado < 0
  const u = x => (x >= 0 ? '+' : '') + x.toFixed(1)

  return (
    <div className="varianza">
      <button className="varianza-cab" onClick={() => setAbierto(a => !a)}
              aria-expanded={abierto}>
        <span>Cómo se ve esto en 20 apuestas</span>
        <span className="chevron">{abierto ? '−' : '+'}</span>
      </button>

      {abierto && (
        <div className="varianza-cuerpo">
          {/* Una tanda concreta. Siempre la misma para este mercado:
              no es una tirada que puedas repetir hasta que salga bonita. */}
          <div className="tanda" aria-label="Una tanda de veinte apuestas">
            {v.muestra.map((ok, i) => (
              <span key={i} className={`marca ${ok ? 'ok' : 'no'}`} aria-hidden="true" />
            ))}
          </div>

          <p className="varianza-txt">
            A este precio, veinte apuestas así acaban <b>{u(v.esperado)}</b> veces
            lo apostado de media. Pero el recorrido va desde <b>{u(v.malo)}</b> en
            una mala tanda hasta <b>{u(v.bueno)}</b> en una buena.
          </p>

          <div className="varianza-cifras">
            <div>
              <span className="k">Acabas en rojo</span>
              <span className={`v ${v.enPerdida > 0.5 ? 'neg' : ''}`}>
                {(v.enPerdida * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="k">Fallos seguidos</span>
              <span className="v">{v.rachaTipica} · hasta {v.peorRacha}</span>
            </div>
          </div>

          <p className="ayuda">
            {rojo
              ? 'El valor esperado es negativo: por buena que salga una tanda, repetir esto pierde dinero. Una racha ganadora aquí es suerte, no señal.'
              : `Perder ${v.rachaTipica + 1} o ${v.peorRacha} seguidas entra dentro de lo normal con esta probabilidad. Que pase no significa que la estimación estuviera mal.`}
          </p>
        </div>
      )}
    </div>
  )
}
