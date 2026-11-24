import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { api, sessionToken } from '@/lib/api/server'
import { InviteScreen } from '@/components/auth/invite-screen'
import { peekInvite } from './peek'

/**
 * Al pegar el enlace en WhatsApp o en un correo se ve quién invita y a qué cuenta, con la imagen de
 * opengraph-image.tsx. Sin datos (enlace vencido o anulado) queda el título de siempre. Nunca el correo
 * de la persona invitada: la vista previa la puede ver cualquiera en el chat.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const t = await getTranslations('invite')
  const peek = await peekInvite(token)
  const robots = { index: false, follow: false }
  if (!peek || peek.status !== 'pending') return { title: t('metaTitle'), robots }
  const title = peek.inviter?.fullName ? t('ogTitle', { inviter: peek.inviter.fullName, account: peek.accountName }) : t('ogTitleAnon', { account: peek.accountName })
  const description = t('ogDescription')
  return {
    title,
    description,
    robots,
    openGraph: { title, description, siteName: 'Veltro', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/** El enlace de una invitación: se abre con o sin sesión (ver middleware). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const peek = await peekInvite(token)
  let me: { email: string; fullName: string } | null = null
  if (await sessionToken()) {
    me = await api<{ user: { email: string; fullName: string } }>('/v1/me')
      .then((r) => r.user)
      .catch(() => null)
  }
  return <InviteScreen token={token} peek={peek} me={me} />
}
