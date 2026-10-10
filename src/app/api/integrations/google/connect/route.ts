import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/session'
import { buildAuthUrl } from '@/lib/google/oauth'
import { isGoogleConfigured } from '@/lib/google/config'
import { randomToken } from '@/lib/crypto'
import { DEMO } from '@/lib/demo/config'
import { connectDemoGoogle } from '@/lib/demo/calendar'

const STATE_COOKIE = 'veltro-google-state'

export async function GET(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL('/settings/integrations?google=not_configured', request.url))
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo')
  const safeReturn = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/settings/integrations'
  if (DEMO) {
    connectDemoGoogle(true)
    const target = new URL(safeReturn, request.url)
    target.searchParams.set('google', 'connected')
    return NextResponse.redirect(target)
  }

  const state = randomToken(24)

  ;(await cookies()).set(STATE_COOKIE, JSON.stringify({ state, returnTo: safeReturn, uid: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/integrations/google',
    maxAge: 600,
  })

  return NextResponse.redirect(buildAuthUrl(state, user.email))
}
