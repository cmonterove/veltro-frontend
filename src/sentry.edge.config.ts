import * as Sentry from '@sentry/nextjs'
import { sentryBase } from '@/lib/sentry'

// Sentry en el edge (el middleware): lo carga instrumentation.ts
// en desarrollo ni arranca (no mandaría nada y con Turbopack solo deja avisos en la consola)
if (sentryBase.enabled) Sentry.init(sentryBase)
