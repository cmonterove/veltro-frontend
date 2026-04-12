'use client'

import { updateItemColumnValue, updateItemName } from '@/app/(dashboard)/[orgSlug]/[companySlug]/board/[boardId]/actions'
import { resolveColumnTitle } from '@/lib/board-column-title'
import { STATUS_DB_LABEL_TO_KEY } from '@/lib/board-status-labels'
import type { BoardItem, ColumnDef, UserData } from '@/lib/types/board'
import { DEFAULT_STATUSES } from '@/lib/types/board'
import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  item: BoardItem
  columns: ColumnDef[]
  companyUsers: UserData[]
  currentUser: UserData
  onClose: () => void
  onUpdateCell: (itemId: string, columnId: string, value: unknown) => void
  onUpdateName: (itemId: string, name: string) => void
  onDelete: () => void
}

export function ItemDetailPanel({
  item,
  columns,
  companyUsers,
  currentUser,
  onClose,
  onUpdateCell,
  onUpdateName,
  onDelete,
}: Props) {
  const t = useTranslations('boards.item')
  const tColumns = useTranslations('items.columns')
  const [nameValue, setNameValue] = useState(item.name)
  const [editingName, setEditingName] = useState(false)
  const [comment, setComment] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    setNameValue(item.name)
  }, [item.name])

  function getCellValue(columnId: string) {
    return item.item_column_values.find((v) => v.column_id === columnId)?.value ?? null
  }

  function handleNameBlur() {
    setEditingName(false)
    const next = nameValue.trim() || item.name
    if (next !== item.name) {
      onUpdateName(item.id, next)
      startTransition(() => void updateItemName(item.id, next))
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.2)' }}
        className="md:hidden"
        aria-hidden
      />

      <aside
        style={{
          width: '420px',
          minWidth: '420px',
          height: '100%',
          background: 'var(--bg-base)',
          borderLeft: '0.5px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideInRight 0.2s ease',
          zIndex: 35,
          position: 'relative',
        }}
      >
        <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>

        <div
          style={{
            padding: '14px 16px',
            borderBottom: '0.5px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'none',
              border: '0.5px solid var(--border-default)',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('detailTitle')}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onDelete}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'none',
              border: '0.5px solid var(--border-default)',
              color: '#dc2626',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('delete')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 20px 0' }}>
            {editingName ? (
              <textarea
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleNameBlur()
                  }
                  if (e.key === 'Escape') {
                    setNameValue(item.name)
                    setEditingName(false)
                  }
                }}
                rows={2}
                style={{
                  width: '100%',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-surface)',
                  border: '0.5px solid var(--primary-mid)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.3,
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <h2
                onClick={() => setEditingName(true)}
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'text',
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                {nameValue}
              </h2>
            )}
          </div>

          <div style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '12px',
              }}
            >
              {t('properties')}
            </div>
            {columns.map((col) => {
              const value = getCellValue(col.id)
              return (
                <div
                  key={col.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '10px',
                    minHeight: '32px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ColIcon type={col.type} />
                    {resolveColumnTitle(col.title, tColumns)}
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '0.5px solid var(--border-default)',
                    }}
                  >
                    <DetailCellRenderer
                      col={col}
                      value={value}
                      companyUsers={companyUsers}
                      onChange={(val) => {
                        onUpdateCell(item.id, col.id, val)
                        startTransition(() => void updateItemColumnValue(item.id, col.id, val))
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div
            style={{
              padding: '0 20px 20px',
              borderTop: '0.5px solid var(--border-default)',
              paddingTop: '16px',
              marginTop: '4px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '12px',
              }}
            >
              {t('updates')}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#e8f5f0',
                  color: '#1a3a2e',
                  fontSize: '10px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {currentUser.full_name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('writeUpdate')}
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--bg-surface)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color .15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-mid)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-default)'
                  }}
                />
                {comment ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setComment('')}
                      style={{
                        padding: '5px 14px',
                        borderRadius: '6px',
                        background: 'hsl(var(--primary))',
                        color: 'white',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t('post')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function ColIcon({ type }: { type: string }) {
  const s = { width: 12, height: 12, opacity: 0.5 }
  const icons: Record<string, React.ReactNode> = {
    status: (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    person: (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
    date: (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    number: (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
      </svg>
    ),
    checkbox: (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  }
  return (
    <span style={{ display: 'flex' }}>
      {icons[type] ?? (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="14" y2="18" />
        </svg>
      )}
    </span>
  )
}

function DetailCellRenderer({
  col,
  value,
  companyUsers,
  onChange,
}: {
  col: ColumnDef
  value: unknown
  companyUsers: UserData[]
  onChange: (v: unknown) => void
}) {
  if (col.type === 'status') {
    return <StatusDetailField settings={col.settings} value={value} onChange={onChange} />
  }
  if (col.type === 'person') {
    return <PersonDetailField users={companyUsers} value={value} onChange={onChange} />
  }
  if (col.type === 'date') {
    const dateStr =
      typeof value === 'string' ? value.replace(/^"|"$/g, '') : value == null ? '' : String(value)
    return (
      <input
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          fontSize: '12px',
          color: 'var(--text-primary)',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    )
  }
  if (col.type === 'number') {
    return (
      <input
        type="number"
        defaultValue={value === null || value === undefined ? '' : String(value)}
        onBlur={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          fontSize: '12px',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
    )
  }
  if (col.type === 'checkbox') {
    return (
      <div style={{ padding: '6px 10px' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: '15px', height: '15px', accentColor: '#1a3a2e', cursor: 'pointer' }}
        />
      </div>
    )
  }
  return (
    <input
      type="text"
      defaultValue={value != null ? String(value) : ''}
      onBlur={(e) => onChange(e.target.value || null)}
      placeholder="—"
      style={{
        width: '100%',
        padding: '6px 10px',
        background: 'none',
        border: 'none',
        fontSize: '12px',
        color: 'var(--text-primary)',
        outline: 'none',
      }}
    />
  )
}

function StatusDetailField({
  settings,
  value,
  onChange,
}: {
  settings: Record<string, unknown>
  value: unknown
  onChange: (v: unknown) => void
}) {
  const tStatus = useTranslations('items.status')
  const tItem = useTranslations('boards.item')
  const [open, setOpen] = useState(false)
  const statuses = (settings?.statuses as typeof DEFAULT_STATUSES | undefined) ?? DEFAULT_STATUSES
  const v = value as { label?: string } | null
  const current = statuses.find((s) => s.label === v?.label)

  function displayLabel(label: string): string {
    const key = STATUS_DB_LABEL_TO_KEY[label as keyof typeof STATUS_DB_LABEL_TO_KEY]
    return key ? tStatus(key) : label
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: current?.bg ?? 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '5px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: current?.color ?? 'var(--text-tertiary)' }}>
          {current?.label ? displayLabel(current.label) : tItem('setStatus')}
        </span>
      </button>
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: 'var(--bg-base)',
              border: '0.5px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '4px',
              minWidth: '160px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}
          >
            {statuses.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  onChange({ label: s.label, color: s.color, bg: s.bg })
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-surface)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none'
                }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: s.bg,
                    border: `1.5px solid ${s.color}`,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{displayLabel(s.label)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function PersonDetailField({
  users,
  value,
  onChange,
}: {
  users: UserData[]
  value: unknown
  onChange: (v: unknown) => void
}) {
  const t = useTranslations('boards.item')
  const [open, setOpen] = useState(false)
  const pv = value as { id?: string } | null
  const assigned = pv?.id ? (users.find((u) => u.id === pv.id) ?? null) : null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderRadius: '5px',
        }}
      >
        {assigned ? (
          <>
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#e8f5f0',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {assigned.avatar_url ? (
                <img
                  src={assigned.avatar_url}
                  alt=""
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                getInitials(assigned.full_name)
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{assigned.full_name}</span>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('assignPrompt')}</span>
        )}
      </button>
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: 'var(--bg-base)',
              border: '0.5px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '4px',
              minWidth: '200px',
              maxHeight: '220px',
              overflowY: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                borderRadius: '5px',
              }}
            >
              {t('unassign')}
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onChange({ id: u.id, full_name: u.full_name, avatar_url: u.avatar_url })
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#e8f5f0',
                    fontSize: '9px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt=""
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    getInitials(u.full_name)
                  )}
                </div>
                <span style={{ fontSize: '12px' }}>{u.full_name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
