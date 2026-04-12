'use client'

import { LocaleSwitcher } from '@/components/shared/locale-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import type { OrgData, ProfileData } from '@/lib/types/layout'
import { useTranslations } from 'next-intl'
import { SidebarToggleButton } from './sidebar-toggle-button'
import { TopbarNotifications } from './topbar-notifications'
import { TopbarUserMenu } from './topbar-user-menu'

interface TopbarProps {
  profile: ProfileData
  org: OrgData
}

export function Topbar({ profile, org }: TopbarProps) {
  const t = useTranslations('dashboard.layout')
  const tCommon = useTranslations('common')

  return (
    <header
      style={{
        height: 'var(--topbar-height, 44px)',
        background: 'var(--bg-base)',
        borderBottom: '0.5px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '8px',
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      <SidebarToggleButton />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
        <VeltroLogo />
        <span
          style={{
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
          }}
        >
          {tCommon('appName')}
        </span>
      </div>

      <div
        style={{
          width: '0.5px',
          height: '20px',
          background: 'var(--border-default)',
          margin: '0 4px',
        }}
      />

      <span
        style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          maxWidth: '180px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {org.name}
      </span>

      <div style={{ flex: 1 }} />

      <TopbarSearch placeholder={t('searchPlaceholder')} shortcut={t('searchShortcut')} searchLabel={tCommon('search')} />
      <TopbarNotifications />
      <ThemeToggle />
      <LocaleSwitcher />

      <div
        style={{
          width: '0.5px',
          height: '20px',
          background: 'var(--border-default)',
          margin: '0 2px',
        }}
      />

      <TopbarUserMenu profile={profile} org={org} />
    </header>
  )
}

function VeltroLogo() {
  return (
    <div
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '6px',
        background: 'hsl(var(--primary))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
        <rect x="1" y="1" width="5" height="5" rx="1" fill="white" opacity="0.9" />
        <rect x="7" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6" />
        <rect x="1" y="7" width="5" height="5" rx="1" fill="white" opacity="0.6" />
        <rect x="7" y="7" width="5" height="5" rx="1" fill="white" opacity="0.3" />
      </svg>
    </div>
  )
}

function TopbarSearch({
  placeholder,
  shortcut,
  searchLabel,
}: {
  placeholder: string
  shortcut: string
  searchLabel: string
}) {
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: '160px',
        justifyContent: 'flex-start',
        color: 'var(--text-tertiary)',
      }}
      aria-label={searchLabel}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span style={{ fontSize: '12px' }}>{placeholder}</span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: '10px',
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border-default)',
          borderRadius: '4px',
          padding: '1px 5px',
          color: 'var(--text-tertiary)',
        }}
      >
        {shortcut}
      </span>
    </button>
  )
}
