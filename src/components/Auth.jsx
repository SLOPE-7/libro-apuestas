import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [modo, setModo] = useState('entrar')   // 'entrar' | 'crear'
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')

    if (clave.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.')
      return
    }

    setCargando(true)
    const { error } = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: clave })
      : await supabase.auth.signUp({ email, password: clave })
    setCargando(false)

    if (error) {
      const m = error.message
      setError(
        m.includes('Invalid login credentials')
          ? 'Correo o contraseña incorrectos.'
          : m.includes('already registered')
            ? 'Ese correo ya tiene cuenta. Usa "Ya tengo cuenta".'
            : m
      )
    }
    // Si va bien, onAuthStateChange en App.jsx se encarga del resto.
  }

  return (
    <div className="center">
      <h1 style={{ marginBottom: 6 }}>Libro de apuestas</h1>
      <p className="lede">
        Tus datos quedan atados a tu cuenta y se sincronizan entre teléfono y computadora.
      </p>

      <form onSubmit={enviar}>
        <div className="row">
          <div>
            <label htmlFor="email">Correo</label>
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave" type="password" required
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              value={clave} onChange={e => setClave(e.target.value)}
              placeholder="mínimo 6 caracteres"
            />
          </div>
        </div>

        {error && <div className="flag"><strong>No se pudo entrar.</strong> {error}</div>}

        <button className="act" disabled={cargando}>
          {cargando
            ? 'Un momento…'
            : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button
          className="tiny"
          onClick={() => { setModo(modo === 'entrar' ? 'crear' : 'entrar'); setError('') }}
        >
          {modo === 'entrar' ? 'No tengo cuenta todavía' : 'Ya tengo cuenta'}
        </button>
      </div>
    </div>
  )
}
