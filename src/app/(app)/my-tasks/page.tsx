import { redirect } from 'next/navigation'

/** Ruta de antes: Mis tareas ahora es Tareas (/tasks). Conserva el alcance y el filtro (?view= pasa a ?filter=). */
export default async function MyTasksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const next = new URLSearchParams()
  if (sp.scope) next.set('scope', sp.scope)
  if (sp.view) {
    next.set('tab', 'list')
    next.set('filter', sp.view)
  }
  redirect(`/tasks${next.toString() ? `?${next}` : ''}`)
}
