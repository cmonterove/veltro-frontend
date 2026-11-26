/**
 * Lo común a Sentry en el navegador, el servidor y el edge: a qué proyecto van los errores, cuándo se mandan y qué
 * NO viaja. Solo manda el build de producción (Vercel o `next start`); `next dev` no manda nada. No viajan IP,
 * correos, cookies, cuerpos de las peticiones ni variables internas: de la persona, solo su id (AppProvider en el
 * navegador, getAppContext en el servidor).
 */

// el DSN no es secreto (va en el navegador): solo dice a qué proyecto van los errores (veltro-web, organización neris-soft)
const DSN = 'https://b99f710bc6d8afa642268ed372b46124@o4512495530737664.ingest.us.sentry.io/4512495563571200'

const produccion = process.env.NODE_ENV === 'production'

// lo que identifica a alguien sin ser una credencial (la lista fija de Sentry ya tapa tokens, claves y sesiones)
const IDENTIFICA = ['forwarded', '-ip', 'remote-', 'via', '-user', 'email', 'correo']

export const sentryBase = {
  dsn: DSN,
  enabled: produccion,
  // production o preview en Vercel; un build de producción en una computadora queda como «local»
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || (produccion ? 'local' : 'development'),
  // la traza de una de cada diez visitas en producción
  tracesSampleRate: produccion ? 0.1 : 1.0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { deny: IDENTIFICA },
    httpBodies: [],
    urlQueryParams: { deny: [...IDENTIFICA, 'q', 'query', 'search', 'name'] },
    databaseQueryData: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
  },
}
