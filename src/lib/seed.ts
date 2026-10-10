import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type T = (key: string) => string

/** Contenido inicial de un espacio nuevo: un doc de bienvenida y tres tareas de ejemplo. */
export async function seedWorkspace(supabase: SupabaseClient<Database>, workspaceId: string, userId: string, t: T) {
  const markdown = t('welcomeDoc')
  const { data: doc } = await supabase
    .from('docs')
    .insert({
      workspace_id: workspaceId,
      title: t('welcomeTitle'),
      icon: '👋',
      import_markdown: markdown,
      content_text: markdown,
      position: 1000,
    })
    .select('id')
    .single()

  await supabase.from('tasks').insert([
    { workspace_id: workspaceId, title: t('task1'), status: 'todo', priority: 'high', assignee_id: userId, position: 1000, doc_id: doc?.id ?? null },
    { workspace_id: workspaceId, title: t('task2'), status: 'todo', priority: 'medium', assignee_id: userId, position: 2000 },
    { workspace_id: workspaceId, title: t('task3'), status: 'backlog', priority: 'none', position: 3000 },
  ])
}
