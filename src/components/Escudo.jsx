import { banderaDe, inicialesDe, colorDe } from '../lib/emblemas'

/**
 * Distintivo de equipo: iniciales sobre un color sacado del nombre.
 * NO es un escudo real — ver el porqué en lib/emblemas.js.
 *
 * Acepta "Porto vs City" y usa solo el local, para que sirva igual con
 * un nombre suelto que con el partido entero, que es como lo guardan
 * las selecciones.
 */
export function Escudo({ equipo, titulo }) {
  const nombre = String(equipo || '').split(/\s+vs\.?\s+/i)[0].trim()
  if (!nombre) return null
  const c = colorDe(nombre)
  return (
    <span className="escudo" aria-hidden="true" title={titulo ?? nombre}
          style={{ background: c.fondo, color: c.texto, borderColor: c.borde }}>
      {inicialesDe(nombre)}
    </span>
  )
}

/** Bandera del país como emoji. Vacío si no lo conocemos: mejor nada que un genérico. */
export function Bandera({ pais }) {
  const b = banderaDe(pais)
  if (!b) return null
  return <span className="bandera" role="img" aria-label={pais}>{b}</span>
}
