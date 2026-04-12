import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { defaultLocale, locales, type Locale } from './i18n/routing'

const AUTH_ROUTES = ['/login', '/register']

function isConfiguredSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function resolveLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get('veltro-locale')?.value
  if (cookie && locales.includes(cookie as Locale)) return cookie as Locale
  const acceptLang = request.headers.get('accept-language')
  if (acceptLang) {
    const preferred = acceptLang.split(',')[0].split('-')[0] as Locale
    if (locales.includes(preferred)) return preferred
  }
  return defaultLocale
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/login' || pathname === '/register') return true
  if (pathname.startsWith('/invite/')) return true
  return false
}

function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false
  if (pathname.startsWith('/dashboard')) return true
  if (pathname.startsWith('/home')) return true
  if (pathname.startsWith('/my-work')) return true
  if (pathname.startsWith('/inbox')) return true
  if (pathname.startsWith('/settings')) return true
  const parts = pathname.split('/').filter(Boolean)
  return parts.length >= 2
}

function ensureLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  locale: Locale,
) {
  if (!request.cookies.get('veltro-locale')) {
    response.cookies.set('veltro-locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const locale = resolveLocale(request)

  // Start with a mutable response so we can write refreshed auth cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  ensureLocaleCookie(request, response, locale)

  if (!isConfiguredSupabase()) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Write refreshed tokens to both request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // KEY FIX: use getUser() instead of getSession()
  // getUser() validates the JWT server-side AND refreshes expired tokens,
  // writing the new access_token cookie back via setAll above.
  // getSession() only reads the cookie and never refreshes — causes auth.uid() = null.
  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = isProtectedPath(pathname)
  if (!user && isProtected) {
    const redirectResponse = NextResponse.redirect(
      new URL('/login', request.url),
    )
    ensureLocaleCookie(request, redirectResponse, locale)
    return redirectResponse
  }

  const isAuthRoute = AUTH_ROUTES.some((p) => pathname === p)
  if (user && isAuthRoute) {
    const redirectResponse = NextResponse.redirect(
      new URL('/dashboard', request.url),
    )
    ensureLocaleCookie(request, redirectResponse, locale)
    return redirectResponse
  }

  // Re-apply locale cookie to the (possibly recreated) response
  ensureLocaleCookie(request, response, locale)

  return response
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
