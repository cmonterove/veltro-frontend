import { NextResponse, type NextRequest } from 'next/server'
import { DEMO } from '@/lib/demo/config'
import {
  ACCESS_COOKIE,
  clearedCookies,
  DEMO_ACCESS_COOKIE,
  DEMO_REFRESH_COOKIE,
  REFRESH_COOKIE,
  refreshSession,
  sessionCookies,
  tokenTtl,
  type ApiSession,
} from '@/lib/api/session-cookies'

// /invite: el enlace de una invitación se abre con o sin sesión
const PUBLIC_PATHS = ['/login', '/register', '/auth', '/invite']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Lo que cambió de las sesiones en esta petición: la real renovada y la de los datos de prueba (renovada o descartada). */
type Changes = { renewed: ApiSession | null; demo: ApiSession | null | 'drop' }

export async function middleware(request: NextRequest) {
  // Modo demo: sin Supabase, el usuario demo siempre tiene sesión
  if (DEMO) return NextResponse.next({ request })

  // La sesión es de la API (cookies httpOnly). Si el token está por vencer se renueva acá,
  // antes de que las páginas llamen a la API; la firma la verifica la API en cada llamada.
  const changes: Changes = { renewed: null, demo: null }
  let authed = tokenTtl(request.cookies.get(ACCESS_COOKIE)?.value) > 60
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!authed && refreshToken) {
    changes.renewed = await refreshSession(refreshToken)
    authed = Boolean(changes.renewed)
  }

  // los datos de prueba viven mientras viva la sesión real; si su token ya no sirve, se vuelve a los datos reales
  const demoRefresh = request.cookies.get(DEMO_REFRESH_COOKIE)?.value
  if (demoRefresh && (!authed || tokenTtl(request.cookies.get(DEMO_ACCESS_COOKIE)?.value) <= 60)) {
    changes.demo = (authed && (await refreshSession(demoRefresh))) || 'drop'
  }

  const { pathname } = request.nextUrl

  if (!authed && !isPublic(pathname) && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/home') url.searchParams.set('next', pathname + request.nextUrl.search)
    return withSession(NextResponse.redirect(url), changes)
  }

  if (authed && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    url.search = ''
    return withSession(NextResponse.redirect(url), changes)
  }

  // las páginas de esta misma petición leen los tokens nuevos
  for (const c of cookieChanges(changes)) {
    if (c.value) request.cookies.set(c.name, c.value)
    else request.cookies.delete(c.name)
  }
  return withSession(NextResponse.next({ request }), changes)
}

function cookieChanges({ renewed, demo }: Changes) {
  return [
    ...(renewed ? sessionCookies(renewed) : []),
    ...(demo === 'drop' ? clearedCookies(true) : demo ? sessionCookies(demo, true) : []),
  ]
}

function withSession(response: NextResponse, changes: Changes) {
  for (const c of cookieChanges(changes)) response.cookies.set(c)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|woff2?)$).*)'],
}
