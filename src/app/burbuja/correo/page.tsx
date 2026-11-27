import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { api, sessionToken } from '@/lib/api/server'
import { ExchangeConnectWindow } from '@/components/bubble/exchange-connect'

export const metadata: Metadata = { title: 'Conectar correo' }

/**
 * La ventanita que abre la burbuja para conectar un correo de empresa (Exchange, p. ej. Promoting) con usuario y
 * clave, con la sesión de la web: sin sesión, primero a entrar y de vuelta acá. Al conectar se cierra sola y la
 * burbuja lo ve.
 */
export default async function BubbleExchangePage({ searchParams }: { searchParams: Promise<{ server?: string }> }) {
  const { server = '' } = await searchParams
  const here = `/burbuja/correo?${new URLSearchParams({ server })}`
  if (!(await sessionToken())) redirect(`/login?${new URLSearchParams({ next: here })}`)
  const r = await api<{ providers: { exchange?: { id: string; name: string }[] } }>('/v1/me/mail-accounts').catch(() => null)
  if (!r) redirect(`/login?${new URLSearchParams({ next: here })}`)
  const found = r.providers.exchange?.find((s) => s.id === server) ?? r.providers.exchange?.[0] ?? null
  return <ExchangeConnectWindow server={found} />
}
