'use server'

import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'

export async function createItem(groupId: string, boardId: string, name: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: last } = await supabase
    .from('items')
    .select('position')
    .eq('group_id', groupId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (last?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('items')
    .insert({
      group_id: groupId,
      board_id: boardId,
      name: name.trim() || 'New item',
      position,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function updateItemName(itemId: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('items').update({ name }).eq('id', itemId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateItemColumnValue(itemId: string, columnId: string, value: unknown) {
  const supabase = await createClient()
  const { error } = await supabase.from('item_column_values').upsert(
    { item_id: itemId, column_id: columnId, value: value as Json },
    { onConflict: 'item_id,column_id' }
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteItem(itemId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('items').delete().eq('id', itemId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function moveItem(itemId: string, newGroupId: string, newPosition: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('items')
    .update({ group_id: newGroupId, position: newPosition })
    .eq('id', itemId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function syncItemPositions(rows: { id: string; group_id: string; position: number }[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  for (const r of rows) {
    const { error } = await supabase
      .from('items')
      .update({ group_id: r.group_id, position: r.position })
      .eq('id', r.id)
    if (error) return { error: error.message }
  }
  return { success: true }
}

export async function createGroup(boardId: string, name: string) {
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('board_groups')
    .select('position')
    .eq('board_id', boardId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (last?.position ?? -1) + 1
  const colors = ['#1a3a2e', '#1d4ed8', '#7c3aed', '#db2777', '#d97706', '#dc2626', '#0891b2']
  const color = colors[position % colors.length]

  const { data, error } = await supabase
    .from('board_groups')
    .insert({ board_id: boardId, name, position, color })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function updateGroupName(groupId: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').update({ name }).eq('id', groupId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function toggleGroupCollapse(groupId: string, collapsed: boolean) {
  const supabase = await createClient()
  await supabase.from('board_groups').update({ is_collapsed: collapsed }).eq('id', groupId)
}
