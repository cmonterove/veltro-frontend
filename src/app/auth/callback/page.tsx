'use client'

import { useEffect } from 'react'

/**
 * El correo de confirmación y el de recuperación vuelven acá con la sesión en el fragmento
 * (#access_token=…). El fragmento no llega al servidor: esta página lo entrega a /auth/session,
 * que lo verifica con la API y lo deja en las cookies httpOnly.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1))
    const next = new URLSearchParams(location.search).get('next')
    const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/home'
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    const expiresIn = Number(hash.get('expires_in') ?? 3600)
    if (!accessToken || !refreshToken) {
      location.replace('/login?error=link_expired')
      return
    }
    fetch('/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, refreshToken, expiresIn }),
    })
      .then((r) => location.replace(r.ok ? target : '/login?error=link_expired'))
      .catch(() => location.replace('/login?error=link_expired'))
  }, [])

  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <span className="size-5 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}
