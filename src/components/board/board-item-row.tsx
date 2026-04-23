'use client'

import {
  deleteItem as deleteItemAction,
  updateItemColumnValue,
  updateItemName,
} from '@/app/(dashboard)/[orgSlug]/[companySlug]/board/[boardId]/actions'
import { translateColumnStatusLabel } from '@/lib/column-i18n'
import type { BoardItem, ColumnDef, UserData } from '@/lib/types/board'
import { DEFAULT_STATUSES } from '@/lib/types/board'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface Props {
  item: BoardItem
  columns: ColumnDef[]
  companyUsers: UserData[]
  groupColor: string
  gridTemplate: string
  onUpdateCell: (itemId: string, columnId: string, value: unknown) => void
  onUpdateName: (itemId: string, name: string) => void
  onDelete: () => void
  onOpenDetail: () => void
  focusItemNameId: string | null
  onFocusItemNameConsumed: () => void
}

export function BoardItemRow({
  item,
  columns,
  companyUsers,
  groupColor,
  gridTemplate,
  onUpdateCell,
  onUpdateName,
  onDelete,
  onOpenDetail,
  focusItemNameId,
  onFocusItemNameConsumed,
}: Props) {
  const tUi = useTranslations('boards.itemUi')
  const tItems = useTranslations('items')
  const tBoards = useTranslations('boards')
  const [rowChecked, setRowChecked] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(item.name)
  const [hovered, setHovered] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  useEffect(() => {
    setNameValue(item.name)
  }, [item.name])

  useEffect(() => {
    if (focusItemNameId !== item.id) return
    setEditingName(true)
    queueMicrotask(() => onFocusItemNameConsumed())
  }, [focusItemNameId, item.id, onFocusItemNameConsumed])

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    alignItems: 'center',
    background: hovered ? 'var(--bg-surface)' : 'var(--bg-base)',
    borderTop: '0.5px solid var(--border-default)',
    position: 'relative',
    transition,
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.65 : 1,
  }

  function getCellValue(columnId: string) {
    return item.item_column_values.find((v) => v.column_id === columnId)?.value ?? null
  }

  function handleNameClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onOpenDetail()
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      setEditingName(true)
    }, 220)
  }

  function handleNameBlur() {
    setEditingName(false)
    const next = nameValue.trim() || tBoards('newItem')
    if (next !== item.name) {
      onUpdateName(item.id, next)
      startTransition(() => void updateItemName(item.id, next))
    }
  }

  function handleCellChange(columnId: string, value: unknown) {
    onUpdateCell(item.id, columnId, value)
    startTransition(() => void updateItemColumnValue(item.id, columnId, value))
  }

  function handleDelete() {
    onDelete()
    startTransition(() => void deleteItemAction(item.id))
  }

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setShowMenu(false)
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={tUi('dragToReorder')}
          style={{
            width: '22px',
            height: '28px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            padding: 0,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="9" cy="8" r="1.2" />
            <circle cx="15" cy="8" r="1.2" />
            <circle cx="9" cy="12" r="1.2" />
            <circle cx="15" cy="12" r="1.2" />
            <circle cx="9" cy="16" r="1.2" />
            <circle cx="15" cy="16" r="1.2" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          type="checkbox"
          checked={rowChecked}
          onChange={(e) => setRowChecked(e.target.checked)}
          style={{ width: '14px', height: '14px', accentColor: groupColor, cursor: 'pointer' }}
        />
      </div>

      <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}>
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameBlur()
              if (e.key === 'Escape') {
                setNameValue(item.name)
                setEditingName(false)
              }
            }}
            style={{
              flex: 1,
              fontSize: '13px',
              color: 'var(--text-primary)',
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--primary-mid)',
              borderRadius: '4px',
              padding: '3px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={handleNameClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameClick()
            }}
            style={{
              flex: 1,
              fontSize: '13px',
              color: 'var(--text-primary)',
              cursor: 'text',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: '36px',
            }}
            title={tUi('nameEditHint')}
          >
            {nameValue || tBoards('newItem')}
          </span>
        )}
        {hovered && !editingName && (
          <button
            type="button"
            onClick={onOpenDetail}
            title={tItems('openDetail')}
            style={{
              flexShrink: 0,
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: 'var(--bg-sunken)',
              border: '0.5px solid var(--border-default)',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </button>
        )}
      </div>

      {columns.map((col) => (
        <div
          key={col.id}
          style={{
            borderLeft: '0.5px solid var(--border-default)',
            minHeight: '36px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CellRenderer
            column={col}
            value={getCellValue(col.id)}
            companyUsers={companyUsers}
            onChange={(val) => handleCellChange(col.id, val)}
          />
        </div>
      ))}

      <div
        style={{
          borderLeft: '0.5px solid var(--border-default)',
          minHeight: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {hovered && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowMenu((m) => !m)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-sunken)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowMenu(false)} aria-hidden />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    zIndex: 50,
                    background: 'var(--bg-base)',
                    border: '0.5px solid var(--border-medium)',
                    borderRadius: '8px',
                    padding: '4px',
                    minWidth: '160px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  }}
                >
                  <RowMenuBtn
                    label={tItems('openDetail')}
                    onClick={() => {
                      onOpenDetail()
                      setShowMenu(false)
                    }}
                    icon={
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                    }
                  />
                  <RowMenuBtn
                    label={tUi('duplicate')}
                    onClick={() => setShowMenu(false)}
                    icon={
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    }
                  />
                  <div style={{ height: '0.5px', background: 'var(--border-default)', margin: '3px 0' }} />
                  <RowMenuBtn
                    label={tItems('deleteItem')}
                    danger
                    onClick={() => {
                      handleDelete()
                      setShowMenu(false)
                    }}
                    icon={
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RowMenuBtn({
  label,
  onClick,
  icon,
  danger = false,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 10px',
        background: 'none',
        border: 'none',
        borderRadius: '6px',
        fontSize: '12px',
        color: danger ? 'hsl(0 72% 51%)' : 'var(--text-primary)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'hsl(0 86% 97%)' : 'var(--bg-surface)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function CellRenderer({
  column,
  value,
  companyUsers,
  onChange,
}: {
  column: ColumnDef
  value: unknown
  companyUsers: UserData[]
  onChange: (v: unknown) => void
}) {
  switch (column.type) {
    case 'status':
      return <StatusCell value={value} settings={column.settings} onChange={onChange} />
    case 'person':
      return <PersonCell value={value} users={companyUsers} onChange={onChange} />
    case 'date':
      return <DateCell value={value} onChange={onChange} />
    case 'number':
      return <NumberCell value={value} onChange={onChange} />
    case 'checkbox':
      return <CheckboxCell value={value} onChange={onChange} />
    case 'text':
      return <TextCell value={value} onChange={onChange} />
    default:
      return <div style={{ padding: '0 10px', fontSize: '12px', color: 'var(--text-tertiary)' }}>—</div>
  }
}

function StatusCell({
  value,
  settings,
  onChange,
}: {
  value: unknown
  settings: Record<string, unknown>
  onChange: (v: unknown) => void
}) {
  const tColumns = useTranslations('columns')
  const [open, setOpen] = useState(false)
  const statuses = (settings?.statuses as typeof DEFAULT_STATUSES | undefined) ?? DEFAULT_STATUSES
  const v = value as { label?: string } | null
  const current = statuses.find((s) => s.label === v?.label) ?? null

  function displayLabel(label: string): string {
    return translateColumnStatusLabel(tColumns, label)
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: '36px',
          padding: '0 10px',
          background: current ? current.bg : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'filter .1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = 'brightness(0.96)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'none'
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: current?.color ?? 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          {current?.label ? displayLabel(current.label) : '—'}
        </span>
      </button>
      {open && (
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
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: '6px',
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
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: s.bg,
                    border: `1.5px solid ${s.color}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{displayLabel(s.label)}</span>
                {v?.label === s.label && (
                  <svg
                    style={{ marginLeft: 'auto' }}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2.5"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PersonCell({
  value,
  users,
  onChange,
}: {
  value: unknown
  users: UserData[]
  onChange: (v: unknown) => void
}) {
  const t = useTranslations('boards.itemUi')
  const [open, setOpen] = useState(false)
  const pv = value as { id?: string } | null
  const assigned: UserData | null = pv?.id ? (users.find((u) => u.id === pv.id) ?? null) : null

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: '36px',
          padding: '0 8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {assigned ? (
          <>
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'var(--primary-light)',
                color: 'hsl(var(--primary))',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
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
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {assigned.full_name.split(' ')[0]}
            </span>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>—</span>
        )}
      </button>
      {open && (
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
              maxHeight: '240px',
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
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              {t('unassign')}
            </button>
            <div style={{ height: '0.5px', background: 'var(--border-default)', margin: '3px 0' }} />
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
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-surface)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none'
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'var(--primary-light)',
                    color: 'hsl(var(--primary))',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
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
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{u.full_name}</span>
                {pv?.id === u.id && (
                  <svg
                    style={{ marginLeft: 'auto' }}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2.5"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function normalizeDateString(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    const s = raw.replace(/^"|"$/g, '')
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
  }
  return ''
}

function DateCell({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dateStr = normalizeDateString(value)

  return (
    <div
      style={{ width: '100%', position: 'relative', cursor: 'pointer' }}
      onClick={() => inputRef.current?.showPicker?.()}
    >
      <input
        ref={inputRef}
        type="date"
        value={dateStr}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', cursor: 'pointer' }}
      />
      <div
        style={{
          padding: '0 10px',
          fontSize: '12px',
          color: dateStr ? 'var(--text-primary)' : 'var(--text-tertiary)',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {dateStr ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary-mid)" strokeWidth="2" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </>
        ) : (
          '—'
        )}
      </div>
    </div>
  )
}

function NumberCell({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value === null || value === undefined ? '' : String(value))

  useEffect(() => {
    if (!editing) setVal(value === null || value === undefined ? '' : String(value))
  }, [value, editing])

  return editing ? (
    <input
      autoFocus
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false)
        onChange(val === '' ? null : Number(val))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      style={{
        width: '100%',
        height: '36px',
        padding: '0 10px',
        border: 'none',
        borderLeft: '2px solid var(--primary-mid)',
        background: 'var(--bg-surface)',
        fontSize: '12px',
        color: 'var(--text-primary)',
        outline: 'none',
        textAlign: 'right',
      }}
    />
  ) : (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditing(true)
      }}
      style={{
        width: '100%',
        height: '36px',
        padding: '0 10px',
        fontSize: '12px',
        color: value != null ? 'var(--text-primary)' : 'var(--text-tertiary)',
        cursor: 'text',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      {value != null ? String(value) : '—'}
    </div>
  )
}

function CheckboxCell({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: '15px', height: '15px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
      />
    </div>
  )
}

function TextCell({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value != null ? String(value) : '')

  useEffect(() => {
    if (!editing) setVal(value != null ? String(value) : '')
  }, [value, editing])

  return editing ? (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false)
        onChange(val || null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      style={{
        width: '100%',
        height: '36px',
        padding: '0 10px',
        border: 'none',
        borderLeft: '2px solid var(--primary-mid)',
        background: 'var(--bg-surface)',
        fontSize: '12px',
        color: 'var(--text-primary)',
        outline: 'none',
      }}
    />
  ) : (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditing(true)
      }}
      style={{
        width: '100%',
        height: '36px',
        padding: '0 10px',
        fontSize: '12px',
        color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
        cursor: 'text',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value != null ? String(value) : '—'}
      </span>
    </div>
  )
}
