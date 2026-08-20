import { useState, useRef, useEffect } from 'react'

/**
 * Campo de texto con sugerencias.
 * No usa <datalist> porque Safari en iOS lo muestra mal o directamente lo ignora.
 */
export default function AutoInput({
  value, onChange, opciones = [], placeholder, id, ariaLabel, inputMode
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [])

  const q = (value || '').trim().toLowerCase()
  const sugerencias = opciones
    .filter(o => {
      const t = o.toLowerCase()
      return t !== q && (q === '' ? true : t.includes(q))
    })
    .slice(0, 6)

  return (
    <div className="auto" ref={caja}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="auto-lista" role="listbox">
          {sugerencias.map(o => (
            <li key={o}>
              <button type="button" onClick={() => { onChange(o); setAbierto(false) }}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
