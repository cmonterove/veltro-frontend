'use client'

import { createGroup } from '@/app/(dashboard)/[orgSlug]/[companySlug]/board/[boardId]/actions'
import type { BoardGroup } from '@/lib/types/board'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  boardId: string
  onSearch: (q: string) => void
  onAddGroup: (g: BoardGroup) => void
}

export function BoardToolbar({ boardId, onSearch, onAddGroup }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [, startTransition] = useTransition()
  const t = useTranslations('boards.toolbar')
  const tGroup = useTranslations('boards.group')

  function handleAddGroup() {
    startTransition(async () => {
      const result = await createGroup(boardId, tGroup('newGroup'))
      if (result.data) {
        onAddGroup({
          ...(result.data as unknown as BoardGroup),
          items: [],
          is_collapsed: false,
        })
      }
    })
  }

  const ToolBtn = ({
    icon,
    label,
    onClick,
  }: {
    icon: React.ReactNode
    label: string
    onClick?: () => void
  }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        borderRadius: '6px',
        background: 'none',
        border: '0.5px solid transparent',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all .1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-surface)'
        e.currentTarget.style.borderColor = 'var(--border-default)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 20px',
        borderBottom: '0.5px solid var(--border-default)',
        background: 'var(--bg-base)',
        flexShrink: 0,
      }}
    >
      <ToolBtn
        label={t('filter')}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        }
      />
      <ToolBtn
        label={t('sort')}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        }
      />
      <ToolBtn
        label={t('groupBy')}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        }
      />
      <ToolBtn
        label={t('hideColumns')}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        }
      />

      <div style={{ flex: 1 }} />

      {searchOpen ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg
            style={{ position: 'absolute', left: '8px', color: 'var(--text-tertiary)' }}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            placeholder={t('searchPlaceholder')}
            onChange={(e) => onSearch(e.target.value)}
            onBlur={(e) => {
              if (!e.target.value) {
                setSearchOpen(false)
                onSearch('')
              }
            }}
            style={{
              paddingLeft: '28px',
              paddingRight: '28px',
              height: '28px',
              width: '200px',
              borderRadius: '6px',
              border: '0.5px solid var(--border-medium)',
              background: 'var(--bg-surface)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false)
              onSearch('')
            }}
            style={{
              position: 'absolute',
              right: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : (
        <ToolBtn
          label={t('search')}
          onClick={() => setSearchOpen(true)}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          }
        />
      )}

      <ToolBtn
        label={t('addGroup')}
        onClick={handleAddGroup}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        }
      />
    </div>
  )
}
