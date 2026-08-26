import { useState, useEffect } from 'react'

/**
 * Campo que escribe rápido y guarda al salir.
 * Antes cada tecla disparaba una llamada a la base de datos y se notaba el tirón.
 */
export default function CampoLento({ valor, onGuardar, etiqueta, id, ...resto }) {
  const [texto, setTexto] = useState(valor ?? '')

  // si el valor cambia desde fuera (p. ej. al elegir un árbitro conocido)
  useEffect(() => { setTexto(valor ?? '') }, [valor])

  return (
    <div className="field">
      {etiqueta && <label htmlFor={id}>{etiqueta}</label>}
      <input id={id} value={texto} {...resto}
             onChange={e => setTexto(e.target.value)}
             onBlur={() => { if (texto !== (valor ?? '')) onGuardar(texto) }} />
    </div>
  )
}
