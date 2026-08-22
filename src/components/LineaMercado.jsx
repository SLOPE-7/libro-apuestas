import { useState } from 'react'

/**
 * Selector de línea al estilo de una casa de apuestas.
 * Eliges lado (Más / Menos) y deslizas hasta la línea que te interesa.
 */
export default function LineaMercado({ titulo, unidad, lineasMas, lineasMenos, puestos, onAlternar }) {
  const [lado, setLado] = useState('Más')
  const [i, setI] = useState(0)

  const lineas = lado === 'Más' ? lineasMas : lineasMenos
  const idx = Math.min(i, lineas.length - 1)
  const linea = lineas[idx]
  const texto = `${lado} de ${linea.toFixed(1)} ${unidad}`
  const activo = puestos.includes(texto)

  function cambiarLado(l) {
    const actual = (lado === 'Más' ? lineasMas : lineasMenos)[idx]
    const nuevas = l === 'Más' ? lineasMas : lineasMenos
    // conserva la línea más parecida al cambiar de lado
    let mejor = 0
    nuevas.forEach((v, j) => {
      if (Math.abs(v - actual) < Math.abs(nuevas[mejor] - actual)) mejor = j
    })
    setLado(l)
    setI(mejor)
  }

  return (
    <div className="linea">
      <div className="linea-top">
        <span className="linea-titulo">{titulo}</span>
        <div className="linea-lados">
          <button className={lado === 'Más' ? 'on' : ''} onClick={() => cambiarLado('Más')}>Más</button>
          <button className={lado === 'Menos' ? 'on' : ''} onClick={() => cambiarLado('Menos')}>Menos</button>
        </div>
      </div>

      <div className="linea-valor">
        <span className="linea-num">{linea.toFixed(1)}</span>
        <span className="linea-txt">{texto}</span>
      </div>

      <input type="range" className="linea-slider"
             min={0} max={lineas.length - 1} step={1} value={idx}
             onChange={e => setI(Number(e.target.value))}
             aria-label={`Línea de ${unidad}`} />

      <div className="linea-extremos">
        <span>{lineas[0].toFixed(1)}</span>
        <span>{lineas[lineas.length - 1].toFixed(1)}</span>
      </div>

      <button className={`linea-add ${activo ? 'on' : ''}`} onClick={() => onAlternar(texto)}>
        {activo ? '✓ Añadido · tocar para quitar' : '+ Añadir este mercado'}
      </button>
    </div>
  )
}
