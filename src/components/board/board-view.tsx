'use client'

import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type {
  BoardData,
  BoardGroup,
  BoardItem,
  BoardMemberData,
  ColumnDef,
  UserData,
} from '@/lib/types/board'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  createItem,
  syncItemPositions,
} from '@/app/(dashboard)/[orgSlug]/[companySlug]/board/[boardId]/actions'
import { BoardHeader } from './board-header'
import { BoardTable } from './board-table'
import { BoardToolbar } from './board-toolbar'
import { ItemDetailPanel } from './item-detail-panel'

interface Props {
  board: BoardData
  initialGroups: BoardGroup[]
  columns: ColumnDef[]
  members: BoardMemberData[]
  companyUsers: UserData[]
  currentUser: UserData
}

function flattenPositions(groups: BoardGroup[]): { id: string; group_id: string; position: number }[] {
  const rows: { id: string; group_id: string; position: number }[] = []
  for (const g of groups) {
    g.items.forEach((it, i) => {
      rows.push({ id: it.id, group_id: g.id, position: i })
    })
  }
  return rows
}

export function BoardView({
  board,
  initialGroups,
  columns,
  members,
  companyUsers,
  currentUser,
}: Props) {
  const [groups, setGroups] = useState<BoardGroup[]>(initialGroups)
  const [selectedItem, setSelectedItem] = useState<{ item: BoardItem; groupId: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [, startTransition] = useTransition()
  const [isHeaderAddPending, startHeaderAddTransition] = useTransition()
  const tItem = useTranslations('boards.item')

  const persistOrder = useCallback((next: BoardGroup[]) => {
    const rows = flattenPositions(next)
    startTransition(() => {
      void syncItemPositions(rows)
    })
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const dropzonePrefix = 'dropzone:'

      setGroups((prev) => {
        let fromGroup: BoardGroup | null = null
        let fromIdx = -1
        let toGroup: BoardGroup | null = null
        let toIdx = -1

        for (const g of prev) {
          const fi = g.items.findIndex((i) => i.id === activeId)
          if (fi >= 0) {
            fromGroup = g
            fromIdx = fi
          }
        }

        if (overId.startsWith(dropzonePrefix)) {
          const gid = overId.slice(dropzonePrefix.length)
          toGroup = prev.find((g) => g.id === gid) ?? null
          toIdx = toGroup ? toGroup.items.length : -1
        } else {
          for (const g of prev) {
            const ti = g.items.findIndex((i) => i.id === overId)
            if (ti >= 0) {
              toGroup = g
              toIdx = ti
            }
          }
        }

        if (!fromGroup || !toGroup || fromIdx < 0 || toIdx < 0) return prev

        const item = fromGroup.items[fromIdx]

        if (fromGroup.id === toGroup.id) {
          const newItems = arrayMove(fromGroup.items, fromIdx, toIdx).map((it, i) => ({
            ...it,
            position: i,
          }))
          const next = prev.map((g) => (g.id === fromGroup!.id ? { ...g, items: newItems } : g))
          persistOrder(next)
          return next
        }

        const without = fromGroup.items
          .filter((_, i) => i !== fromIdx)
          .map((it, i) => ({ ...it, position: i }))
        const destItems = [...toGroup.items]
        destItems.splice(toIdx, 0, item)
        const reindexedDest = destItems.map((it, i) => ({ ...it, position: i }))

        const next = prev.map((g) => {
          if (g.id === fromGroup!.id) return { ...g, items: without }
          if (g.id === toGroup!.id) return { ...g, items: reindexedDest }
          return g
        })
        persistOrder(next)
        return next
      })
    },
    [persistOrder]
  )

  const updateCellValue = useCallback((itemId: string, columnId: string, value: unknown) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((item) => {
          if (item.id !== itemId) return item
          const existing = item.item_column_values.find((v) => v.column_id === columnId)
          if (existing) {
            return {
              ...item,
              item_column_values: item.item_column_values.map((v) =>
                v.column_id === columnId ? { ...v, value } : v
              ),
            }
          }
          return {
            ...item,
            item_column_values: [
              ...item.item_column_values,
              { id: `tmp-${Date.now()}`, column_id: columnId, value },
            ],
          }
        }),
      }))
    )
  }, [])

  const updateItemName = useCallback((itemId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((item) => (item.id === itemId ? { ...item, name } : item)),
      }))
    )
  }, [])

  const addItem = useCallback((groupId: string, newItem: BoardItem) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, items: [...g.items, newItem] } : g))
    )
  }, [])

  const deleteItem = useCallback(
    (itemId: string) => {
      setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) })))
      if (selectedItem?.item.id === itemId) setSelectedItem(null)
    },
    [selectedItem]
  )

  const addGroup = useCallback((newGroup: BoardGroup) => {
    setGroups((prev) => [...prev, newGroup])
  }, [])

  const handleHeaderAddItem = useCallback(() => {
    const gid = groups[0]?.id
    if (!gid) return
    startHeaderAddTransition(async () => {
      const result = await createItem(gid, board.id, tItem('newItem'))
      if (result.data) {
        addItem(gid, { ...(result.data as BoardItem), item_column_values: [] })
      }
    })
  }, [groups, board.id, tItem, addItem])

  const toggleGroup = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, is_collapsed: !g.is_collapsed } : g))
    )
  }, [])

  const filteredGroups = searchQuery
    ? groups.map((g) => ({
        ...g,
        items: g.items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase())),
      }))
    : groups

  const resolvedDetailItem = useMemo(() => {
    if (!selectedItem) return null
    for (const g of groups) {
      const it = g.items.find((i) => i.id === selectedItem.item.id)
      if (it) return it
    }
    return null
  }, [selectedItem, groups])

  useEffect(() => {
    if (selectedItem && !resolvedDetailItem) setSelectedItem(null)
  }, [selectedItem, resolvedDetailItem])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <BoardHeader
          board={board}
          members={members}
          currentUser={currentUser}
          canAddItem={!!groups[0]?.id}
          isAddItemPending={isHeaderAddPending}
          onAddItemHeader={handleHeaderAddItem}
        />
        <BoardToolbar boardId={board.id} onSearch={setSearchQuery} onAddGroup={addGroup} />
        <BoardTable
          board={board}
          groups={filteredGroups}
          columns={columns}
          companyUsers={companyUsers}
          onDragEnd={handleDragEnd}
          onUpdateCell={updateCellValue}
          onUpdateName={updateItemName}
          onAddItem={addItem}
          onDeleteItem={deleteItem}
          onToggleGroup={toggleGroup}
          onOpenDetail={(item, groupId) => setSelectedItem({ item, groupId })}
        />
      </div>

      {resolvedDetailItem && (
        <ItemDetailPanel
          item={resolvedDetailItem}
          columns={columns}
          companyUsers={companyUsers}
          currentUser={currentUser}
          onClose={() => setSelectedItem(null)}
          onUpdateCell={updateCellValue}
          onUpdateName={updateItemName}
          onDelete={() => deleteItem(resolvedDetailItem.id)}
        />
      )}
    </div>
  )
}
