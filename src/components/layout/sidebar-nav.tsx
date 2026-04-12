'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  {
    key: 'home',
    href: '/home',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: 'myWork',
    href: '/my-work',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    badge: 4,
  },
  {
    key: 'inbox',
    href: '/inbox',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    badge: 2,
  },
] as const

export function SidebarNav() {
  const pathname = usePathname()
  const t = useTranslations('dashboard.nav')

  return (
    <div style={{ padding: '8px' }}>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`nav-item${isActive ? ' active' : ''}`}
            style={{ textDecoration: 'none', marginBottom: '1px' }}
          >
            <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
            <span style={{ flex: 1, fontSize: '13px' }}>{t(item.key)}</span>
            {'badge' in item && item.badge > 0 && (
              <span
                className="badge"
                style={
                  isActive
                    ? {
                        background: 'var(--primary-light)',
                        color: 'hsl(var(--primary))',
                        borderColor: 'transparent',
                      }
                    : undefined
                }
              >
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
