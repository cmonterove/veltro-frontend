'use client'

import type { BoardData, BoardMemberData, UserData } from '@/lib/types/board'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const t = useTranslations('boards.visibility')
  const map = {
    private: { labelKey: 'private' as const, bg: 'var(--primary-light)', color: 'hsl(var(--primary))' },
    company: { labelKey: 'company' as const, bg: '#eff6ff', color: '#1d4ed8' },
    groups: { labelKey: 'groups' as const, bg: '#faf5ff', color: '#7c3aed' },
  }
  const v = map[visibility as keyof typeof map] ?? map.private
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: '10px',
        background: v.bg,
        color: v.color,
      }}
    >
      {t(v.labelKey)}
    </span>
  )
}

interface Props {
  board: BoardData
  members: BoardMemberData[]
  currentUser?: UserData
  canAddItem: boolean
  isAddItemPending?: boolean
  onAddItemHeader: () => void
}

export function BoardHeader({
  board,
  members,
  canAddItem,
  isAddItemPending = false,
  onAddItemHeader,
}: Props) {
  const tViews = useTranslations('boards.views')
  const tToolbar = useTranslations('boards.toolbar')
  const tHeader = useTranslations('boards.header')
  const [activeView, setActiveView] = useState<'table' | 'kanban' | 'calendar' | 'gantt'>('table')
  const views = ['table', 'kanban', 'calendar', 'gantt'] as const

  const individualMembers = members.filter((m) => m.user_id && m.profiles)

  return (
    <div
      style={{
        background: 'var(--bg-base)',
        borderBottom: '0.5px solid var(--border-default)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px 0' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '3px',
            background: board.color,
            flexShrink: 0,
          }}
        />
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            margin: 0,
          }}
        >
          {board.name}
        </h1>
        <VisibilityBadge visibility={board.visibility} />

        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '4px' }}>
          {individualMembers.slice(0, 5).map((m, i) => (
            <div
              key={m.id}
              title={m.profiles?.full_name}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: ['#e8f5f0', '#eff6ff', '#faf5ff', '#fef3c7', '#fce7f3'][i % 5],
                color: ['#1a3a2e', '#1d4ed8', '#7c3aed', '#d97706', '#db2777'][i % 5],
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-base)',
                marginLeft: i === 0 ? 0 : '-8px',
                zIndex: 10 - i,
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {m.profiles?.avatar_url ? (
                <img
                  src={m.profiles.avatar_url}
                  alt=""
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                getInitials(m.profiles?.full_name ?? '?')
              )}
            </div>
          ))}
          {individualMembers.length > 5 && (
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                color: 'var(--text-tertiary)',
                fontSize: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-base)',
                marginLeft: '-8px',
                zIndex: 1,
              }}
            >
              +{individualMembers.length - 5}
            </div>
          )}
          <button
            type="button"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              border: '1.5px dashed var(--border-medium)',
              color: 'var(--text-tertiary)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: individualMembers.length ? '-8px' : 0,
              zIndex: 0,
            }}
            title={tHeader('inviteMember')}
          >
            +
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          disabled={!canAddItem || isAddItemPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            background: 'hsl(var(--primary))',
            color: 'white',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: canAddItem ? 'pointer' : 'not-allowed',
            opacity: canAddItem ? 1 : 0.5,
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => {
            if (canAddItem) e.currentTarget.style.background = 'var(--primary-mid)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'hsl(var(--primary))'
          }}
          onClick={onAddItemHeader}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {tToolbar('addItem')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2px', padding: '8px 20px 0', borderBottom: 'none' }}>
        {views.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setActiveView(v)}
            style={{
              padding: '5px 12px 8px',
              fontSize: '12px',
              fontWeight: activeView === v ? 600 : 400,
              color: activeView === v ? 'hsl(var(--primary))' : 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeView === v ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              transition: 'all .15s',
            }}
          >
            {tViews(v)}
          </button>
        ))}
      </div>
    </div>
  )
}
