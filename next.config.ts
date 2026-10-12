import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Permite compilar producción en otra carpeta sin pisar la del servidor de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // El indicador de Next tapaba el menú de usuario abajo a la izquierda.
  devIndicators: { position: 'bottom-right' },
  experimental: {
    // El explorador de segmentos (solo dev) envuelve los layouts y desalineaba los useId de la barra lateral al hidratar.
    devtoolSegmentExplorer: false,
    // Volver a una pantalla visitada hace poco es instantáneo: los datos viven en el cliente (React Query) y se
    // revalidan solos; el servidor solo arma la estructura de la página.
    staleTimes: { dynamic: 30, static: 180 },
  },
}

export default withNextIntl(nextConfig)
