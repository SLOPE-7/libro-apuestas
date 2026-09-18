import { familiaDe } from '../lib/mercados'

/**
 * Tu propio rendimiento en ese tipo de mercado, enseñado EN EL MOMENTO de
 * elegirlo y no después en otra pestaña.
 *
 * El desglose de Sombra ya tenía este dato, pero vivía donde lo mirabas al
 * repasar. Aquí aparece cuando todavía puedes hacer algo con él.
 *
 * Por debajo de 30 registros no da veredicto: con menos, un grupo en verde
 * es indistinguible de la suerte y enseñarlo como señal sería peor que
 * callarse.
 */
export default function Historico({ mercado, datos }) {
  if (!mercado || !datos) return null
  const fam = familiaDe(mercado)
  const d = datos[fam]
  if (!d || d.n < 5) return null

  const pobre = d.n < 30
  const pct = v => (v * 100).toFixed(1) + '%'
  const signo = d.yield > 0.02 ? 'pos' : d.yield < -0.02 ? 'neg' : ''

  return (
    <div className={`historico ${pobre ? 'flojo' : signo}`}>
      <span className="historico-fam">{fam}</span>
      <span className="historico-datos">
        {d.n} registros · acierto {pct(d.acierto)} ·{' '}
        <b>yield {d.yield > 0 ? '+' : ''}{pct(d.yield)}</b>
      </span>
      {pobre
        ? <span className="historico-nota">muestra corta, aún no dice nada</span>
        : d.yield < -0.02
          ? <span className="historico-nota">este mercado te ha costado dinero</span>
          : null}
    </div>
  )
}
