import { BoardView } from '@/components/board/board-view'
import { createClient } from '@/lib/supabase/server'
import type {
  BoardGroup,
  BoardItem,
  BoardMemberData,
  ColumnDef,
  ItemColumnValue,
  UserData,
} from '@/lib/types/board'
import { notFound, redirect } from 'next/navigation'

interface Props {
  params: { orgSlug: string; companySlug: string; boardId: string }
}

function sortGroups(groups: BoardGroup[]): BoardGroup[] {
  return [...groups]
    .sort((a, b) => a.position - b.position)
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => a.position - b.position),
    }))
}

export default async function BoardPage({ params }: Props) {
  const { orgSlug, companySlug, boardId } = params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select(
      `
      id, name, color, icon, description, visibility, owner_id,
      companies ( id, name, slug, organizations ( slug ) )
    `
    )
    .eq('id', boardId)
    .single()

  if (boardError || !board) notFound()

  const company = board.companies as {
    id: string
    name: string
    slug: string
    organizations?: { slug: string } | null
  } | null

  if (!company || company.slug !== companySlug) notFound()
  const org = company.organizations
  if (org && org.slug !== orgSlug) notFound()

  const { data: columns } = await supabase
    .from('column_definitions')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_hidden', false)
    .order('position', { ascending: true })

  const { data: groupsRaw } = await supabase
    .from('board_groups')
    .select(
      `
      id, name, color, position, is_collapsed,
      items (
        id, name, position, created_at,
        item_column_values ( id, column_id, value )
      )
    `
    )
    .eq('board_id', boardId)
    .order('position', { ascending: true })

  const groups: BoardGroup[] = sortGroups(
    (groupsRaw ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      position: g.position,
      is_collapsed: g.is_collapsed,
      items: ((g.items ?? []) as BoardItem[]).map((it) => ({
        ...it,
        item_column_values: (it.item_column_values ?? []) as ItemColumnValue[],
      })),
    }))
  )

  const { data: members } = await supabase
    .from('board_members')
    .select(
      `
      id, role, user_id, group_id,
      profiles ( id, full_name, avatar_url )
    `
    )
    .eq('board_id', boardId)

  const { data: assignments } = await supabase
    .from('user_company_assignments')
    .select(
      `
      profiles ( id, full_name, avatar_url )
    `
    )
    .eq('company_id', company.id)

  const companyUsers =
    (assignments ?? [])
      .map((a) => a.profiles as { id: string; full_name: string; avatar_url: string | null } | null)
      .filter(Boolean) ?? []

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('id', user.id)
    .single()

  if (!currentProfile) redirect('/login')

  return (
    <BoardView
      board={{
        id: board.id,
        name: board.name,
        color: board.color,
        icon: board.icon,
        description: board.description,
        visibility: board.visibility as 'private' | 'company' | 'groups',
        owner_id: board.owner_id,
        companies: company,
      }}
      initialGroups={groups}
      columns={(columns ?? []) as ColumnDef[]}
      members={(members ?? []) as BoardMemberData[]}
      companyUsers={companyUsers as UserData[]}
      currentUser={currentProfile as UserData}
    />
  )
}
