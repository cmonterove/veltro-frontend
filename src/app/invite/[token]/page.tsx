import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { api, apiAnon, sessionToken } from '@/lib/api/server'
import { InviteScreen } from '@/components/auth/invite-screen'
import type { InvitePeek } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invite')
  return { title: t('metaTitle') }
}

/** El enlace de una invitación: se abre con o sin sesión (ver middleware). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let peek: InvitePeek | null = null
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    peek = await apiAnon<InvitePeek>('/v1/invitations/peek', { method: 'POST', body: { token } }).catch(() => null)
  }
  let me: { email: string; fullName: string } | null = null
  if (await sessionToken()) {
    me = await api<{ user: { email: string; fullName: string } }>('/v1/me')
      .then((r) => r.user)
      .catch(() => null)
  }
  return <InviteScreen token={token} peek={peek} me={me} />
}
