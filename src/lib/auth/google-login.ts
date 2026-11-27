import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { API_URL, sessionCookies } from '@/lib/api/session-cookies'

// Entrar con Google sin la pantalla de Supabase: Google vuelve a la web (app.byveltro.com), así que
// en «Elige una cuenta» sale el dominio de Veltro y no el de Supabase. La web guarda el estado y el
// nonce en una cookie, la API canjea el código por el id_token y Supabase Auth crea la sesión con él.

export const GOOGLE_LOGIN_COOKIE = 'vt-glogin'
export const GOOGLE_LOGIN_PATH = '/api/integrations/google'

export type GoogleLoginCookie = { s: string; n: string; next: string }

export const googleLoginCookie = (value: string, maxAge: number) => ({
  name: GOOGLE_LOGIN_COOKIE,
  value,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: GOOGLE_LOGIN_PATH,
  secure: process.env.NODE_ENV === 'production',
  maxAge,
})

function readCookie(request: NextRequest): GoogleLoginCookie | null {
  const raw = request.cookies.get(GOOGLE_LOGIN_COOKIE)?.value
  if (!raw) return null
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString()) as GoogleLoginCookie
    return typeof v.s === 'string' && typeof v.n === 'string' ? v : null
  } catch {
    return null
  }
}

/** La vuelta de Google cuando el estado empieza con «login.». */
export async function finishGoogleLogin(request: NextRequest, state: string) {
  const params = request.nextUrl.searchParams
  const saved = readCookie(request)
  const done = (path: string, session?: { access_token: string; refresh_token: string; expires_in: number }) => {
    const res = NextResponse.redirect(new URL(path, request.url))
    res.cookies.set(googleLoginCookie('', 0))
    if (session) {
      for (const c of sessionCookies({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in })) res.cookies.set(c)
    }
    return res
  }

  // canceló en Google: vuelve al login sin error
  if (params.get('error') === 'access_denied') return done('/login')
  const code = params.get('code')
  if (!saved || saved.s !== state || !code) return done('/login?error=link_expired')

  const r = await fetch(`${API_URL}/v1/auth/google/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    cache: 'no-store',
  }).catch(() => null)
  const body = (await r?.json().catch(() => null)) as { idToken?: string } | null
  if (!r?.ok || !body?.idToken) return done('/login?error=oauth_unavailable')

  const supabase = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: body.idToken, nonce: saved.n })
  if (error || !data.session) return done('/login?error=oauth_unavailable')

  const next = saved.next.startsWith('/') && !saved.next.startsWith('//') ? saved.next : '/home'
  return done(next, data.session)
}
