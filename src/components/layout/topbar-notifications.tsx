'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function TopbarNotifications() {
  const [open, setOpen] = useState(false)
  const unread = 2
  const t = useTranslations('dashboard.layout')

  const samples = [
    { titleKey: 'notificationSample1Title', subKey: 'notificationSample1Sub', unread: true },
    { titleKey: 'notificationSample2Title', subKey: 'notificationSample2Sub', unread: true },
    { titleKey: 'notificationSample3Title', subKey: 'notificationSample3Sub', unread: false },
  ] as const

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-ghost btn-icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('notificationsAria')}
        style={{ position: 'relative' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'hsl(var(--destructive))',
              border: '1.5px solid var(--bg-base)',
            }}
          />
        )}
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
            style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: '320px', zIndex: 50 }}
            role="menu"
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '0.5px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {t('notifications')}
              </span>
              <button
                type="button"
                style={{
                  fontSize: '11px',
                  color: 'hsl(var(--primary))',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('markAllRead')}
              </button>
            </div>
            {samples.map((n, i) => (
              <div
                key={i}
                className="dropdown-item"
                style={{ alignItems: 'flex-start', gap: '10px', padding: '10px 14px' }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: n.unread ? 'hsl(var(--primary))' : 'transparent',
                    border: n.unread ? 'none' : '0.5px solid var(--border-medium)',
                    flexShrink: 0,
                    marginTop: '4px',
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      fontWeight: n.unread ? 500 : 400,
                    }}
                  >
                    {t(n.titleKey)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                    {t(n.subKey)}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ padding: '8px 14px', borderTop: '0.5px solid var(--border-default)' }}>
              <button
                type="button"
                style={{
                  fontSize: '12px',
                  color: 'hsl(var(--primary))',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {t('viewAllNotifications')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
