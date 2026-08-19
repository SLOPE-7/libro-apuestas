import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { diagnostico } from '../lib/calc'

const money = v => (v < 0 ? '-' : '') + 'L' + Math.abs(v).toFixed(2)
const pct = v => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%')
const signo = v => (v < 0 ? 'neg' : v > 0 ? 'pos' : '')

export default function Resumen({ r }) {
  const figs = [
    ['Banca actual', money(r.banca), signo(r.banca - r.inicial)],
    ['Resultado neto', money(r.neto), signo(r.neto)],
    ['Total apostado', money(r.apostado), ''],
    ['Rendimiento', pct(r.yield), r.yield === null ? '' : signo(r.yield)],
    ['Resueltas', String(r.resueltas), ''],
    ['Acierto', pct(r.acierto), '']
  ]

  return (
    <section>
      <div className="figs">
        {figs.map(([k, v, c]) => (
          <div className="fig" key={k}>
            <div className="k">{k}</div>
            <div className={`v ${c}`}>{v}</div>
          </div>
        ))}
      </div>

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
                  labelFormatter={i => `Apuesta ${i}`}
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
            La línea punteada es tu punto de partida
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
