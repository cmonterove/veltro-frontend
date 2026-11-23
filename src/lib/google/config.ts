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

/**
 * La dirección pública de la web (a ella vuelven Google y Supabase). Sin NEXT_PUBLIC_APP_URL, en
 * Vercel vale su dominio de producción (VERCEL_PROJECT_PRODUCTION_URL lo pone Vercel solo).
 */
export function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return vercel ? `https://${vercel}` : 'http://localhost:3000'
}

/** A dónde vuelve Google (la API usa esta misma por defecto: PUBLIC_WEB_URL + esta ruta). */
export function googleRedirectUri() {
  return `${appUrl()}/api/integrations/google/callback`
}
