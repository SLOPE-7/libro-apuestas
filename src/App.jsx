import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { resumen } from './lib/calc'
import Auth from './components/Auth'
import Resumen from './components/Resumen'
import NuevaApuesta from './components/NuevaApuesta'
import Historial from './components/Historial'
import Casas from './components/Casas'
import Analisis from './components/Analisis'
import Cola from './components/Cola'


const TABS = [
  ['resumen', 'Resumen'],
  ['nueva', 'Registrar'],
  ['historial', 'Historial'],
  ['analisis', 'Análisis'],
  ['casas', 'Casas']
  ['cola', 'Cola'],

]

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [casas, setCasas] = useState([])
  const [apuestas, setApuestas] = useState([])
  const [tab, setTab] = useState('resumen')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(true)

  const toast = m => { setAviso(m); setTimeout(() => setAviso(''), 2300) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!sesion) return
    setCargando(true)
    const [{ data: c, error: ec }, { data: a, error: ea }] = await Promise.all([
      supabase.from('casas').select('*').order('creado_en'),
      supabase
        .from('apuestas')
        .select('*, selecciones(*)')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false })
    ])
    setCargando(false)
    if (ec || ea) return toast('No se pudieron cargar los datos')
    setCasas(c ?? [])
    setApuestas(
      (a ?? []).map(x => ({
        ...x,
        selecciones: (x.selecciones ?? []).sort((p, q) => p.orden - q.orden)
      }))
    )
  }, [sesion])

  useEffect(() => { cargar() }, [cargar])

  if (sesion === undefined) return <div className="center">Cargando…</div>
  if (!sesion) return <Auth />

  const r = resumen(apuestas, casas)

  return (
    <div className="wrap">
      <header className="app">
        <h1>KAL Analiza y Registra</h1>
        <span className="folio">
          {apuestas.length
            ? `${apuestas.length} asiento${apuestas.length > 1 ? 's' : ''}`
            : 'sin asientos'}
        </span>
      </header>

      <nav role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
                  onClick={() => { setTab(id); window.scrollTo(0, 0) }}>
            {label}
          </button>
        ))}
      </nav>

      {cargando && !apuestas.length
        ? <div className="empty">Cargando el libro…</div>
        : <>
            {tab === 'resumen' && <Resumen r={r} />}
            {tab === 'nueva' && (
              <NuevaApuesta
                casas={casas}
                banca={r.banca}
                toast={toast}
                onGuardado={() => { cargar(); setTab('historial') }}
              />
            )}
            {tab === 'historial' && (
              <Historial apuestas={apuestas} casas={casas} onCambio={cargar} toast={toast} />
            )}
            {tab === 'analisis' && <Analisis toast={toast} />}
            {tab === 'casas' && <Casas casas={casas} onCambio={cargar} toast={toast} />}
            {tab === 'cola' && <Cola toast={toast} />}

          </>}

      {aviso && <div className="toast">{aviso}</div>}
    </div>
  )
}
