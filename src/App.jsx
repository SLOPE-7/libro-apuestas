import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { resumen } from './lib/calc'
import Auth from './components/Auth'
import Resumen from './components/Resumen'
import NuevaApuesta from './components/NuevaApuesta'
import Historial from './components/Historial'
import Cola from './components/Cola'
import Sombra from './components/Sombra'
import Analisis from './components/Analisis'
import Casas from './components/Casas'

/* Cinco pestañas, no siete. Cola y Sombra son el mismo circuito: lo que
   entra al modelo y cómo le fue a lo que salió. Tenerlas separadas obligaba
   a saltar entre las dos para entender una sola cosa. */
const TABS = [
  ['resumen', 'Resumen'],
  ['nueva', 'Registrar'],
  ['historial', 'Historial'],
  ['modelo', 'Modelo'],
  ['casas', 'Casas']
]

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [casas, setCasas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [apuestas, setApuestas] = useState([])
  const [tab, setTab] = useState('resumen')
  const [vistaModelo, setVistaModelo] = useState('cola')
  const [destacada, setDestacada] = useState(null)   // boleto a abrir en Historial
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
    const [{ data: c, error: ec }, { data: a, error: ea }, { data: mv }] = await Promise.all([
      supabase.from('casas').select('*').order('creado_en'),
      supabase.from('apuestas').select('*, selecciones(*)')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false }),
      supabase.from('movimientos').select('*').order('fecha', { ascending: false })
    ])
    setCargando(false)
    if (ec || ea) return toast('No se pudieron cargar los datos')
    setCasas(c ?? [])
    setMovimientos(mv ?? [])
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

  const r = resumen(apuestas, casas, movimientos)

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
                  onClick={() => { setDestacada(null); setTab(id); window.scrollTo(0, 0) }}>
            {label}
          </button>
        ))}
      </nav>

      {cargando && !apuestas.length
        ? <div className="empty">Cargando el libro…</div>
        : <>
            {tab === 'resumen' && (
              <Resumen r={r} apuestas={apuestas}
                       onAbrir={id => { setDestacada(id); setTab('historial') }} />
            )}
            {tab === 'nueva' && (
              <NuevaApuesta casas={casas} banca={r.banca} toast={toast}
                            onGuardado={() => { cargar(); setTab('historial') }} />
            )}
            {tab === 'historial' && (
              <Historial apuestas={apuestas} casas={casas} onCambio={cargar} toast={toast}
                         destacada={destacada} onVista={() => setDestacada(null)} />
            )}

            {tab === 'modelo' && (
              <>
                <div className="segmented" style={{ marginTop: 22 }}>
                  <button className={vistaModelo === 'cola' ? 'on' : ''}
                          onClick={() => { setVistaModelo('cola'); window.scrollTo(0, 0) }}>
                    Cola
                  </button>
                  <button className={vistaModelo === 'sombra' ? 'on' : ''}
                          onClick={() => { setVistaModelo('sombra'); window.scrollTo(0, 0) }}>
                    Sombra
                  </button>
                </div>
                {vistaModelo === 'cola' ? <Cola toast={toast} /> : <Sombra toast={toast} />}
              </>
            )}

            {tab === 'casas' && (
              <>
                <Casas casas={casas} movimientos={movimientos} resumen={r}
                       onCambio={cargar} toast={toast} />
                {/* La calculadora de comisión vive aquí porque habla de lo
                    mismo que esta pantalla: lo que cobra la casa. */}
                <Analisis toast={toast} />
              </>
            )}
          </>}

      {aviso && <div className="toast">{aviso}</div>}
    </div>
  )
}
