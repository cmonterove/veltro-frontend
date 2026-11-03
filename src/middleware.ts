import { NextResponse, type NextRequest } from 'next/server'
import { DEMO } from '@/lib/demo/config'
import { ACCESS_COOKIE, REFRESH_COOKIE, refreshSession, sessionCookies, tokenTtl, type ApiSession } from '@/lib/api/session-cookies'

const PUBLIC_PATHS = ['/login', '/register', '/auth']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  // Modo demo: sin Supabase, el usuario demo siempre tiene sesión
  if (DEMO) return NextResponse.next({ request })

  // La sesión es de la API (cookies httpOnly). Si el token está por vencer se renueva acá,
  // antes de que las páginas llamen a la API; la firma la verifica la API en cada llamada.
  let renewed: ApiSession | null = null
  let authed = tokenTtl(request.cookies.get(ACCESS_COOKIE)?.value) > 60
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!authed && refreshToken) {
    renewed = await refreshSession(refreshToken)
    authed = Boolean(renewed)
  }

  const { pathname } = request.nextUrl

  if (!authed && !isPublic(pathname) && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/home') url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  if (authed && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    url.search = ''
    return withSession(NextResponse.redirect(url), renewed)
  }

  // las páginas de esta misma petición leen el token nuevo
  if (renewed) for (const c of sessionCookies(renewed)) request.cookies.set(c.name, c.value)
  return withSession(NextResponse.next({ request }), renewed)
}

function withSession(response: NextResponse, renewed: ApiSession | null) {
  if (renewed) for (const c of sessionCookies(renewed)) response.cookies.set(c)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|woff2?)$).*)'],
}
