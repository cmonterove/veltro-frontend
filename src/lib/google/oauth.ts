import 'server-only'
import { GOOGLE_SCOPES, googleRedirectUri } from './config'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export type GoogleTokens = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token?: string
}

export function buildAuthUrl(state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `${AUTH_URL}?${params}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok) {
    const err = new Error(json.error ?? 'google_token_error') as Error & { code?: string }
    err.code = json.error
    throw err
  }
  return json as GoogleTokens
}

export function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: googleRedirectUri() })
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
}

export async function revokeToken(token: string) {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null)
}

export async function fetchGoogleEmail(accessToken: string) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!res.ok) return null
  const json = (await res.json()) as { email?: string }
  return json.email ?? null
}
