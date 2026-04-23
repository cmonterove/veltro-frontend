'use client'

import { toggleGroupCollapse, updateGroupName } from '@/app/(dashboard)/[orgSlug]/[companySlug]/board/[boardId]/actions'
import type { BoardGroup, BoardItem, ColumnDef, UserData } from '@/lib/types/board'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { BoardItemRow } from './board-item-row'

interface Props {
  group: BoardGroup
  columns: ColumnDef[]
  companyUsers: UserData[]
  colWidths: { drag: number; checkbox: number; name: number; default: number; actions: number }
  onUpdateCell: (itemId: string, columnId: string, value: unknown) => void
  onUpdateName: (itemId: string, name: string) => void
  onCreateItemInGroup: (groupId: string) => void
  focusItemNameId: string | null
  onFocusItemNameConsumed: () => void
  onDeleteItem: (itemId: string) => void
  onToggle: () => void
  onOpenDetail: (item: BoardItem, groupId: string) => void
}

export function BoardGroupSection({
  group,
  columns,
  companyUsers,
  colWidths,
  onUpdateCell,
  onUpdateName,
  onCreateItemInGroup,
  focusItemNameId,
  onFocusItemNameConsumed,
  onDeleteItem,
  onToggle,
  onOpenDetail,
}: Props) {
  const [editingName, setEditingName] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [, startTransition] = useTransition()
  const tBoards = useTranslations('boards')
  const tItems = useTranslations('items')

  useEffect(() => {
    setGroupName(group.name)
  }, [group.name])

  const dropId = `dropzone:${group.id}`
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    disabled: group.items.length > 0,
  })

  const gridTemplate = `${colWidths.drag}px ${colWidths.checkbox}px ${colWidths.name}px ${columns.map(() => `${colWidths.default}px`).join(' ')} ${colWidths.actions}px`

  function handleNameBlur() {
    setEditingName(false)
    if (groupName !== group.name) {
      startTransition(() => void updateGroupName(group.id, groupName))
    }
  }

  function handleToggle() {
    onToggle()
    startTransition(() => void toggleGroupCollapse(group.id, !group.is_collapsed))
  }

  const sortableIds = group.items.map((i) => i.id)

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          alignItems: 'center',
          marginBottom: '2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: colWidths.drag }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleToggle}
            aria-label={group.is_collapsed ? tBoards('expandAll') : tBoards('collapseAll')}
            title={group.is_collapsed ? tBoards('expand') : tBoards('collapse')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: '4px',
              display: 'flex',
              borderRadius: '4px',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{
                transform: group.is_collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform .15s',
              }}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
          <div
            style={{
              width: '4px',
              height: '16px',
              borderRadius: '2px',
              background: group.color,
              flexShrink: 0,
            }}
          />
          {editingName ? (
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameBlur()
                if (e.key === 'Escape') {
                  setGroupName(group.name)
                  setEditingName(false)
                }
              }}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                background: 'var(--bg-surface)',
                border: '0.5px solid var(--primary-mid)',
                borderRadius: '4px',
                padding: '1px 6px',
                outline: 'none',
                width: '180px',
              }}
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              onDoubleClick={() => setEditingName(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setEditingName(true)
              }}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                cursor: 'text',
              }}
            >
              {groupName}
            </span>
          )}
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              background: 'var(--bg-surface)',
              padding: '1px 6px',
              borderRadius: '8px',
            }}
          >
            {group.items.length}
          </span>
        </div>
      </div>

      {!group.is_collapsed && (
        <div
          style={{
            border: '0.5px solid var(--border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            borderLeft: `3px solid ${group.color}`,
          }}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {group.items.length === 0 ? (
              <div
                ref={setDropRef}
                style={{
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                  background: isOver ? 'var(--bg-surface)' : 'var(--bg-base)',
                  borderBottom: '0.5px solid var(--border-default)',
                }}
              >
                {tItems('noItems')}
              </div>
            ) : (
              group.items.map((item) => (
                <BoardItemRow
                  key={item.id}
                  item={item}
                  columns={columns}
                  companyUsers={companyUsers}
                  groupColor={group.color}
                  gridTemplate={gridTemplate}
                  onUpdateCell={onUpdateCell}
                  onUpdateName={onUpdateName}
                  onDelete={() => onDeleteItem(item.id)}
                  onOpenDetail={() => onOpenDetail(item, group.id)}
                  focusItemNameId={focusItemNameId}
                  onFocusItemNameConsumed={onFocusItemNameConsumed}
                />
              ))
            )}
          </SortableContext>

          <button
            type="button"
            onClick={() => onCreateItemInGroup(group.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              padding: '7px 12px',
              background: 'none',
              border: 'none',
              borderTop: group.items.length > 0 ? '0.5px solid var(--border-default)' : 'none',
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-tertiary)'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {tItems('addItem')}
          </button>
        </div>
      )}
    </div>
  )
}
