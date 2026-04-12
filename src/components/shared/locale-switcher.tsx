'use client'

import { locales, type Locale } from '@/i18n/routing'
import { CheckIcon, GlobeIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useLocale } from './locale-provider'

const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇺🇸' },
  es: { label: 'Español', flag: '🇪🇸' },
  pt: { label: 'Português', flag: '🇧🇷' },
  fr: { label: 'Français', flag: '🇫🇷' },
}

export interface LocaleSwitcherProps {
  dark?: boolean
}

export function LocaleSwitcher({ dark = false }: LocaleSwitcherProps) {
  const { locale, setLocale, isPending } = useLocale()
  const [open, setOpen] = useState(false)
  const t = useTranslations('auth.commonAuth')

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-ghost btn-sm flex items-center gap-1.5"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-label={t('changeLanguage')}
        style={
          dark
            ? {
                color: 'rgba(255,255,255,0.5)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
              }
            : undefined
        }
      >
        <GlobeIcon size={14} />
        <span className="text-xs font-medium uppercase">{locale}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              zIndex: 50,
              minWidth: '160px',
              background: dark ? '#0f1f16' : 'var(--bg-base)',
              border: dark ? '0.5px solid rgba(45,138,106,0.2)' : '0.5px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '4px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
            role="menu"
          >
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitem"
                onClick={() => {
                  setLocale(l)
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: dark
                    ? l === locale
                      ? '#7eceb0'
                      : 'rgba(255,255,255,0.6)'
                    : 'var(--text-primary)',
                  fontWeight: l === locale ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.05)' : 'var(--bg-surface)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span className="text-base">{LOCALE_LABELS[l].flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{LOCALE_LABELS[l].label}</span>
                {l === locale && (
                  <CheckIcon size={13} className={dark ? '' : 'text-primary'} style={dark ? { color: '#2d8a6a' } : undefined} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
