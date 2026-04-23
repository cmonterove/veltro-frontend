import { getTranslations } from 'next-intl/server'
import type { Route } from 'next'
import Link from 'next/link'

interface Props {
  children: React.ReactNode
  params: { orgSlug: string }
}

export default async function OrgSettingsLayout({ children, params }: Props) {
  const { orgSlug } = params
  const t = await getTranslations('settings')

  const navLinks = [
    {
      href: `/${orgSlug}/settings/members`,
      label: t('members.title'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      href: `/${orgSlug}/settings`,
      label: t('organization.title'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </svg>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Settings sidebar */}
      <aside
        style={{
          width: '220px',
          minWidth: '220px',
          background: 'var(--bg-base)',
          borderRight: '0.5px solid var(--border-default)',
          padding: '24px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0 8px 8px',
          }}
        >
          {t('tabs.organization')}
        </div>
        {navLinks.map((link) => (
          <SettingsNavLink key={link.href} href={link.href} icon={link.icon} label={link.label} />
        ))}
      </aside>

      {/* Settings content */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-sunken)' }}>
        {children}
      </main>
    </div>
  )
}

function SettingsNavLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href as Route}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        borderRadius: '7px',
        textDecoration: 'none',
        color: 'var(--text-secondary)',
        fontSize: '13px',
        transition: 'background .1s, color .1s',
      }}
      onMouseEnter={undefined}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      {label}
    </Link>
  )
}
