import type { MeetingItemRow, TaskRow } from '@/lib/database.types'

/**
 * Acuerdos vivos: decisiones de una reunión que todavía tienen tareas abiertas.
 * Una tarea pertenece a la reunión si nació en ella (meeting_id) o si un ítem de acción de la reunión la referencia.
 */
export function meetingAgreements(items: MeetingItemRow[], tasks: TaskRow[]) {
  const byMeeting = new Map<string, MeetingItemRow[]>()
  for (const i of items) {
    if (!byMeeting.has(i.meeting_id)) byMeeting.set(i.meeting_id, [])
    byMeeting.get(i.meeting_id)!.push(i)
  }
  const out: { meetingId: string; decisions: MeetingItemRow[]; open: TaskRow[] }[] = []
  for (const [meetingId, list] of byMeeting) {
    const decisions = list.filter((i) => i.kind === 'decision')
    if (!decisions.length) continue
    const linked = new Set(list.map((i) => i.task_id).filter(Boolean) as string[])
    const open = tasks.filter((x) => x.status !== 'done' && (x.meeting_id === meetingId || linked.has(x.id)))
    if (open.length) out.push({ meetingId, decisions, open })
  }
  return out
}
