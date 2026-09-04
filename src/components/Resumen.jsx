import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { diagnostico } from '../lib/calc'
import { proximos, cuandoEmpieza } from '../lib/proximos'

const money = v => (v < 0 ? '-' : '') + 'L' + Math.abs(v).toFixed(2)
const pct = v => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%')
const signo = v => (v < 0 ? 'neg' : v > 0 ? 'pos' : '')

export default function Resumen({ r, apuestas = [], onAbrir }) {
  /* La franja se recalcula sola cada minuto para que "en 30 min" no se
     quede congelado si dejas la app abierta. */
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    const alVolver = () => { if (!document.hidden) setAhora(Date.now()) }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [])
  const dias = proximos(apuestas, ahora)
  /* Hoy y mañana se ven siempre; el resto solo si tocas su fecha. Con treinta
     partidos por delante, enseñarlos todos convertía el resumen en un listado. */
  const [diaExtra, setDiaExtra] = useState(null)
  const cerca = dias.slice(0, 2)
  const lejos = dias.slice(2)
  const visibles = diaExtra
    ? [...cerca, ...lejos.filter(d => d.dia === diaExtra)]
    : cerca

  /* Dos cifras mandan y cuatro acompañan. Antes las seis pesaban igual y
     el rendimiento competía en tamaño con la banca, que es lo que de verdad
     tienes. El color del rendimiento se guarda hasta que haya muestra: con
     pocas apuestas, pintarlo de verde premia la suerte. */
  const principales = [
    ['Banca actual', money(r.banca), signo(r.banca - r.inicial)],
    ['Resultado neto', money(r.neto), signo(r.neto)]
  ]
  const hayMuestra = r.resueltas >= 100
  const secundarias = [
    ['Total apostado', money(r.apostado), ''],
    ['Rendimiento', pct(r.yield), hayMuestra && r.yield !== null ? signo(r.yield) : ''],
    ['Resueltas', String(r.resueltas), ''],
    ['Acierto', pct(r.acierto), '']
  ]

  /* El yield con pocas apuestas es ruido. Se enseña el intervalo, no la cifra sola. */
  const rango = r.rango
  const rangoAmplio = rango && (rango.alto - rango.bajo) > 0.30

  return (
    <section>
      {dias.length > 0 && (
        <div className="proximos">
          <div className="sec-label">
            <span className="eyebrow">🗓️ Próximos</span>
            <span className="contador">
              {dias.reduce((a, d) => a + d.horas.reduce((b, h) => b + h.items.length, 0), 0)}
            </span>
          </div>
          {visibles.map(d => (
            <div className="prox-dia" key={d.dia}>
              <div className="prox-cab">{d.etiqueta}</div>
              {d.horas.map(h => (
                <div className={`prox-hora ${h.enJuego ? 'vivo' : ''}`} key={h.hora}>
                  <div className="prox-reloj">
                    <b>{h.hora}</b>
                    <em>{cuandoEmpieza(h.items[0].inicio, ahora)}</em>
                  </div>
                  <div className="prox-lista">
                    {h.items.map(it => (
                      <button className="prox-item" key={it.selId}
                              onClick={() => onAbrir?.(it.apuestaId)}>
                        <span className="prox-part">{it.partido}</span>
                        {it.mercado && <span className="prox-merc">{it.mercado}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {lejos.length > 0 && (
            <div className="prox-fechas">
              {lejos.map(d => (
                <button key={d.dia}
                        className={`prox-chip ${diaExtra === d.dia ? 'on' : ''}`}
                        onClick={() => setDiaExtra(diaExtra === d.dia ? null : d.dia)}>
                  {d.etiqueta}
                  <em>{d.horas.reduce((a, h) => a + h.items.length, 0)}</em>
                </button>
              ))}
            </div>
          )}

          <p className="ayuda">
            Hoy y mañana siempre a la vista; toca una fecha para ver ese día. Solo salen
            los partidos sin resolver de boletos abiertos. Aquí no van importes a
            propósito: es la pantalla que miras con el partido en curso.
          </p>
        </div>
      )}

      <div className="figs figs-alta">
        {principales.map(([k, v, c]) => (
          <div className="fig" key={k}>
            <div className="k">{k}</div>
            <div className={`v ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="figs figs-baja">
        {secundarias.map(([k, v, c]) => (
          <div className="fig" key={k}>
            <div className="k">{k}</div>
            <div className={`v ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {rangoAmplio && (
        <div className="flag">
          <strong>Ese rendimiento no significa lo que parece.</strong> Con {rango.n} apuestas
          resueltas, tu rendimiento real está en algún punto entre {pct(rango.bajo)} y{' '}
          {pct(rango.alto)}. El rango es tan ancho que la cifra de arriba no distingue
          entre tener ventaja y haber tenido suerte.
        </div>
      )}

      {r.anuladas > 0 && (
        <div className="bet-meta" style={{ marginBottom: 14 }}>
          {r.anuladas} {r.anuladas === 1 ? 'apuesta anulada' : 'apuestas anuladas'} fuera del
          cálculo: la casa devolvió el dinero, así que no son ni acierto ni fallo.
        </div>
      )}

      {r.curva.length > 1 && (
        <div className="card">
          <span className="eyebrow">Evolución de la banca</span>
          <div style={{ height: 180, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.curva} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: '#5C6469' }}
                       stroke="#C6C2B6" tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#5C6469' }}
                       stroke="#C6C2B6" tickLine={false} width={52} />
                <ReferenceLine y={r.inicial} stroke="#9EA093" strokeDasharray="3 3" />
                <Tooltip
                  formatter={v => money(v)}
                  labelFormatter={(i, p) => p?.[0]?.payload?.etiqueta ?? `Apuesta ${i}`}
                  contentStyle={{
                    background: '#F6F5F1', border: '1px solid #9EA093',
                    borderRadius: 0, fontSize: 12
                  }} />
                <Line type="monotone" dataKey="banca" stroke="#22282C"
                      strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bet-meta" style={{ marginTop: 4 }}>
            La línea punteada es tu punto de partida. Los depósitos y retiros también
            mueven la curva.
          </div>
        </div>
      )}

      <div className="card">
        <span className="eyebrow">Por casa</span>
        <table>
          <tbody>
            <tr><th>Casa</th><th>Neto</th><th>Saldo</th></tr>
            {r.porCasa.map(c => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td className={signo(c.neto)}>{money(c.neto)}</td>
                <td>{money(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <span className="eyebrow">Simples contra combinadas</span>
        <table>
          <tbody>
            <tr><th>Tipo</th><th>Nº</th><th>Acierto</th><th>Neto</th></tr>
            <tr>
              <td>Simples</td><td>{r.simples.n}</td><td>{pct(r.simples.acierto)}</td>
              <td className={signo(r.simples.neto)}>{money(r.simples.neto)}</td>
            </tr>
            <tr>
              <td>Combinadas</td><td>{r.parlays.n}</td><td>{pct(r.parlays.acierto)}</td>
              <td className={signo(r.parlays.neto)}>{money(r.parlays.neto)}</td>
            </tr>
          </tbody>
        </table>
        <div className="bet-meta" style={{ marginTop: 8 }}>
          Cuenta las patas, no las líneas: una selección con varios mercados del mismo
          partido es combinada.
        </div>
      </div>

      <div className="card">
        <span className="eyebrow">CLV — la métrica que importa</span>
        <p className="lede" style={{ marginBottom: 10 }}>
          Compara la cuota que tomaste con la de cierre. Predice tu rentabilidad futura
          mejor que ganar o perder.
        </p>
        <table>
          <tbody>
            <tr><td>Selecciones con cierre</td><td>{r.clvN}</td></tr>
            <tr>
              <td>CLV medio</td>
              <td className={r.clvMedio === null ? '' : signo(r.clvMedio)}>{pct(r.clvMedio)}</td>
            </tr>
            <tr><td>Porcentaje positivo</td><td>{pct(r.clvPositivo)}</td></tr>
          </tbody>
        </table>
      </div>

      {r.resueltas > 0 && (
        <div className="verdict">{diagnostico(r)}</div>
      )}

      {r.simples.n >= 5 && r.simples.acierto > 0.6 && r.simples.neto < 0 && (
        <div className="flag">
          <strong>Aciertas mucho y pierdes dinero en las simples.</strong>{' '}
          {pct(r.simples.acierto)} de acierto y {money(r.simples.neto)} de resultado
          significa que estás pagando cuotas demasiado bajas para lo que aciertas.
          El acierto no paga; el precio sí.
        </div>
      )}

      {r.parlays.n >= 5 && r.parlays.neto < r.simples.neto && (
        <div className="flag">
          <strong>Las combinadas te están costando dinero.</strong> {money(r.parlays.neto)} frente
          a {money(r.simples.neto)} en simples. Cada selección extra multiplica el margen de
          la casa, no solo la cuota.
        </div>
      )}

      {r.inicial > 0 && r.neto < -r.inicial * 0.25 && (
        <div className="flag">
          <strong>Has perdido más de una cuarta parte de la banca.</strong> Toca parar y
          revisar, no subir montos. El dinero perdido no vuelve con la siguiente apuesta.
        </div>
      )}
    </section>
  )
}
