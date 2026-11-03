import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sessionCookies } from '@/lib/api/session-cookies'

// Vuelta de Google/Apple (OAuth de Supabase) y enlaces con token_hash. El canje lo hace Supabase
// Auth; la sesión resultante queda en las cookies de la API, que es por donde pasa todo lo demás.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = searchParams.get('next')
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/home'
  const supabase = await createClient()

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  let session: Session | null = null
  if (code) {
    session = (await supabase.auth.exchangeCodeForSession(code)).data.session
  } else if (tokenHash && type) {
    session = (await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).data.session
  }

  const res = NextResponse.redirect(new URL(session ? target : '/login?error=link_expired', origin))
  if (session) {
    for (const c of sessionCookies({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in })) res.cookies.set(c)
  }
  // sin la copia de supabase-js: si la refrescara por su cuenta, el token de refresco de la API dejaría de servir
  for (const c of request.cookies.getAll()) if (c.name.startsWith('sb-')) res.cookies.delete(c.name)
  return res
}
