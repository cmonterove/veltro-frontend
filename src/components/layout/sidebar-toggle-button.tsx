'use client'

import { useTranslations } from 'next-intl'
import { useSidebar } from './sidebar-provider'

export function SidebarToggleButton() {
  const { toggle } = useSidebar()
  const t = useTranslations('dashboard.layout')
  return (
    <button
      type="button"
      className="btn-ghost btn-icon"
      onClick={toggle}
      aria-label={t('toggleSidebar')}
      style={{ borderRadius: '6px' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    </button>
  )
}
