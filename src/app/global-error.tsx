'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Lo último que se muestra si falla hasta el layout de la app (sin idioma ni estilos cargados): avisa a Sentry y
 * ofrece recargar. Los errores de cada pantalla los atrapa app/error.tsx, con el diseño de Veltro.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          colorScheme: 'light dark',
          background: 'Canvas',
          color: 'CanvasText',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Algo se rompió</h1>
          <p style={{ margin: '0 0 16px', lineHeight: 1.5, opacity: 0.75 }}>Ya registramos el error. Vuelve a cargar la página para seguir.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ font: 'inherit', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
            Volver a cargar
          </button>
        </main>
      </body>
    </html>
  )
}
