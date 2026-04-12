'use client'

import { createClient } from '@/lib/supabase/client'
import type { OrgData, ProfileData } from '@/lib/types/layout'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface Props {
  profile: ProfileData
  org: OrgData
}

export function TopbarUserMenu({ profile, org }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const tNav = useTranslations('dashboard.nav')
  const tLayout = useTranslations('dashboard.layout')

  async function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '3px 6px 3px 3px',
          borderRadius: '20px',
          border: '0.5px solid transparent',
          background: 'transparent',
          cursor: 'pointer',
          transition: 'background .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-surface)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <div className="avatar avatar-sm">
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
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            maxWidth: '100px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {profile.full_name.split(' ')[0]}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="dropdown"
            style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: '220px', zIndex: 50 }}
            role="menu"
          >
            <div style={{ padding: '10px 14px 8px', borderBottom: '0.5px solid var(--border-default)' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {profile.full_name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{org.name}</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '5px',
                  fontSize: '10px',
                  background: 'var(--primary-light)',
                  color: 'hsl(var(--primary))',
                  padding: '2px 7px',
                  borderRadius: '8px',
                  fontWeight: 500,
                }}
              >
                {profile.role.replace(/_/g, ' ')}
              </div>
            </div>

            <button
              type="button"
              className="dropdown-item w-full"
              role="menuitem"
              onClick={() => {
                router.push('/settings/profile')
                setOpen(false)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              {tNav('profileSettings')}
            </button>
            <button
              type="button"
              className="dropdown-item w-full"
              role="menuitem"
              onClick={() => {
                router.push('/settings')
                setOpen(false)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
              </svg>
              {tLayout('orgSettings')}
            </button>

            <div style={{ height: '0.5px', background: 'var(--border-default)', margin: '4px 0' }} />

            <button
              type="button"
              className="dropdown-item w-full danger"
              role="menuitem"
              onClick={handleSignOut}
              disabled={isPending}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {isPending ? tLayout('signingOut') : tLayout('signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
