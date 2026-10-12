import type { DemoStore } from './seed'

type Row = Record<string, unknown>

/**
 * Conversaciones de ejemplo de Pasillo: dos directos y dos grupos, con tareas, archivos, un doc y una
 * invitación a reunión compartidos. Busca personas, tareas y archivos por nombre, así sirve igual para
 * un demo nuevo que para datos ya guardados (la migración la llama sin regenerar nada).
 */
export function seedChats(s: DemoStore, anchor: Date) {
  const t = s.tables
  t.chats ??= []
  t.chat_members ??= []
  t.chat_messages ??= []
  if (t.chats.length) return

  const person = (name: string) => t.profiles.find((p) => p.email === `${name}@veltro.demo`)?.id as string | undefined
  const [cesar, ana, pepito, lucia, diego] = ['cesar', 'ana', 'pepito', 'lucia', 'diego'].map(person)
  const account = t.accounts[0]?.id as string | undefined
  if (!cesar || !ana || !pepito || !lucia || !diego || !account) return

  const task = (title: string) => t.tasks.find((x) => x.title === title)?.id as string | undefined
  const file = (name: string) => t.attachments.find((x) => x.name === name)?.id as string | undefined
  const doc = (title: string) => t.docs.find((x) => x.title === title)?.id as string | undefined
  const meeting = (title: string) => t.meetings.find((x) => x.title === title)
  const ago = (minutes: number) => new Date(anchor.getTime() - minutes * 60_000).toISOString()

  const chat = (o: { kind: 'direct' | 'group'; name?: string; by: string; members: string[]; created: number; readAt: Record<string, number> }) => {
    const id = crypto.randomUUID()
    t.chats.push({ id, account_id: account, kind: o.kind, name: o.name ?? null, created_by: o.by, last_message_at: null, created_at: ago(o.created), updated_at: ago(o.created) })
    for (const u of o.members) {
      t.chat_members.push({
        chat_id: id,
        user_id: u,
        role: u === o.by ? 'owner' : 'member',
        last_read_at: o.readAt[u] != null ? ago(o.readAt[u]) : null,
        created_at: ago(o.created),
      })
    }
    const say = (user: string | null, minutes: number, kind: string, body: string, ref?: string, meta: Row = {}) => {
      if (kind !== 'text' && kind !== 'system' && !ref && !meta.invite) return
      t.chat_messages.push({ id: crypto.randomUUID(), chat_id: id, user_id: user, kind, body, ref_id: ref ?? null, meta, created_at: ago(minutes), edited_at: null })
      const c = t.chats.find((x) => x.id === id)!
      c.last_message_at = ago(minutes)
      c.updated_at = ago(minutes)
    }
    return say
  }

  // Ana y Cesar: la cotización del POP
  const withAna = chat({ kind: 'direct', by: ana, members: [cesar, ana], created: 60 * 24 * 6, readAt: { [cesar]: 60, [ana]: 40 } })
  withAna(ana, 180, 'text', '¿Viste las cotizaciones del material POP?')
  withAna(ana, 178, 'file', 'Esta es la más barata y entrega en 10 días.', file('cotizacion-graficas-unidas.pdf'))
  withAna(cesar, 150, 'text', 'Sí, está dentro del tope. La apruebo hoy.')
  withAna(ana, 40, 'task', 'Te dejo la tarea para que la cierres cuando la apruebes.', task('Cerrar presupuesto de material POP'))

  // grupo del equipo de Promoting, con una invitación al kickoff
  const team = chat({
    kind: 'group',
    name: 'Equipo Promoting',
    by: cesar,
    members: [cesar, ana, pepito, lucia],
    created: 60 * 24 * 3,
    readAt: { [cesar]: 110, [ana]: 10, [pepito]: 15, [lucia]: 10 },
  })
  team(cesar, 60 * 24 * 3, 'system', '', undefined, { system: 'created' })
  team(pepito, 300, 'text', 'Impulsadoras confirmadas para el sábado en Farmatodo Las Mercedes.')
  team(lucia, 290, 'file', 'Así quedó la exhibición.', file('exhibicion-farmatodo-las-mercedes.svg'))
  const kickoff = meeting('Kickoff promociones Q4')
  if (kickoff) {
    team(cesar, 120, 'meeting', 'Los espero en el kickoff, traigan sus números.', undefined, {
      invite: {
        title: kickoff.title,
        start: kickoff.starts_at,
        end: kickoff.ends_at ?? kickoff.starts_at,
        conferenceUrl: (kickoff.conference_url as string | null) ?? null,
        eventId: (kickoff.google_event_id as string | null) ?? null,
        rsvp: { [cesar]: 'yes', [ana]: 'yes', [pepito]: 'maybe' },
      },
    })
  }
  team(ana, 100, 'text', 'Ahí estaré.')
  team(pepito, 15, 'text', '¿Alguien tiene el tarifario de proveedores a mano?')
  team(lucia, 10, 'file', 'Aquí está.', file('tarifario-proveedores-2026.csv'))

  // Diego y Cesar: el error de la exportación
  const withDiego = chat({ kind: 'direct', by: diego, members: [cesar, diego], created: 60 * 24 * 10, readAt: { [cesar]: 500, [diego]: 500 } })
  withDiego(diego, 600, 'task', 'Encontré la causa: es memoria del worker. Lo arreglo exportando por lotes.', task('Corregir error en exportación a Excel'))
  withDiego(cesar, 590, 'text', 'Perfecto. ¿Llega para la demo del jueves?')
  withDiego(diego, 585, 'text', 'Sí, lo dejo listo mañana.')

  // grupo del lanzamiento: el brief compartido
  const launch = chat({ kind: 'group', name: 'Lanzamiento Q4', by: ana, members: [cesar, ana, diego], created: 60 * 24 * 2, readAt: { [cesar]: 1000, [ana]: 1000, [diego]: 1000 } })
  launch(ana, 60 * 24 * 2, 'system', '', undefined, { system: 'created' })
  launch(ana, 2000, 'doc', 'Brief final para el lanzamiento.', doc('Brief: promociones Q4'))
  launch(diego, 1900, 'text', 'El dashboard de campañas va a estar listo para esa fecha.')
}
