import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

interface Props {
  params: { token: string }
}

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = params
  const t = await getTranslations('settings.invite')
  const supabase = await createClient()

  // Must be authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/invite/${token}/accept`)

  // 1. Verify token again
  const { data: invitation, error } = await supabase
    .from('invitations')
    .select('id, organization_id, company_id, email, role, accepted_at, expires_at, organizations ( slug )')
    .eq('token', token)
    .maybeSingle()

  if (error || !invitation) {
    return <AcceptError message={t('invalid')} />
  }

  const expired = new Date(invitation.expires_at) <= new Date()
  if (expired) {
    return <AcceptError message={t('invalid')} />
  }

  // 2. Already accepted
  if (invitation.accepted_at) {
    const orgRaw = invitation.organizations
    const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { slug: string } | null
    redirect(org ? `/${org.slug}` : '/')
  }

  // 3. Create / update user_company_assignment if company_id is set
  if (invitation.company_id) {
    await supabase.from('user_company_assignments').upsert(
      { user_id: user.id, company_id: invitation.company_id, role_in_company: invitation.role },
      { onConflict: 'user_id,company_id' }
    )
  }

  // 4. Mark invitation as accepted
  await supabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  // 5. Redirect to org dashboard
  const orgRaw = invitation.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { slug: string } | null

  redirect(org ? `/${org.slug}` : '/')
}

function AcceptError({ message }: { message: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-sunken)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', background: 'var(--bg-base)',
        borderRadius: '16px', border: '0.5px solid var(--border-default)',
        padding: '40px 36px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Invitation error
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{message}</p>
      </div>
    </div>
  )
}
