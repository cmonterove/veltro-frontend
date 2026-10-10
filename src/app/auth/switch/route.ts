import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACCOUNT_COOKIE } from '@/lib/session'

// Cambia la cuenta activa (cookie) y vuelve a la ruta pedida. Usado al abrir links de otra cuenta.
export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get('account') ?? ''
  const next = request.nextUrl.searchParams.get('next') ?? '/home'
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/home'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: membership } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('account_id', account)
    .eq('user_id', user.id)
    .maybeSingle()

  const res = NextResponse.redirect(new URL(target, request.url))
  if (membership) res.cookies.set(ACCOUNT_COOKIE, account, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return res
}
