import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

interface Props {
  params: { token: string }
}

export default async function InvitePage({ params }: Props) {
  const { token } = params
  const t = await getTranslations('settings.invite')
  const supabase = await createClient()

  // 1. Look up token
  const { data: invitation } = await supabase
    .from('invitations')
    .select('id, organization_id, email, role, accepted_at, expires_at, organizations ( name )')
    .eq('token', token)
    .maybeSingle()

  // 2. Not found or expired
  if (!invitation) {
    return <InviteError message={t('invalid')} />
  }

  const expired = new Date(invitation.expires_at) <= new Date()
  if (expired) {
    return <InviteError message={t('invalid')} />
  }

  // 3. Already accepted → redirect to dashboard
  if (invitation.accepted_at) {
    redirect('/')
  }

  const orgRaw = invitation.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string } | null
  const orgName = org?.name ?? 'Veltro'

  // 4. Check if current user is already logged in
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-sunken)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--bg-base)', borderRadius: '16px',
        border: '0.5px solid var(--border-default)',
        padding: '40px 36px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        {/* Veltro logo mark */}
        <div style={{
          width: '52px', height: '52px', borderRadius: '12px',
          background: 'hsl(var(--primary))', color: 'white',
          fontSize: '22px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          V
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
          {t('subtitle', { orgName })}
        </p>

        <div style={{
          background: 'var(--bg-surface)', borderRadius: '10px',
          padding: '16px', marginBottom: '28px',
          border: '0.5px solid var(--border-default)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Invited to</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{orgName}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>as <strong>{invitation.role}</strong></div>
        </div>

        {user ? (
          // Already logged in — link to accept page
          <Link
            href={`/invite/${token}/accept`}
            style={{
              display: 'block', padding: '12px 28px', borderRadius: '10px',
              background: 'hsl(var(--primary))', color: 'white',
              textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}
          >
            {t('accept')}
          </Link>
        ) : (
          // Not logged in — link to login with redirect
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link
              href={`/login?redirect=/invite/${token}/accept`}
              style={{
                display: 'block', padding: '12px 28px', borderRadius: '10px',
                background: 'hsl(var(--primary))', color: 'white',
                textDecoration: 'none', fontSize: '14px', fontWeight: 600,
              }}
            >
              {t('alreadyMember')}
            </Link>
            {/* TODO: For new users without account, implement registration flow with pre-filled email.
                Currently, they can use the sign-in flow and create an account via register page. */}
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              No account yet? <Link href={`/register?email=${encodeURIComponent(invitation.email)}&redirect=/invite/${token}/accept`} style={{ color: 'hsl(var(--primary))', textDecoration: 'none' }}>Create one</Link>
            </p>
          </div>
        )}

        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '24px' }}>
          Expires {new Date(invitation.expires_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

function InviteError({ message }: { message: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-sunken)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--bg-base)', borderRadius: '16px',
        border: '0.5px solid var(--border-default)',
        padding: '40px 36px', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Invalid invitation</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>{message}</p>
        <Link href="/login" style={{ color: 'hsl(var(--primary))', fontSize: '13px' }}>
          Go to login →
        </Link>
      </div>
    </div>
  )
}
