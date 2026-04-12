'use client'

import type { ProfileData } from '@/lib/types/layout'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function SidebarFooter({ profile }: { profile: ProfileData }) {
  const pathname = usePathname()
  const t = useTranslations('dashboard.nav')

  return (
    <div style={{ borderTop: '0.5px solid var(--border-default)', padding: '8px' }}>
      <Link
        href="/settings"
        className={`nav-item${pathname.startsWith('/settings') ? ' active' : ''}`}
        style={{ textDecoration: 'none', marginBottom: '4px' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </svg>
        <span style={{ fontSize: '13px', flex: 1 }}>{t('settings')}</span>
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '8px',
          marginTop: '2px',
        }}
      >
        <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            getInitials(profile.full_name)
          )}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile.full_name}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile.role.replace(/_/g, ' ')}
          </div>
        </div>
      </div>
    </div>
  )
}
