'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { BoardGroup, BoardItem, ColumnDef, UserData } from '@/lib/types/board'
import { resolveBoardColumnHeader } from '@/lib/board-column-title'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BoardGroupSection } from './board-group'

export const COL_DRAG = 24
export const COL_CHECKBOX = 36
export const COL_NAME = 280
export const COL_DEFAULT = 140
export const COL_ACTIONS = 80

interface Props {
  groups: BoardGroup[]
  columns: ColumnDef[]
  companyUsers: UserData[]
  onDragEnd: (event: DragEndEvent) => void
  onUpdateCell: (itemId: string, columnId: string, value: unknown) => void
  onUpdateName: (itemId: string, name: string) => void
  onDeleteItem: (itemId: string) => void
  onToggleGroup: (groupId: string) => void
  onOpenDetail: (item: BoardItem, groupId: string) => void
  onCreateItemInGroup: (groupId: string) => void
  focusItemNameId: string | null
  onFocusItemNameConsumed: () => void
}

export function BoardTable({
  groups,
  columns,
  companyUsers,
  onDragEnd,
  onUpdateCell,
  onUpdateName,
  onDeleteItem,
  onToggleGroup,
  onOpenDetail,
  onCreateItemInGroup,
  focusItemNameId,
  onFocusItemNameConsumed,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tBoards = useTranslations('boards')
  const tColumnsNs = useTranslations('columns')
  const tItemsColumns = useTranslations('items.columns')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const totalWidth =
    COL_DRAG + COL_CHECKBOX + COL_NAME + columns.length * COL_DEFAULT + COL_ACTIONS

  const gridTemplate = `${COL_DRAG}px ${COL_CHECKBOX}px ${COL_NAME}px ${columns.map(() => `${COL_DEFAULT}px`).join(' ')} ${COL_ACTIONS}px`

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '12px 20px 40px' }}
    >
      <div style={{ minWidth: `${totalWidth}px` }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'var(--bg-sunken)',
            borderBottom: '0.5px solid var(--border-default)',
            marginBottom: '4px',
          }}
        >
          <div style={{ height: '32px' }} />
          <div style={{ height: '32px' }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              height: '32px',
            }}
          >
            {tBoards('item')}
          </div>
          {columns.map((col) => (
            <div
              key={col.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                height: '32px',
                borderLeft: '0.5px solid var(--border-default)',
              }}
            >
              <ColTypeIcon type={col.type} />
              {resolveBoardColumnHeader(col, tColumnsNs, tItemsColumns)}
            </div>
          ))}
          <div style={{ height: '32px', borderLeft: '0.5px solid var(--border-default)' }} />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          {groups.map((group) => (
            <BoardGroupSection
              key={group.id}
              group={group}
              columns={columns}
              companyUsers={companyUsers}
              colWidths={{
                drag: COL_DRAG,
                checkbox: COL_CHECKBOX,
                name: COL_NAME,
                default: COL_DEFAULT,
                actions: COL_ACTIONS,
              }}
              onUpdateCell={onUpdateCell}
              onUpdateName={onUpdateName}
              onCreateItemInGroup={onCreateItemInGroup}
              focusItemNameId={focusItemNameId}
              onFocusItemNameConsumed={onFocusItemNameConsumed}
              onDeleteItem={onDeleteItem}
              onToggle={() => onToggleGroup(group.id)}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </DndContext>
      </div>
    </div>
  )
}

function ColTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    text: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
    status: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    person: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    date: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    number: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" />
        <line x1="16" y1="3" x2="14" y2="21" />
      </svg>
    ),
    checkbox: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  }
  return <span style={{ opacity: 0.6, display: 'flex' }}>{icons[type] ?? icons.text}</span>
}
