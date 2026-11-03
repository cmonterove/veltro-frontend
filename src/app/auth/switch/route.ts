import { NextResponse, type NextRequest } from 'next/server'
import { ACCOUNT_COOKIE } from '@/lib/session'
import { api } from '@/lib/api/server'
import type { ApiAccountBrief } from '@/lib/api/types'

// Cambia la cuenta activa (cookie) y vuelve a la ruta pedida. Usado al abrir links de otra cuenta.
export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get('account') ?? ''
  const next = request.nextUrl.searchParams.get('next') ?? '/home'
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/home'

  const me = await api<{ accounts: Pick<ApiAccountBrief, 'id'>[] }>('/v1/me').catch(() => null)
  if (!me) return NextResponse.redirect(new URL('/login', request.url))

  const res = NextResponse.redirect(new URL(target, request.url))
  if (me.accounts.some((a) => a.id === account)) res.cookies.set(ACCOUNT_COOKIE, account, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return res
}
