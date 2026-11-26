import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { api, sessionToken } from '@/lib/api/server'
import { ConnectBubble } from '@/components/bubble/connect'

export const metadata: Metadata = { title: 'Conectar la burbuja' }

/**
 * La ventanita que abre la burbuja para conectarse (primer plano, con la sesión de la web): sin sesión, primero
 * a entrar y de vuelta acá; con sesión, la persona confirma y la burbuja recibe su token.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ platform?: string; host?: string; c?: string }> }) {
  const { platform = 'Plataforma', host, c } = await searchParams
  const challenge = c && /^[A-Za-z0-9_-]{43,128}$/.test(c) ? c : null
  const here = `/burbuja/conectar?${new URLSearchParams({ platform, ...(host ? { host } : {}), ...(challenge ? { c: challenge } : {}) })}`
  if (!(await sessionToken())) redirect(`/login?${new URLSearchParams({ next: here })}`)
  const me = await api<{ user: { email: string } }>('/v1/me')
    .then((r) => r.user)
    .catch(() => null)
  if (!me) redirect(`/login?${new URLSearchParams({ next: here })}`)
  return <ConnectBubble platform={platform.slice(0, 40)} host={host?.slice(0, 120) ?? null} email={me.email} challenge={challenge} />
}
