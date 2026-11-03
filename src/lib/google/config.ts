import 'server-only'
import { DEMO } from '@/lib/demo/config'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]

/** Solo para el demo: fuera de él, si Google está configurado lo dice la API (`google.configured`). */
export function isGoogleConfigured() {
  return DEMO || Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/** A dónde vuelve Google (la API usa esta misma por defecto: PUBLIC_WEB_URL + esta ruta). */
export function googleRedirectUri() {
  return `${appUrl()}/api/integrations/google/callback`
}
