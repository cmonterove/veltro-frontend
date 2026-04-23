'use client'

import { CreateBoardModal } from '@/components/board/create-board-modal'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createBoard } from './actions'

interface Board {
  id: string
  name: string
  color: string
  icon: string | null
  description: string | null
  visibility: string
  owner_id: string
  created_at: string
}

interface Props {
  orgSlug: string
  companySlug: string
  companyId: string
  companyName: string
  boards: Board[]
  openCreateModal: boolean
}

export function BoardsPageClient({
  orgSlug,
  companySlug,
  companyId,
  companyName,
  boards,
  openCreateModal,
}: Props) {
  const [modalOpen, setModalOpen] = useState(openCreateModal)
  const router = useRouter()
  const t = useTranslations('boards')

  function handleClose() {
    setModalOpen(false)
    router.replace(`/${orgSlug}/${companySlug}/boards`)
  }

  async function handleCreate(formData: FormData) {
    // companyId is captured from props — this is the key fix
    return createBoard(formData, companyId, orgSlug, companySlug)
  }

  return (
    <div style={{ padding: '32px 40px', height: '100%' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            {companyName}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {t('boardsList.boardCount', { count: boards.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primary-mid)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--primary)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('boardsList.newBoard')}
        </button>
      </div>

      {/* Content */}
      {boards.length === 0 ? (
        <EmptyState onCreateClick={() => setModalOpen(true)} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              href={`/${orgSlug}/${companySlug}/board/${board.id}` as Route}
            />
          ))}

          {/* Add new board card */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              height: '140px',
              borderRadius: '12px',
              border: '1.5px dashed var(--border-medium)',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: 'var(--text-tertiary)',
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-mid)'
              e.currentTarget.style.color = 'var(--primary)'
              e.currentTarget.style.background = 'var(--primary-light)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-medium)'
              e.currentTarget.style.color = 'var(--text-tertiary)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{t('boardsList.newBoard')}</span>
          </button>
        </div>
      )}

      {/* Modal */}
      {modalOpen ? (
        <CreateBoardModal onClose={handleClose} onSubmit={handleCreate} />
      ) : null}
    </div>
  )
}

/* ── Board card ─────────────────────────────────────────────── */
function BoardCard({ board, href }: { board: Board; href: Route }) {
  const tVis = useTranslations('boards.visibility')
  const visibilityLabel: Record<string, string> = {
    private: `🔒 ${tVis('private')}`,
    company: `🏢 ${tVis('company')}`,
    groups: `👥 ${tVis('groups')}`,
  }

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          height: '140px',
          borderRadius: '12px',
          border: '0.5px solid var(--border-default)',
          background: 'var(--bg-base)',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color .15s, transform .15s',
          display: 'flex',
          flexDirection: 'column',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = board.color
          el.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'var(--border-default)'
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Color strip */}
        <div style={{ height: '5px', background: board.color, flexShrink: 0 }} />

        <div
          style={{
            flex: 1,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: board.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {board.name}
              </span>
            </div>
            {board.description ? (
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {board.description}
              </p>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
              {visibilityLabel[board.visibility] ?? board.visibility}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
              {new Date(board.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ── Empty state ────────────────────────────────────────────── */
function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('boards')
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: '24px', opacity: 0.35 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden>
          <rect x="8" y="12" width="64" height="56" rx="6" stroke="var(--text-tertiary)" strokeWidth="1.5" />
          <rect x="8" y="12" width="64" height="12" rx="6" fill="var(--border-default)" />
          <line x1="20" y1="38" x2="60" y2="38" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="20" y1="48" x2="50" y2="48" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="20" y1="58" x2="44" y2="58" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="60" cy="60" r="14" fill="var(--primary)" />
          <line x1="60" y1="54" x2="60" y2="66" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="54" y1="60" x2="66" y2="60" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
        {t('noBoards')}
      </h2>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '28px',
          maxWidth: '320px',
          lineHeight: 1.6,
        }}
      >
        {t('noBoardsDesc')}
      </p>
      <button
        type="button"
        onClick={onCreateClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 24px',
          borderRadius: '8px',
          background: 'var(--primary)',
          color: 'white',
          border: 'none',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--primary-mid)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--primary)'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t('createBoard')}
      </button>
    </div>
  )
}
