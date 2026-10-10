import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/session'
import { exchangeCode, fetchGoogleEmail } from '@/lib/google/oauth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

const STATE_COOKIE = 'veltro-google-state'

export async function GET(request: NextRequest) {
  const store = await cookies()
  const raw = store.get(STATE_COOKIE)?.value
  store.delete({ name: STATE_COOKIE, path: '/api/integrations/google' })

  const fail = (reason: string, returnTo = '/settings/integrations') =>
    NextResponse.redirect(new URL(`${returnTo}${returnTo.includes('?') ? '&' : '?'}google=${reason}`, request.url))

  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  let saved: { state: string; returnTo: string; uid: string } | null = null
  try {
    saved = raw ? JSON.parse(raw) : null
  } catch {
    saved = null
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) return fail('denied', saved?.returnTo)
  if (!saved || saved.state !== params.get('state') || saved.uid !== user.id) return fail('invalid_state')

  const code = params.get('code')
  if (!code) return fail('denied', saved.returnTo)

  try {
    const tokens = await exchangeCode(code)
    const grantedScopes = tokens.scope.split(' ')
    if (!grantedScopes.some((s) => s.includes('calendar'))) return fail('missing_scope', saved.returnTo)

    const admin = createAdminClient()
    const { data: existing } = await admin.from('google_connections').select('refresh_token').eq('user_id', user.id).maybeSingle()
    const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refresh_token
    if (!refresh) return fail('no_refresh_token', saved.returnTo)

    const email = (await fetchGoogleEmail(tokens.access_token)) ?? user.email ?? ''

    const { error } = await admin.from('google_connections').upsert({
      user_id: user.id,
      google_email: email,
      refresh_token: refresh,
      access_token: encrypt(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: grantedScopes,
    })
    if (error) return fail('save_failed', saved.returnTo)

    const target = new URL(saved.returnTo, request.url)
    target.searchParams.set('google', 'connected')
    return NextResponse.redirect(target)
  } catch {
    return fail('exchange_failed', saved.returnTo)
  }
}
