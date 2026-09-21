import { useState, useEffect } from 'react'
import { estadoAvisos, activarAvisos, desactivarAvisos, probarAviso } from '../lib/push'

/* ---------------------------------------------------------------------
   Tarjeta de avisos · va en src/components/Avisos.jsx

   Dice exactamente qué falta en vez de un botón que no hace nada: en
   iPhone lo más común es que la app no esté instalada, y sin eso iOS
   no permite avisos por mucho que se toque el botón.
   --------------------------------------------------------------------- */

const TEXTOS = {
  'sin-instalar': 'Para recibir avisos, instala la app: en Safari toca Compartir → Añadir a pantalla de inicio, y ábrela desde ese icono.',
  'sin-soporte': 'Este navegador no admite avisos.',
  'sin-llave': 'Falta configurar la llave de avisos (VITE_VAPID_PUBLIC_KEY) en Vercel.',
  'bloqueado': 'Los avisos están bloqueados. Actívalos en Ajustes del teléfono → KAL → Notificaciones.',
  'inactivo': 'Te aviso 10 minutos antes de que empiecen tus partidos, agrupados por hora, y cada noche a las 8 te mando los de mañana.',
  'activo': 'Activos en este teléfono. Te aviso 10 minutos antes de tus partidos y cada noche a las 8 con los de mañana.'
}

export default function Avisos({ toast }) {
  const [estado, setEstado] = useState('cargando')
  const [ocupado, setOcupado] = useState(false)

  const refrescar = () => estadoAvisos().then(setEstado).catch(() => setEstado('sin-soporte'))
  useEffect(() => { refrescar() }, [])

  async function hacer(fn, ok) {
    setOcupado(true)
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok) }
    catch (e) { toast(e.message) }
    finally { setOcupado(false); refrescar() }
  }

  if (estado === 'cargando') return null

  return (
    <div className={`card avisos ${estado === 'activo' ? 'on' : ''}`}>
      <span className="eyebrow">Avisos al teléfono</span>
      <p className="avisos-txt">{TEXTOS[estado]}</p>

      {estado === 'inactivo' && (
        <button className="act" disabled={ocupado}
                onClick={() => hacer(activarAvisos, 'Avisos activados')}>
          {ocupado ? 'Activando…' : 'Activar avisos'}
        </button>
      )}

      {estado === 'activo' && (
        <div className="row c2">
          <button className="act" disabled={ocupado}
                  onClick={() => hacer(probarAviso,
                    n => n ? 'Aviso de prueba enviado' : 'No llegó: revisa la configuración de la función')}>
            Mandar prueba
          </button>
          <button className="ghost" disabled={ocupado}
                  onClick={() => hacer(desactivarAvisos, 'Avisos desactivados en este teléfono')}>
            Desactivar
          </button>
        </div>
      )}
    </div>
  )
}
