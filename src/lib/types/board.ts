export type ColumnType =
  | 'text'
  | 'status'
  | 'person'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'tags'
  | 'dropdown'
  | 'link'

export interface ColumnDef {
  id: string
  board_id: string
  type: ColumnType
  title: string
  position: number
  settings: Record<string, unknown>
  is_hidden: boolean
}

export interface ItemColumnValue {
  id: string
  column_id: string
  value: unknown
}

export interface BoardItem {
  id: string
  name: string
  position: number
  created_at: string
  item_column_values: ItemColumnValue[]
}

export interface BoardGroup {
  id: string
  name: string
  color: string
  position: number
  is_collapsed: boolean
  items: BoardItem[]
}

export interface BoardData {
  id: string
  name: string
  color: string
  icon: string | null
  description: string | null
  visibility: 'private' | 'company' | 'groups'
  owner_id: string
  companies: {
    id: string
    name: string
    slug: string
    organizations?: { slug: string } | null
  }
}

export interface BoardMemberData {
  id: string
  role: string
  user_id: string | null
  group_id: string | null
  profiles?: { id: string; full_name: string; avatar_url: string | null }
}

export interface UserData {
  id: string
  full_name: string
  avatar_url: string | null
  role?: string
}

export const DEFAULT_STATUSES = [
  { label: 'Not started', color: '#6b7280', bg: '#f3f4f6' },
  { label: 'In progress', color: '#1d4ed8', bg: '#eff6ff' },
  { label: 'Done', color: '#15803d', bg: '#f0fdf4' },
  { label: 'Stuck', color: '#dc2626', bg: '#fef2f2' },
  { label: 'Waiting', color: '#d97706', bg: '#fffbeb' },
  { label: 'Cancelled', color: '#9ca3af', bg: '#f9fafb' },
]
