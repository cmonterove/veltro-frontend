import * as Sentry from '@sentry/nextjs'
import { sentryBase } from '@/lib/sentry'

// Sentry en el navegador: errores y la traza de la navegación. Solo cuando hubo un error se guarda la grabación de lo
// que hizo la persona justo antes, con todo el texto, los campos y las imágenes tapados.
Sentry.init({
  ...sentryBase,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
})

// La grabación es lo más pesado de Sentry: se baja aparte (de la CDN de Sentry) cuando la app ya cargó, así no pesa
// en la entrada. Si no llega (sin red, un bloqueador), los errores se reportan igual, sin grabación.
if (sentryBase.enabled) {
  Sentry.lazyLoadIntegration('replayIntegration')
    .then((replay) => Sentry.addIntegration(replay({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })))
    .catch(() => {})
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
