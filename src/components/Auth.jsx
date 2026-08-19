import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setCargando(true); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    setCargando(false)
    if (error) setError(error.message)
    else setEnviado(true)
  }

  return (
    <div className="center">
      <h1 style={{ marginBottom: 6 }}>Libro de apuestas</h1>
      <p className="lede">
        Tus datos quedan atados a tu cuenta y se sincronizan entre teléfono y computadora.
      </p>
      {enviado ? (
        <div className="card">
          Te mandamos un enlace a <strong>{email}</strong>. Ábrelo en el dispositivo
          donde quieras usar el libro.
        </div>
      ) : (
        <form onSubmit={entrar}>
          <div className="row">
            <div>
              <label htmlFor="email">Correo</label>
              <input id="email" type="email" required value={email}
                     onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" />
            </div>
          </div>
          {error && <div className="flag"><strong>No se pudo entrar.</strong> {error}</div>}
          <button className="act" disabled={cargando}>
            {cargando ? 'Enviando…' : 'Enviar enlace de acceso'}
          </button>
        </form>
      )}
    </div>
  )
}
