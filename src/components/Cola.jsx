import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import AutoInput from './AutoInput'
import LineaMercado from './LineaMercado'
import CampoLento from './CampoLento'
import { permisoAvisos, pedirPermiso, programar, cancelar } from '../lib/avisos'

const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%')

const DISCRETOS = [
  '1X2 - gana el local', '1X2 - empate', '1X2 - gana el visitante',
  'Doble oportunidad - local o empate', 'Doble oportunidad - visitante o empate',
  'Ambos equipos marcan',
  'Local gana cualquier mitad', 'Visitante gana cualquier mitad',
  'Más de 0.5 goles en la primera mitad', 'Más de 1.5 goles en la primera mitad',
  'Menos de 1.5 goles en la primera mitad', 'Más de 2.5 goles en la primera mitad',
  'Primera mitad 1X', 'Primera mitad 2X',
  'Local más de 0.5 goles', 'Visitante más de 0.5 goles',
  'Local Hándicap +0', 'Local Hándicap +0.5', 'Local Hándicap +1',
  'Local Hándicap +1.5', 'Local Hándicap +2', 'Local Hándicap +2.5',
  'Visitante Hándicap +0', 'Visitante Hándicap +0.5', 'Visitante Hándicap +1',
  'Visitante Hándicap +1.5', 'Visitante Hándicap +2', 'Visitante Hándicap +2.5',
  'Se clasifica el local', 'Se clasifica el visitante'
]

const L_GOLES         = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_CORNERS_MAS   = [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
const L_CORNERS_MENOS = [...L_CORNERS_MAS, 15.5, 16.5]
const L_TARJ_MAS      = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]
const L_TARJ_MENOS    = [...L_TARJ_MAS, 7.5]

const ESTADO_TXT = {
  pendiente: 'Sin analizar', analizando: 'Analizando…',
  listo: 'Listo', error: 'Error'
}

/** Momento de inicio del partido, o null si falta fecha u hora. */
function inicioDe(it) {
  if (!it.fecha_partido || !it.hora) return null
  const [h, m] = String(it.hora).split(':').map(Number)
  if (Number.isNaN(h)) return null
  const d = new Date(`${it.fecha_partido}T00:00:00`)
  d.setHours(h, m || 0, 0, 0)
  return d
}

export default function Cola({ toast }) {
  const [items, setItems] = useState([])
  const [equipos, setEquipos] = useState([])
  const [arbitros, setArbitros] = useState([])
  const [competiciones, setCompeticiones] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [extras, setExtras] = useState({})
  const [editando, setEditando] = useState({})
  const [gruposAbiertos, setGruposAbiertos] = useState({})
  const [seleccion, setSeleccion] = useState([])
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [permiso, setPermiso] = useState(permisoAvisos())
  const [ahora, setAhora] = useState(Date.now())

  // temporizadores para no escribir en la base en cada tecla
  const esperas = useRef({})

  const [nuevo, setNuevo] = useState({
    local: '', visitante: '', competicion: '', fecha_partido: '', hora: ''
  })
  // arranca vacío a propósito: cada partido se elige a conciencia
  const [mercados, setMercados] = useState([])

  const alternarMercado = m =>
    setMercados(l => (l.includes(m) ? l.filter(x => x !== m) : [...l, m]))

  async function recargar() {
    const { data } = await supabase.from('cola')
      .select('*').order('creado_en', { ascending: false })
    setItems(data || [])
  }

  useEffect(() => {
    recargar()
    supabase.from('arbitros').select('*').order('visto_en', { ascending: false })
      .then(({ data }) => setArbitros(data || []))
    supabase.from('competiciones').select('*').order('visto_en', { ascending: false })
      .then(({ data }) => setCompeticiones((data || []).map(c => c.nombre)))
    supabase.from('selecciones').select('partido').limit(600).then(({ data }) => {
      if (!data) return
      setEquipos([...new Set(
        data.flatMap(s => (s.partido || '').split(/\s+vs\.?\s+/i))
            .map(t => t.trim()).filter(Boolean)
      )].sort())
    })
    // al desmontar, se lanzan los guardados que quedaran pendientes
    return () => Object.values(esperas.current).forEach(t => clearTimeout(t))
  }, [])

  /* Reloj: refresca "ya empezaron" cada minuto y al volver a la app. */
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000)
    const alVolver = () => { if (!document.hidden) setAhora(Date.now()) }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  useEffect(() => {
    if (permiso !== 'granted') return
    items.forEach(it => {
      if (it.fecha_partido && it.hora) {
        programar(it.id, `${it.local} vs ${it.visitante}`, it.fecha_partido, it.hora)
      } else {
        cancelar(it.id)
      }
    })
  }, [items, permiso])

  async function recordarCompeticion(nombre) {
    const n = (nombre || '').trim()
    if (!n) return
    const fila = { nombre: n, visto_en: new Date().toISOString() }
    const { error } = await supabase.from('competiciones')
      .upsert(fila, { onConflict: 'user_id,nombre' })
    if (!error) setCompeticiones(l => [n, ...l.filter(x => x !== n)])
  }

  async function recordarArbitro(nombre, amarillas, rojas) {
    const n = (nombre || '').trim()
    if (!n) return
    const fila = {
      nombre: n,
      amarillas: amarillas === '' || amarillas == null ? null : Number(amarillas),
      rojas: rojas === '' || rojas == null ? null : Number(rojas),
      visto_en: new Date().toISOString()
    }
    const { error } = await supabase.from('arbitros')
      .upsert(fila, { onConflict: 'user_id,nombre' })
    // se actualiza la lista en memoria en vez de volver a pedirla entera
    if (!error) setArbitros(l => [fila, ...l.filter(a => a.nombre !== n)])
  }

  async function anadir() {
    if (!nuevo.local.trim() || !nuevo.visitante.trim())
      return toast('Escribe los dos equipos')
    if (!mercados.length) return toast('Elige al menos un mercado')

    const { data, error } = await supabase.from('cola').insert({
      local: nuevo.local
