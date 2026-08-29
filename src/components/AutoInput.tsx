import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Campo de texto con sugerencias.
 * No usa <datalist> porque Safari en iOS lo muestra mal o directamente lo ignora.
 *
 * Lo que escribes vive aquí dentro. El padre solo se entera cuando paras de
 * teclear o eliges una sugerencia: así no se redibuja media pantalla por letra.
 */
export default function AutoInput({
  value, onChange, opciones = [], placeholder, id, ariaLabel, inputMode, espera = 400
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(value ?? '')
  const caja = useRef(null)
  const reloj = useRef(null)
  const tecleando = useRef(false)

  // si el valor cambia desde fuera y no estás escribiendo, se refleja
  useEffect(() => {
    if (!tecleando.current) setTexto(value ?? '')
  }, [value])

  useEffect(() => {
    const fuera = e => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      clearTimeout(reloj.current)
    }
  }, [])

  const sugerencias = useMemo(() => {
    const q = (texto || '').trim().toLowerCase()
    const out = []
    for (const o of opciones) {
      const t = o.toLowerCase()
      if (t === q) continue
      if (q === '' || t.includes(q)) out.push(o)
      if (out.length === 6) break        // corta pronto: listas largas ralentizan
    }
    return out
  }, [texto, opciones])

  function escribir(v) {
    setTexto(v)
    setAbierto(true)
    tecleando.current = true
    clearTimeout(reloj.current)
    reloj.current = setTimeout(() => {
      tecleando.current = false
      onChange(v)
    }, espera)
  }

  function elegir(o) {
    clearTimeout(reloj.current)
    tecleando.current = false
    setTexto(o)
    setAbierto(false)
    onChange(o)
  }

  function salir() {
    clearTimeout(reloj.current)
    tecleando.current = false
    if (texto !== (value ?? '')) onChange(texto)
  }

  return (
    <div className="auto" ref={caja}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode={inputMode}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck="false"
        onChange={e => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={salir}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="auto-lista" role="listbox">
          {sugerencias.map(o => (
            <li key={o}>
              <button type="button" onMouseDown={e => e.preventDefault()}
                      onClick={() => elegir(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
