'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_COLUMNS = [
  {
    type: 'status',
    title: 'Status',
    position: 0,
    settings: {
      statuses: [
        { label: 'Not started', color: '#6b7280', bg: '#f3f4f6' },
        { label: 'In progress', color: '#1d4ed8', bg: '#eff6ff' },
        { label: 'Done', color: '#15803d', bg: '#f0fdf4' },
        { label: 'Stuck', color: '#dc2626', bg: '#fef2f2' },
        { label: 'Waiting', color: '#d97706', bg: '#fffbeb' },
      ],
    },
  },
  { type: 'person', title: 'Owner', position: 1, settings: {} },
  { type: 'date', title: 'Due date', position: 2, settings: {} },
]

// export async function createBoard(
//   formData: FormData,
//   companyId: string,
//   orgSlug: string,
//   companySlug: string
// ) {
//   const supabase = await createClient()
//   const {
//     data: { user },
//   } = await supabase.auth.getUser()
//   if (!user) return { error: 'Unauthorized' }

//   const name = (formData.get('name') as string)?.trim()
//   const color = (formData.get('color') as string) || '#1a3a2e'
//   const visibility = (formData.get('visibility') as string) || 'company'
//   const description = (formData.get('description') as string)?.trim() || null

//   if (!name) return { error: 'Board name is required' }
//   if (!companyId) return { error: 'Company not found' }

//   // 1. Create the board
//   const { data: board, error: boardError } = await supabase
//     .from('boards')
//     .insert({
//       name,
//       color,
//       visibility,
//       description,
//       company_id: companyId,
//       owner_id: user.id,
//       created_by: user.id,
//     })
//     .select()
//     .single()

//   if (boardError || !board) {
//     console.error('[createBoard] insert error:', boardError)
//     return { error: boardError?.message ?? 'Failed to create board' }
//   }

//   // 2. Create default columns (Status, Owner, Due date)
//   const { error: colError } = await supabase
//     .from('column_definitions')
//     .insert(DEFAULT_COLUMNS.map((col) => ({ ...col, board_id: board.id })))

//   if (colError) console.error('[createBoard] columns error:', colError)

//   // 3. Create default group "Tasks"
//   const { error: groupError } = await supabase.from('board_groups').insert({
//     board_id: board.id,
//     name: 'Tasks',
//     color,
//     position: 0,
//   })

//   if (groupError) console.error('[createBoard] group error:', groupError)

//   // 4. Add creator as board admin member
//   const { error: memberError } = await supabase.from('board_members').insert({
//     board_id: board.id,
//     user_id: user.id,
//     role: 'admin',
//     invited_by: user.id,
//   })

//   if (memberError) console.error('[createBoard] member error:', memberError)

//   // Redirect to the new board
//   redirect(`/${orgSlug}/${companySlug}/board/${board.id}`)
// }

export async function createBoard(
  formData: FormData,
  companyId: string,
  orgSlug: string,
  companySlug: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No session' }

  const name        = (formData.get('name') as string)?.trim()
  const color       = (formData.get('color') as string) || '#1a3a2e'
  const visibility  = (formData.get('visibility') as string) || 'company'
  const description = (formData.get('description') as string)?.trim() || null

  if (!name) return { error: 'Board name is required' }

  // Llamar a la función SECURITY DEFINER que bypasea RLS
    const { data, error } = await (supabase as any)
    .rpc('create_board', {
      p_name: name,
      p_color: color,
      p_visibility: visibility,
      p_description: description,
      p_company_id: companyId,
      p_owner_id: user.id,
      p_created_by: user.id,
    })

  if (error) {
    console.error('[createBoard] rpc error:', error)
    return { error: error.message }
  }

  const boardId = data as unknown as string
  redirect(`/${orgSlug}/${companySlug}/board/${boardId}`)
}