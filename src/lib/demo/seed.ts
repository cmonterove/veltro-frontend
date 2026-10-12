import { addDays, format, subDays, subHours } from 'date-fns'
import { seedChats } from './chats-seed'
import type { CalendarEvent } from '@/lib/types'
import { DEMO_USER_ID } from './config'
import { anchorEvents, lastOccurrence, nextOccurrence, PEOPLE } from './calendar-gen'

export const SEED_VERSION = 4

type Row = Record<string, unknown>

export type DemoStore = {
  version: number
  /** cambios de esquema aplicados sobre datos ya guardados (engine.ts → upgrade) */
  schema?: number
  anchor: string
  tables: {
    plans: Row[]
    profiles: Row[]
    accounts: Row[]
    account_members: Row[]
    departments: Row[]
    workspaces: Row[]
    workspace_members: Row[]
    meetings: Row[]
    meeting_items: Row[]
    docs: Row[]
    tasks: Row[]
    task_comments: Row[]
    attachments: Row[]
    chats: Row[]
    chat_members: Row[]
    chat_messages: Row[]
    google_connections: Row[]
    api_tokens: Row[]
  }
  /** eventos creados desde "Nueva reunión" */
  events: CalendarEvent[]
  files: Record<string, string>
}

// ---------- helpers de contenido (bloques de BlockNote) ----------

type Seg = string | { t: string; b?: boolean; i?: boolean; code?: boolean }
// ProseMirror no admite nodos de texto vacíos: se filtran
const inline = (segs: Seg[] | string) =>
  (typeof segs === 'string' ? [segs] : segs)
    .filter((s) => (typeof s === 'string' ? s : s.t) !== '')
    .map((s) =>
    typeof s === 'string'
      ? { type: 'text', text: s, styles: {} }
      : { type: 'text', text: s.t, styles: { ...(s.b ? { bold: true } : {}), ...(s.i ? { italic: true } : {}), ...(s.code ? { code: true } : {}) } },
  )
const h = (level: 1 | 2 | 3, text: string) => ({ type: 'heading', props: { level }, content: inline(text) })
const p = (segs: Seg[] | string = '') => ({ type: 'paragraph', content: segs === '' ? [] : inline(segs) })
const li = (segs: Seg[] | string) => ({ type: 'bulletListItem', content: inline(segs) })
const ol = (segs: Seg[] | string) => ({ type: 'numberedListItem', content: inline(segs) })
const check = (text: string, checked = false, id?: string) => ({ ...(id ? { id } : {}), type: 'checkListItem', props: { checked }, content: inline(text) })
const quote = (text: string) => ({ type: 'quote', content: inline(text) })
const code = (language: string, text: string) => ({ type: 'codeBlock', props: { language }, content: [{ type: 'text', text, styles: {} }] })

function textOf(blocks: Row[]) {
  return blocks
    .map((b) => (Array.isArray(b.content) ? (b.content as { text?: string }[]).map((c) => c.text ?? '').join('') : ''))
    .filter(Boolean)
    .join('\n')
}

// ---------- seed ----------

export function buildSeed(anchor: Date): DemoStore {
  const iso = (d: Date) => d.toISOString()
  const day = (n: number) => format(addDays(anchor, n), 'yyyy-MM-dd')
  const ago = (hours: number) => iso(subHours(anchor, hours))
  const id = () => crypto.randomUUID()

  // personas
  const users = {
    cesar: { id: DEMO_USER_ID, ...PEOPLE.cesar },
    ana: { id: id(), ...PEOPLE.ana },
    pepito: { id: id(), ...PEOPLE.pepito },
    lucia: { id: id(), ...PEOPLE.lucia },
    diego: { id: id(), ...PEOPLE.diego },
  }
  const profiles = Object.values(users).map((u, i) => ({
    id: u.id,
    email: u.email,
    full_name: u.name,
    avatar_url: null,
    locale: 'es',
    timezone: 'America/Caracas',
    must_change_password: false,
    created_at: iso(subDays(anchor, 40 - i)),
    updated_at: iso(subDays(anchor, 40 - i)),
  }))

  const account = {
    id: id(),
    name: 'Consorcio Promoting',
    plan_id: 'free',
    owner_id: users.cesar.id,
    created_at: iso(subDays(anchor, 40)),
    updated_at: iso(subDays(anchor, 40)),
  }
  // Organigrama de ejemplo: Gerente General → Gerente Comercial → Supervisor → Analista; Tecnología aparte
  const depComercial = { id: id(), account_id: account.id, name: 'Comercial', head_id: users.ana.id, created_at: iso(subDays(anchor, 38)), updated_at: iso(subDays(anchor, 38)) }
  const depTech = { id: id(), account_id: account.id, name: 'Tecnología', head_id: users.diego.id, created_at: iso(subDays(anchor, 38)), updated_at: iso(subDays(anchor, 38)) }
  const departments = [depComercial, depTech]
  const account_members = [
    { account_id: account.id, user_id: users.cesar.id, role: 'owner', title: 'Gerente General', department_id: null, reports_to: null },
    { account_id: account.id, user_id: users.ana.id, role: 'admin', title: 'Gerente Comercial', department_id: depComercial.id, reports_to: users.cesar.id },
    { account_id: account.id, user_id: users.pepito.id, role: 'member', title: 'Supervisor de campo', department_id: depComercial.id, reports_to: users.ana.id },
    { account_id: account.id, user_id: users.lucia.id, role: 'member', title: 'Analista de trade', department_id: depComercial.id, reports_to: users.pepito.id },
    { account_id: account.id, user_id: users.diego.id, role: 'member', title: 'Coordinador de tecnología', department_id: depTech.id, reports_to: users.cesar.id },
  ].map((m) => ({ ...m, created_at: iso(subDays(anchor, 38)) }))

  const mkWs = (name: string, slug: string, key: string, icon: string, color: string, description: string, task_fields: Row[] = [], task_statuses: Row[] = []) => ({
    id: id(),
    account_id: account.id,
    name,
    slug,
    key,
    icon,
    color,
    description,
    task_seq: 0,
    task_fields,
    task_statuses,
    created_by: users.cesar.id,
    created_at: iso(subDays(anchor, 38)),
    updated_at: iso(subDays(anchor, 38)),
    archived_at: null,
  })
  const pro = mkWs('Promoting', 'promoting', 'PRO', 'P', 'violet', 'Operaciones y campañas promocionales.', [
    { id: 'f_cliente', name: 'Cliente', type: 'select', options: ['Polar', 'Farmatodo', 'Central Madeirense', 'Interno'] },
    { id: 'f_presupuesto', name: 'Presupuesto (USD)', type: 'number' },
  ])
  const tm = mkWs('Trade Marketing', 'trade-marketing', 'TM', 'T', 'mandarina', 'Exhibición en punto de venta y relación con clientes.', [
    { id: 'f_cadena', name: 'Cadena', type: 'select', options: ['Farmatodo', 'Central Madeirense', 'Gama', 'Locatel'] },
    { id: 'f_tiendas', name: 'Tiendas', type: 'number' },
  ])
  // Tech Ve usa estados propios (flujo de desarrollo); los otros espacios, los estándar
  const tv = mkWs(
    'Tech Ve',
    'tech-ve',
    'TV',
    'V',
    'ink',
    'Producto digital y plataforma interna.',
    [
      { id: 'f_repo', name: 'Repositorio', type: 'url' },
      { id: 'f_sprint', name: 'Sprint', type: 'text' },
    ],
    [
      { id: 's_ideas', name: 'Ideas', category: 'backlog' },
      { id: 's_sprint', name: 'En el sprint', category: 'todo' },
      { id: 's_dev', name: 'En desarrollo', category: 'in_progress' },
      { id: 's_review', name: 'En revisión', category: 'in_progress' },
      { id: 's_blocked', name: 'Bloqueada', category: 'blocked' },
      { id: 's_prod', name: 'En producción', category: 'done' },
    ],
  )
  const workspaces = [pro, tm, tv]

  const workspace_members = [
    { workspace_id: pro.id, user_id: users.cesar.id, role: 'admin' },
    { workspace_id: tm.id, user_id: users.cesar.id, role: 'admin' },
    { workspace_id: tv.id, user_id: users.cesar.id, role: 'admin' },
    { workspace_id: pro.id, user_id: users.pepito.id, role: 'editor' },
    { workspace_id: tm.id, user_id: users.pepito.id, role: 'editor' },
    { workspace_id: tm.id, user_id: users.lucia.id, role: 'editor' },
    { workspace_id: tv.id, user_id: users.diego.id, role: 'editor' },
    { workspace_id: pro.id, user_id: users.diego.id, role: 'viewer' },
  ].map((m) => ({ ...m, created_at: iso(subDays(anchor, 37)) }))

  // ---------- reuniones enlazadas a eventos del calendario demo ----------
  const evDaily = lastOccurrence('daily', anchor)
  const evPolar = lastOccurrence('polar', anchor)
  const evDemo = lastOccurrence('demo-tech', anchor)
  const evKickoff = nextOccurrence('kickoff-q4', anchor)

  const anchorEvs = anchorEvents(anchor)
  const evBudget = anchorEvs.find((e) => e.seriesKey === 'presupuesto-pop')!
  const evLive = anchorEvs.find((e) => e.seriesKey === 'revision-pendientes')!
  const evSync = anchorEvs.find((e) => e.seriesKey === 'sync-diego')!

  const mkMeeting = (ws: Row, ev: CalendarEvent, phase: 'prep' | 'live' | 'closed', summary: string | null = null) => ({
    id: id(),
    workspace_id: ws.id,
    google_event_id: ev.id,
    google_calendar_id: ev.calendarId,
    series_key: ev.seriesKey,
    title: ev.title,
    starts_at: ev.start,
    ends_at: ev.end,
    attendees: ev.attendees,
    location: ev.location,
    conference_url: ev.conferenceUrl,
    html_link: null,
    phase,
    summary,
    follow_up: null,
    closed_at: phase === 'closed' ? ev.end : null,
    created_by: users.cesar.id,
    created_at: ev.start,
    updated_at: ev.start,
  })
  const mDaily = mkMeeting(pro, evDaily, 'closed', 'Pepito confirmó 6 de 8 impulsadoras para el sábado y falta cubrir Valencia. El presupuesto POP sigue abierto: Ana espera la cotización final. El tablero de KPIs no recibe datos de la cadena desde el lunes.')
  const mPolar = mkMeeting(tm, evPolar, 'closed', 'Polar reportó +12% en Farmatodo y quiere más visibilidad en cabeceras. Evaluará renovar el contrato en noviembre según los resultados de Q4. Nos comprometimos a enviar fotos semanales de las exhibiciones.')
  const mDemo = mkMeeting(tv, evDemo, 'live')
  const mKickoff = mkMeeting(pro, evKickoff, 'prep')
  const mBudget = mkMeeting(pro, evBudget, 'closed', 'Se fijó un tope de 4.500 USD para el material POP. Ana pide una tercera cotización antes de cerrar con Gráficas Unidas.')
  const mLive = mkMeeting(pro, evLive, 'live')
  const mSync = mkMeeting(tv, evSync, 'prep')
  const meetings = [mDaily, mPolar, mDemo, mKickoff, mBudget, mLive, mSync]

  const when = (ev: CalendarEvent) => {
    const s = new Date(ev.start)
    return `${format(s, 'dd/MM/yyyy HH:mm')} - ${format(new Date(ev.end), 'HH:mm')}`
  }
  const names = (ev: CalendarEvent) => ev.attendees.map((a) => a.name).join(', ')

  // ---------- docs ----------
  const docs: Row[] = []
  const mkDoc = (d: Partial<Row> & { workspace: Row; title: string }) => {
    const content = (d.content as Row[] | undefined) ?? []
    const row = {
      id: id(),
      workspace_id: d.workspace.id,
      parent_id: d.parent_id ?? null,
      title: d.title,
      icon: null,
      content,
      content_text: d.content_text ?? textOf(content),
      excerpt: String(d.content_text ?? textOf(content)).slice(0, 240),
      import_markdown: d.import_markdown ?? null,
      source: d.source ?? 'manual',
      meeting_id: d.meeting_id ?? null,
      position: d.position ?? docs.length * 1000 + 1000,
      created_by: d.created_by ?? users.cesar.id,
      updated_by: d.created_by ?? users.cesar.id,
      created_at: d.created_at ?? ago(24 * 6),
      updated_at: d.updated_at ?? ago(24 * 2),
      archived_at: null,
    }
    docs.push(row)
    return row
  }

  // Promoting
  mkDoc({
    workspace: pro,
    title: 'Bienvenida a Veltro',
    updated_at: ago(24 * 9),
    content: [
      p('Este espacio reúne las tareas, los docs y las reuniones de Promoting. Escribe / para insertar bloques.'),
      h(2, 'Cómo se conecta todo'),
      li([{ t: 'Reuniones: ', b: true }, 'en Hoy o en Calendario toca Tomar notas y se crea un doc con fecha y asistentes.']),
      li([{ t: 'Acuerdos en tareas: ', b: true }, 'escribe una checklist y usa Convertir checklist en tareas.']),
      li([{ t: 'Sesiones de Claude: ', b: true }, 'importa el Markdown o crea un token en Ajustes, API y Claude.']),
      h(2, 'Atajos'),
      li([{ t: 'C', code: true }, ' crea una tarea desde cualquier pantalla']),
      li([{ t: '⌘K', code: true }, ' busca tareas, docs y espacios']),
    ],
  })

  const brief = mkDoc({
    workspace: pro,
    title: 'Brief: promociones Q4',
    created_by: users.ana.id,
    updated_at: ago(5),
    content: [
      h(2, 'Objetivo'),
      p('Aumentar 18% el sell-out de las marcas del consorcio entre octubre y diciembre con activaciones en 120 puntos de venta.'),
      h(2, 'Mensajes clave'),
      li('Precio especial por volumen en cadenas'),
      li('Degustaciones de fin de semana en Caracas, Valencia y Maracaibo'),
      li('Material POP renovado para cabeceras de góndola'),
      h(2, 'Indicadores'),
      ol('Sell-out semanal por cadena'),
      ol('Cobertura de exhibición (meta 85%)'),
      ol('Costo por activación'),
      quote('Prioridad: cerrar presupuesto de POP antes del kickoff del jueves.'),
    ],
  })
  mkDoc({
    workspace: pro,
    parent_id: brief.id,
    title: 'Cronograma Q4',
    created_by: users.ana.id,
    updated_at: ago(30),
    content: [
      h(3, 'Octubre'),
      check('Kickoff con todo el equipo', false),
      check('Aprobación de presupuesto POP', false),
      h(3, 'Noviembre'),
      check('Activaciones en Caracas (4 fines de semana)', false),
      check('Primera medición de sell-out', false),
      h(3, 'Diciembre'),
      check('Campaña navideña en cadenas', false),
      check('Informe de cierre de temporada', false),
    ],
  })
  mkDoc({
    workspace: pro,
    parent_id: brief.id,
    title: 'Proveedores y costos',
    updated_at: ago(50),
    content: [
      p('Comparativa de proveedores de material POP e impulso.'),
      li([{ t: 'Gráficas Unidas: ', b: true }, 'mejor precio en vinil, entrega en 10 días.']),
      li([{ t: 'Display Pro: ', b: true }, 'stands de cartón, mínimo 200 unidades.']),
      li([{ t: 'Talento BTL: ', b: true }, 'impulsadoras, tarifa por jornada de 8 horas.']),
    ],
  })

  const dailyDoc = mkDoc({
    workspace: pro,
    title: evDaily.title,
    source: 'meeting',
    meeting_id: mDaily.id,
    created_at: evDaily.start,
    updated_at: evDaily.end,
    content: [
      p([{ t: 'Fecha: ', b: true }, when(evDaily)]),
      p([{ t: 'Asistentes: ', b: true }, names(evDaily)]),
      h(2, 'Notas'),
      li('Pepito confirmó 6 impulsadoras para el sábado, faltan 2 para Valencia.'),
      li('Ana espera la cotización final de Gráficas Unidas.'),
      li('Bloqueo: el tablero de KPIs no recibe datos de la cadena desde el lunes.'),
      h(2, 'Acuerdos y próximos pasos'),
      check('Confirmar logística de impulsadoras para el fin de semana'),
      check('Cerrar presupuesto de material POP'),
      check('Pedir acceso al portal de datos de la cadena'),
    ],
  })

  mkDoc({
    workspace: pro,
    title: evKickoff.title,
    source: 'meeting',
    meeting_id: mKickoff.id,
    created_at: ago(3),
    updated_at: ago(3),
    content: [
      p([{ t: 'Fecha: ', b: true }, when(evKickoff)]),
      p([{ t: 'Asistentes: ', b: true }, names(evKickoff)]),
      h(2, 'Agenda'),
      li('Presentación del brief Q4 (Ana, 15 min)'),
      li('Presupuesto y proveedores (Cesar, 15 min)'),
      li('Cronograma por ciudad (Pepito, 15 min)'),
      li('Preguntas y responsables'),
      h(2, 'Notas'),
      p(),
      h(2, 'Acuerdos y próximos pasos'),
      check(''),
    ],
  })

  mkDoc({
    workspace: pro,
    title: 'Manual para impulsadoras',
    created_by: users.pepito.id,
    updated_at: ago(24 * 4),
    content: [
      h(2, 'Antes de la jornada'),
      li('Llegar 30 minutos antes y reportar ubicación por WhatsApp'),
      li('Verificar inventario de muestras y material POP'),
      h(2, 'Durante la jornada'),
      li('Registrar degustaciones por hora en el formulario'),
      li('Tomar 3 fotos de la exhibición (inicio, mitad, cierre)'),
      h(2, 'Cierre'),
      li('Enviar reporte y fotos antes de las 7 pm'),
    ],
  })

  // Trade Marketing
  const polarDoc = mkDoc({
    workspace: tm,
    title: evPolar.title,
    source: 'meeting',
    meeting_id: mPolar.id,
    created_by: users.lucia.id,
    created_at: evPolar.start,
    updated_at: evPolar.end,
    content: [
      p([{ t: 'Fecha: ', b: true }, when(evPolar)]),
      p([{ t: 'Asistentes: ', b: true }, names(evPolar)]),
      h(2, 'Agenda'),
      li('Resultados de la activación de septiembre'),
      li('Exhibiciones en cadenas'),
      li('Próximos pasos'),
      h(2, 'Notas'),
      p('María destacó el crecimiento de 12% en Farmatodo. José pidió más visibilidad en cabeceras y fotos semanales de las exhibiciones.'),
      quote('Polar quiere evaluar renovación del contrato en noviembre con base en estos resultados.'),
      h(2, 'Acuerdos y próximos pasos'),
      check('Enviar fotos de exhibiciones a cliente'),
      check('Seguimiento de acuerdos con Polar'),
      check('Preparar propuesta de cabeceras para noviembre'),
    ],
  })
  mkDoc({
    workspace: tm,
    title: 'Mapa de tiendas prioritarias',
    created_by: users.lucia.id,
    updated_at: ago(24 * 3),
    content: [
      p('Tiendas con mayor rotación y cobertura objetivo para Q4.'),
      h(3, 'Caracas'),
      li('Farmatodo Las Mercedes, Chacao, El Cafetal'),
      li('Central Madeirense La Trinidad'),
      h(3, 'Valencia'),
      li('Farmatodo Prebo, Unicentro El Viñedo'),
      h(3, 'Maracaibo'),
      li('Gama Express Delicias'),
    ],
  })
  mkDoc({
    workspace: tm,
    title: 'Política de exhibición en punto de venta',
    source: 'import',
    created_by: users.ana.id,
    updated_at: ago(24 * 12),
    import_markdown:
      '## Principios\n\n1. El producto principal siempre a la altura de los ojos.\n2. Mínimo 3 frentes por SKU en cadenas grandes.\n3. Material POP limpio y sin precios desactualizados.\n\n## Auditoría\n\n- Frecuencia: quincenal\n- Evidencia: 3 fotos por tienda\n- Responsable: mercaderista asignado\n\n> Cualquier excepción la aprueba Trade Marketing por escrito.',
    content_text: 'Principios Auditoría exhibición frentes POP mercaderista',
  })

  // Tech Ve
  const claudeAuth = mkDoc({
    workspace: tv,
    title: 'Sesión con Claude: migración de auth a Supabase',
    source: 'claude',
    created_by: users.diego.id,
    created_at: ago(26),
    updated_at: ago(26),
    import_markdown: `Resumen de la sesión de trabajo con Claude Code sobre el módulo de autenticación.

## Qué hicimos

- Reemplazamos el login propio por **Supabase Auth** con \`@supabase/ssr\`.
- El middleware ahora usa \`getUser()\` para validar el JWT y refrescar la sesión.
- Eliminamos los workarounds con \`SECURITY DEFINER\` que existían porque \`auth.uid()\` llegaba nulo: el problema era el cliente del servidor sin cookies.

## Decisiones

1. Las sesiones viven en cookies httpOnly manejadas por \`@supabase/ssr\`.
2. Toda autorización se resuelve con RLS, nunca solo en el frontend.
3. Los usuarios creados por un admin reciben contraseña temporal y deben cambiarla.

## Código clave

\`\`\`ts
const { data: { user } } = await supabase.auth.getUser()
if (!user && !isPublic(pathname)) return NextResponse.redirect('/login')
\`\`\`

## Próximos pasos

- [ ] Agregar login con Google
- [ ] Tests de integración del flujo de invitación
- [x] Documentar variables de entorno`,
    content_text: 'Supabase Auth getUser middleware RLS SECURITY DEFINER sesión Claude',
  })
  const claudeRls = mkDoc({
    workspace: tv,
    title: 'Sesión con Claude: auditoría de políticas RLS',
    source: 'claude',
    created_by: users.cesar.id,
    created_at: ago(7),
    updated_at: ago(7),
    import_markdown: `Revisión de las políticas de Row Level Security del esquema v2.

## Hallazgos

| Tabla | Estado | Nota |
| --- | --- | --- |
| tasks | OK | Lectura por espacio, escritura solo editores |
| docs | OK | Árbol validado contra ciclos |
| google_connections | OK | Sin políticas: solo service_role |
| profiles | Revisar | Visible para quien comparte cuenta |

## Recomendaciones

1. Usar \`my_workspace_ids()\` en las políticas para evaluar una vez por query.
2. Restringir \`workspace_role_for\` a service_role.
3. Agregar tests de RLS con usuarios simulados en CI.

## Próximos pasos

- [ ] Script de pruebas RLS en CI
- [ ] Revisar índices de tasks por assignee`,
    content_text: 'RLS políticas my_workspace_ids workspace_role_for service_role auditoría Claude',
  })
  const demoDoc = mkDoc({
    workspace: tv,
    title: evDemo.title,
    source: 'meeting',
    meeting_id: mDemo.id,
    created_by: users.diego.id,
    created_at: evDemo.start,
    updated_at: evDemo.end,
    content: [
      p([{ t: 'Fecha: ', b: true }, when(evDemo)]),
      p([{ t: 'Asistentes: ', b: true }, names(evDemo)]),
      h(2, 'Notas'),
      li('Diego mostró el dashboard con datos de prueba de 3 cadenas.'),
      li('Ana pidió filtrar por ciudad y exportar a Excel.'),
      li('La exportación falla con más de 5.000 filas.'),
      h(2, 'Acuerdos y próximos pasos'),
      check('Corregir error en exportación a Excel'),
      check('Agregar filtro por ciudad', true),
    ],
  })
  const arch = mkDoc({
    workspace: tv,
    title: 'Arquitectura de Veltro v2',
    updated_at: ago(2),
    content: [
      p('Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind v4 + Base UI.'),
      h(2, 'Modelo'),
      li('Cuenta → Espacios → Miembros (plan con límites en la tabla plans)'),
      li('Cada espacio tiene tareas, docs y reuniones enlazadas a Google Calendar'),
      h(2, 'Principios'),
      ol('RLS es la frontera de seguridad'),
      ol('Lecturas y escrituras desde el cliente con React Query y updates optimistas'),
      ol('Server Actions solo para operaciones privilegiadas'),
      code('sql', 'create policy tasks_select on public.tasks for select to authenticated\n  using (workspace_id in (select public.my_workspace_ids()));'),
    ],
  })
  mkDoc({
    workspace: tv,
    parent_id: arch.id,
    title: 'Decisiones técnicas',
    updated_at: ago(24 * 2),
    content: [
      h(3, 'ADR-001: Campos fijos en tareas'),
      p('Estado, prioridad, responsable, fecha y etiquetas son columnas reales en lugar de columnas configurables tipo EAV. Permite filtros, calendario y "Mis tareas" sin joins complejos.'),
      h(3, 'ADR-002: Editor por bloques'),
      p('BlockNote sobre ProseMirror. Guardamos JSON de bloques y texto plano para búsqueda.'),
    ],
  })

  // ---------- tareas ----------
  const tasks: Row[] = []
  const seq: Record<string, number> = {}
  const mkTask = (
    ws: Row,
    title: string,
    o: Partial<{
      status: string
      priority: string
      assignee: string | null
      /** varios responsables (el primero queda también en assignee_id) */
      assignees: string[]
      due: number | null
      labels: string[]
      doc: Row
      meeting: Row
      parent: Row
      created: number
      by: string
      description: Row[]
      start: number
      estimate: number
      custom: Record<string, string | number>
      statusId: string
    }> = {},
  ) => {
    seq[ws.id as string] = (seq[ws.id as string] ?? 0) + 1
    const own = (ws.task_statuses as { id: string; category: string }[] | undefined) ?? []
    const statusId = own.length ? (o.statusId ?? own.find((x) => x.category === (o.status ?? 'todo'))?.id ?? null) : null
    const status = statusId ? own.find((x) => x.id === statusId)!.category : (o.status ?? 'todo')
    const created = ago(o.created ?? 24 * 5)
    const single = o.assignee === undefined ? users.cesar.id : o.assignee
    const assignees = o.assignees ?? (single ? [single] : [])
    const row: Row = {
      id: id(),
      workspace_id: ws.id,
      number: seq[ws.id as string],
      title,
      description: o.description ?? null,
      description_text: o.description ? textOf(o.description) : '',
      status,
      status_id: statusId,
      priority: o.priority ?? 'none',
      assignee_id: assignees[0] ?? null,
      assignee_ids: assignees,
      due_date: o.due == null ? null : day(o.due),
      start_date: o.start == null ? null : day(o.start),
      estimate_hours: o.estimate ?? null,
      custom: o.custom ?? {},
      labels: o.labels ?? [],
      position: (seq[ws.id as string] ?? 0) * 1000,
      parent_id: o.parent?.id ?? null,
      doc_id: o.doc?.id ?? null,
      doc_block_id: null,
      meeting_id: o.meeting?.id ?? null,
      created_by: o.by ?? users.cesar.id,
      completed_at: status === 'done' ? ago(20 + tasks.length) : null,
      created_at: created,
      updated_at: created,
    }
    tasks.push(row)
    return row
  }

  const { ana, pepito, lucia, diego, cesar } = users

  // Promoting
  const polarProp = mkTask(pro, 'Enviar propuesta de activación a Polar', {
    status: 'in_progress',
    priority: 'high',
    due: 0,
    start: -3,
    estimate: 6,
    custom: { f_cliente: 'Polar', f_presupuesto: 18500 },
    labels: ['cliente', 'propuesta'],
    description: [
      p('Propuesta para 40 activaciones en Farmatodo y Central Madeirense durante noviembre.'),
      li('Incluir costos por jornada y material POP'),
      li('Adjuntar resultados de septiembre como referencia'),
    ],
  })
  mkTask(pro, 'Armar presentación de la propuesta', { parent: polarProp, status: 'done' })
  mkTask(pro, 'Calcular costos por ciudad', { parent: polarProp, status: 'in_progress', due: 0 })
  mkTask(pro, 'Revisar con Ana antes de enviar', { parent: polarProp, assignee: ana.id })
  mkTask(pro, 'Cerrar presupuesto de material POP', { priority: 'urgent', assignee: ana.id, due: -2, start: -6, estimate: 3, custom: { f_cliente: 'Interno', f_presupuesto: 4500 }, labels: ['presupuesto'], doc: dailyDoc, meeting: mDaily })
  mkTask(pro, 'Confirmar logística de impulsadoras para el fin de semana', { priority: 'high', assignee: pepito.id, due: 1, doc: dailyDoc, meeting: mDaily })
  mkTask(pro, 'Actualizar tablero de KPIs de campaña', { status: 'blocked', priority: 'medium', due: 3, labels: ['reporte'] })
  mkTask(pro, 'Definir calendario de promociones Q4', { status: 'in_progress', priority: 'high', assignees: [ana.id, cesar.id], due: 4, start: -1, estimate: 8, doc: brief })
  mkTask(pro, 'Preparar reporte mensual para la gerencia', { priority: 'medium', due: 6, labels: ['reporte'] })
  mkTask(pro, 'Validar artes finales con diseño', { assignee: diego.id, due: 2 })
  mkTask(pro, 'Revisar contrato con agencia de BTL', { status: 'backlog', priority: 'low', assignee: null })
  mkTask(pro, 'Analizar métricas de redes sociales', { status: 'backlog', assignee: null, labels: ['digital'] })
  mkTask(pro, 'Onboarding de nuevas impulsadoras', { status: 'done', priority: 'medium', assignee: pepito.id, due: -1 })
  mkTask(pro, 'Cotizar stands para la feria de noviembre', { status: 'done', priority: 'low', due: -3 })
  // sin responsable y con fecha: se reparten desde el calendario o desde Tareas
  mkTask(pro, 'Coordinar muestras para degustación en Farmatodo', { priority: 'medium', assignee: null, due: 2, labels: ['activación'] })

  // Trade Marketing
  mkTask(tm, 'Planograma para cadena Farmatodo', { status: 'in_progress', priority: 'high', assignees: [lucia.id, pepito.id], due: 2, start: -2, estimate: 10, custom: { f_cadena: 'Farmatodo', f_tiendas: 24 }, labels: ['retail'], by: lucia.id })
  mkTask(tm, 'Auditoría de exhibiciones en 20 tiendas', { priority: 'medium', assignee: pepito.id, due: 5, start: 1, estimate: 16, custom: { f_cadena: 'Central Madeirense', f_tiendas: 20 }, labels: ['retail'] })
  mkTask(tm, 'Negociar espacios en cabecera de góndola', { status: 'blocked', priority: 'urgent', due: -1, labels: ['negociación'] })
  mkTask(tm, 'Seguimiento de acuerdos con Polar', { priority: 'high', due: 0, doc: polarDoc, meeting: mPolar, labels: ['cliente'] })
  mkTask(tm, 'Enviar fotos de exhibiciones a cliente', { priority: 'medium', assignee: pepito.id, due: 1, estimate: 1, custom: { f_cadena: 'Farmatodo', f_tiendas: 6 }, doc: polarDoc, meeting: mPolar })
  mkTask(tm, 'Kit de material para vendedores', { priority: 'low', assignee: lucia.id, due: 9 })
  mkTask(tm, 'Capacitación de mercaderistas', { status: 'backlog', assignee: null })
  mkTask(tm, 'Encuesta de satisfacción en punto de venta', { status: 'backlog', priority: 'low', assignee: lucia.id })
  mkTask(tm, 'Reporte de sell-out de septiembre', { status: 'done', priority: 'medium', assignee: lucia.id, due: -4 })
  mkTask(tm, 'Relevar precios de la competencia', { priority: 'high', assignee: null, due: 1, labels: ['retail'] })

  // Tech Ve
  mkTask(tv, 'Migrar autenticación a Supabase', { status: 'in_progress', priority: 'high', assignees: [diego.id, cesar.id], due: 2, start: -4, estimate: 12, custom: { f_repo: 'https://example.com/veltro/app', f_sprint: 'Sprint 14' }, labels: ['backend'], doc: claudeAuth })
  mkTask(tv, 'Integrar Google Calendar en Veltro', { status: 'in_progress', statusId: 's_review', priority: 'high', due: 0, start: -2, estimate: 8, custom: { f_sprint: 'Sprint 14' }, labels: ['integración'] })
  mkTask(tv, 'Corregir error en exportación a Excel', { status: 'blocked', priority: 'urgent', assignee: diego.id, due: -1, estimate: 4, custom: { f_sprint: 'Sprint 14' }, labels: ['bug'], doc: demoDoc, meeting: mDemo })
  mkTask(tv, 'Revisión de seguridad de RLS', { priority: 'high', assignee: diego.id, due: 3, labels: ['seguridad'], doc: claudeRls })
  mkTask(tv, 'Dashboard de campañas en tiempo real', { priority: 'high', due: 7, labels: ['frontend'] })
  mkTask(tv, 'Definir modelo de datos de inventario', { priority: 'medium', due: 4 })
  mkTask(tv, 'Configurar CI con tests de integración', { status: 'backlog', priority: 'medium', assignee: diego.id })
  mkTask(tv, 'Documentar API de pedidos', { status: 'done', priority: 'low', assignee: diego.id })
  mkTask(tv, 'Actualizar dependencias de Next.js', { status: 'done', priority: 'low', due: -2 })
  mkTask(tv, 'Preparar ambiente de pruebas para el cliente', { priority: 'medium', assignee: null, due: 3 })

  for (const ws of workspaces) ws.task_seq = seq[ws.id] ?? 0

  const byTitle = (t: string) => tasks.find((x) => x.title === t)!

  // ---------- ítems de reunión (agenda, notas, decisiones, acciones, preguntas) ----------
  const meeting_items: Row[] = []
  const mkItem = (
    m: Row,
    kind: 'agenda' | 'note' | 'decision' | 'action' | 'question',
    text: string,
    o: Partial<{ assignee: string; due: number; task: Row; done: boolean; source: 'manual' | 'assistant' | 'carry'; by: string }> = {},
  ) => {
    const at = iso(new Date(new Date(m.starts_at as string).getTime() + meeting_items.length * 45_000))
    meeting_items.push({
      id: id(),
      meeting_id: m.id,
      workspace_id: m.workspace_id,
      kind,
      text,
      assignee_id: o.assignee ?? null,
      due_date: o.due == null ? null : day(o.due),
      task_id: o.task?.id ?? null,
      done: o.done ?? false,
      source: o.source ?? 'manual',
      position: meeting_items.length * 1000,
      created_by: o.by ?? users.cesar.id,
      created_at: at,
      updated_at: at,
    })
  }

  // Daily (cerrada)
  mkItem(mDaily, 'note', 'Pepito confirmó 6 impulsadoras para el sábado, faltan 2 para Valencia.', { by: pepito.id })
  mkItem(mDaily, 'note', 'El tablero de KPIs no recibe datos de la cadena desde el lunes.')
  mkItem(mDaily, 'action', 'Cerrar presupuesto de material POP', { assignee: ana.id, due: -2, task: byTitle('Cerrar presupuesto de material POP') })
  mkItem(mDaily, 'action', 'Confirmar logística de impulsadoras para el fin de semana', { assignee: pepito.id, due: 1, task: byTitle('Confirmar logística de impulsadoras para el fin de semana') })
  mkItem(mDaily, 'question', '¿Quién cubre Valencia si no aparecen las 2 impulsadoras?')

  // Polar (cerrada)
  mkItem(mPolar, 'agenda', 'Resultados de la activación de septiembre', { done: true })
  mkItem(mPolar, 'agenda', 'Exhibiciones en cadenas', { done: true })
  mkItem(mPolar, 'note', 'María destacó +12% en Farmatodo. José pidió más visibilidad en cabeceras.', { by: lucia.id })
  mkItem(mPolar, 'decision', 'Polar evalúa renovar el contrato en noviembre según resultados de Q4', { by: lucia.id })
  mkItem(mPolar, 'decision', 'Enviar fotos semanales de exhibiciones al cliente', { by: lucia.id })
  mkItem(mPolar, 'action', 'Seguimiento de acuerdos con Polar', { assignee: cesar.id, due: 0, task: byTitle('Seguimiento de acuerdos con Polar') })
  mkItem(mPolar, 'action', 'Enviar fotos de exhibiciones a cliente', { assignee: pepito.id, due: 1, task: byTitle('Enviar fotos de exhibiciones a cliente') })
  mkItem(mPolar, 'question', '¿Polar acepta compartir la cabecera de góndola con otra marca?')

  // Demo Tech Ve (sin cerrar)
  mkItem(mDemo, 'note', 'Diego mostró el dashboard con datos de 3 cadenas. Ana pidió filtro por ciudad.', { by: diego.id })
  mkItem(mDemo, 'decision', 'Exportar a Excel por lotes de 5.000 filas', { by: diego.id })
  mkItem(mDemo, 'action', 'Corregir error en exportación a Excel', { assignee: diego.id, due: -1, task: byTitle('Corregir error en exportación a Excel') })
  mkItem(mDemo, 'action', 'Agregar filtro por ciudad al dashboard')

  // Presupuesto POP (cerrada hoy)
  mkItem(mBudget, 'decision', 'Tope de presupuesto POP: 4.500 USD')
  mkItem(mBudget, 'decision', 'Pedir una tercera cotización antes de cerrar')
  mkItem(mBudget, 'action', 'Cerrar presupuesto de material POP', { assignee: ana.id, due: -2, task: byTitle('Cerrar presupuesto de material POP') })

  // Revisión rápida de pendientes (en curso)
  mkItem(mLive, 'agenda', 'PRO-5 Cerrar presupuesto de material POP', { done: true, source: 'assistant', task: byTitle('Cerrar presupuesto de material POP') })
  mkItem(mLive, 'agenda', 'PRO-1 Enviar propuesta de activación a Polar', { source: 'assistant', task: byTitle('Enviar propuesta de activación a Polar') })
  mkItem(mLive, 'agenda', 'PRO-8 Definir calendario de promociones Q4', { source: 'assistant', task: byTitle('Definir calendario de promociones Q4') })
  mkItem(mLive, 'action', 'Ana cierra hoy el presupuesto POP con esa cotización', { assignee: ana.id, due: 0, task: byTitle('Cerrar presupuesto de material POP') })
  mkItem(mLive, 'decision', 'Se aprueba la cotización POP si incluye la instalación')
  mkItem(mLive, 'note', 'Cotización nueva del proveedor POP: 4.380 USD, dentro del tope.')
  mkItem(mLive, 'decision', 'Priorizar Farmatodo en noviembre')
  mkItem(mLive, 'question', '¿Les mostramos a Polar los costos por ciudad o solo el total?')

  // ---------- adjuntos (archivos y links) ----------
  const attachments: Row[] = []
  const files: Record<string, string> = {}
  type FileOpts = Partial<{ task: Row; meeting: Row; doc: Row; by: string; hours: number; title: string; labels: string[] }>
  const mkFile = (ws: Row | null, name: string, mime: string, dataUrl: string, o: FileOpts = {}) => {
    const path = `${ws?.id ?? account.id}/${id()}-${name}`
    files[path] = dataUrl
    attachments.push({
      id: id(),
      account_id: account.id,
      workspace_id: ws?.id ?? null,
      title: o.title ?? null,
      labels: o.labels ?? [],
      task_id: o.task?.id ?? null,
      meeting_id: o.meeting?.id ?? null,
      doc_id: o.doc?.id ?? null,
      kind: 'file',
      name,
      storage_path: path,
      url: null,
      mime_type: mime,
      size_bytes: Math.round((dataUrl.length * 3) / 4),
      uploaded_by: o.by ?? users.cesar.id,
      created_at: ago(o.hours ?? 24),
    })
  }
  const mkLink = (ws: Row | null, name: string, url: string, o: FileOpts = {}) => {
    attachments.push({
      id: id(),
      account_id: account.id,
      workspace_id: ws?.id ?? null,
      title: o.title ?? null,
      labels: o.labels ?? [],
      task_id: o.task?.id ?? null,
      meeting_id: o.meeting?.id ?? null,
      doc_id: o.doc?.id ?? null,
      kind: 'link',
      name,
      storage_path: null,
      url,
      mime_type: null,
      size_bytes: null,
      uploaded_by: o.by ?? users.cesar.id,
      created_at: ago(o.hours ?? 24),
    })
  }

  const popTask = byTitle('Cerrar presupuesto de material POP')
  mkFile(pro, 'cotizacion-graficas-unidas.pdf', 'application/pdf', pdfDataUrl('Cotización material POP', ['Gráficas Unidas', 'Vinil y cabeceras: 4.380 USD', 'Entrega: 10 días hábiles']), { task: popTask, meeting: mBudget, by: ana.id, hours: 3, title: 'Cotización Gráficas Unidas', labels: ['cotización', 'POP'] })
  mkFile(pro, 'cotizacion-display-pro.pdf', 'application/pdf', pdfDataUrl('Cotización stands de cartón', ['Display Pro', 'Mínimo 200 unidades', 'Total: 4.950 USD']), { task: popTask, meeting: mBudget, by: ana.id, hours: 3, title: 'Cotización Display Pro', labels: ['cotización', 'POP'] })
  mkFile(pro, 'propuesta-activacion-polar.pdf', 'application/pdf', pdfDataUrl('Propuesta de activación Polar', ['40 activaciones en noviembre', 'Farmatodo y Central Madeirense', 'Inversión: 18.500 USD']), { task: polarProp, hours: 20, title: 'Propuesta de activación Polar', labels: ['cliente', 'propuesta'] })
  mkLink(pro, 'Presentación para Polar (Google Slides)', 'https://docs.google.com/presentation/', { task: polarProp, hours: 18, labels: ['cliente', 'propuesta'] })
  mkFile(pro, 'manual-de-marca-2026.pdf', 'application/pdf', pdfDataUrl('Manual de marca 2026', ['Uso del logo', 'Colores y tipografía', 'Material POP']), { by: ana.id, hours: 24 * 8, title: 'Manual de marca 2026', labels: ['marca'] })

  const photosTask = byTitle('Enviar fotos de exhibiciones a cliente')
  mkFile(tm, 'exhibicion-farmatodo-las-mercedes.svg', 'image/svg+xml', photoDataUrl('Farmatodo Las Mercedes', '#6c47ff'), { meeting: mPolar, task: photosTask, by: pepito.id, hours: 50, title: 'Exhibición Farmatodo Las Mercedes', labels: ['fotos', 'retail'] })
  mkFile(tm, 'exhibicion-farmatodo-chacao.svg', 'image/svg+xml', photoDataUrl('Farmatodo Chacao', '#ff8a3d'), { meeting: mPolar, task: photosTask, by: pepito.id, hours: 50, title: 'Exhibición Farmatodo Chacao', labels: ['fotos', 'retail'] })
  mkFile(tm, 'sell-out-septiembre.csv', 'text/csv', csvDataUrl(), { meeting: mPolar, by: lucia.id, hours: 52, title: 'Sell-out de septiembre', labels: ['reporte', 'retail'] })

  mkLink(tv, 'Google Calendar API: guía', 'https://developers.google.com/calendar/api/guides/overview', { task: byTitle('Integrar Google Calendar en Veltro'), hours: 30 })
  mkLink(tv, 'Diseño del dashboard (Figma)', 'https://www.figma.com/', { meeting: mDemo, by: diego.id, hours: 60 })
  mkFile(tv, 'error-exportacion-5000-filas.log', 'text/plain', textDataUrl('Error: heap out of memory\nat exportWorkbook (export.ts:88)\nfilas: 5214'), { task: byTitle('Corregir error en exportación a Excel'), meeting: mDemo, by: diego.id, hours: 58 })

  // sueltos en la bóveda: no cuelgan de ningún espacio
  for (const f of LOOSE_FILES(account.id)) {
    files[f.storage_path] = f.dataUrl
    attachments.push({ ...f.row, id: id(), uploaded_by: f.by === 'ana' ? ana.id : f.by === 'lucia' ? lucia.id : cesar.id, created_at: ago(f.hours) })
  }

  // Kickoff Q4 (por preparar)
  mkItem(mKickoff, 'agenda', 'Presentación del brief Q4 (Ana, 15 min)')
  mkItem(mKickoff, 'agenda', 'Presupuesto y proveedores (Cesar, 15 min)')
  mkItem(mKickoff, 'agenda', 'Cronograma por ciudad (Pepito, 15 min)')

  const task_comments = [
    { task: polarProp, user: ana.id, body: 'Agrega el caso de Farmatodo, es el más fuerte para convencerlos.', hours: 20 },
    { task: polarProp, user: cesar.id, body: 'Listo, ya está en la lámina 4. Te la paso antes de mediodía.', hours: 18 },
    { task: byTitle('Negociar espacios en cabecera de góndola'), user: lucia.id, body: 'El gerente regional sigue de vacaciones, retomamos el lunes.', hours: 30 },
    { task: byTitle('Corregir error en exportación a Excel'), user: diego.id, body: 'Es un límite de memoria en el worker. Pruebo exportar por lotes.', hours: 6 },
  ].map((c) => ({
    id: id(),
    task_id: c.task.id,
    workspace_id: c.task.workspace_id,
    user_id: c.user,
    body: c.body,
    created_at: ago(c.hours),
    updated_at: ago(c.hours),
  }))

  const built: DemoStore = {
    version: SEED_VERSION,
    anchor: anchor.toISOString(),
    tables: {
      plans: [{ id: 'free', name: 'Free', max_workspaces: 5, max_members: 10, is_default: true, created_at: iso(subDays(anchor, 60)) }],
      profiles,
      accounts: [account],
      account_members,
      departments,
      workspaces,
      workspace_members,
      meetings,
      meeting_items,
      docs,
      tasks,
      task_comments,
      attachments,
      google_connections: [
        {
          user_id: users.cesar.id,
          google_email: users.cesar.email,
          refresh_token: 'demo',
          access_token: null,
          access_token_expires_at: null,
          scopes: [],
          selected_calendar_ids: ['primary', 'team'],
          created_at: iso(subDays(anchor, 20)),
          updated_at: iso(subDays(anchor, 20)),
        },
      ],
      api_tokens: [],
      chats: [],
      chat_members: [],
      chat_messages: [],
    },
    events: [],
    files,
  }
  seedChats(built, anchor)
  return built
}

/** Archivos sueltos de la bóveda (sin espacio). También los usa la migración de datos ya guardados. */
export function LOOSE_FILES(accountId: string) {
  const mk = (name: string, mime: string, dataUrl: string, o: { title: string; labels: string[]; by: 'cesar' | 'ana' | 'lucia'; hours: number }) => {
    const storage_path = `${accountId}/vault-${name}`
    return {
      storage_path,
      dataUrl,
      by: o.by,
      hours: o.hours,
      row: {
        account_id: accountId,
        workspace_id: null,
        task_id: null,
        meeting_id: null,
        doc_id: null,
        kind: 'file',
        name,
        title: o.title,
        labels: o.labels,
        storage_path,
        url: null,
        mime_type: mime,
        size_bytes: Math.round((dataUrl.length * 3) / 4),
      },
    }
  }
  return [
    mk('contrato-marco-polar-2026.pdf', 'application/pdf', pdfDataUrl('Contrato marco Polar 2026', ['Vigencia: enero a diciembre 2026', 'Activaciones y material POP', 'Pago a 30 días']), {
      title: 'Contrato marco con Polar 2026',
      labels: ['contrato', 'legal', 'cliente'],
      by: 'cesar',
      hours: 24 * 12,
    }),
    mk('tarifario-proveedores-2026.csv', 'text/csv', textDataUrl('proveedor,servicio,precio_usd\nGráficas Unidas,Vinil por m2,18\nDisplay Pro,Stand de cartón,24\nImpulso VE,Impulsadora por jornada,35'), {
      title: 'Tarifario de proveedores 2026',
      labels: ['proveedores', 'precios'],
      by: 'ana',
      hours: 24 * 5,
    }),
    mk('logo-consorcio.svg', 'image/svg+xml', photoDataUrl('Consorcio Promoting', '#1a3a2e'), { title: 'Logo del consorcio', labels: ['marca'], by: 'cesar', hours: 24 * 20 }),
    mk('politica-de-viaticos.pdf', 'application/pdf', pdfDataUrl('Política de viáticos', ['Tope diario: 40 USD', 'Comprobantes en 5 días', 'Aprobación del jefe directo']), {
      title: 'Política de viáticos',
      labels: ['rrhh', 'legal'],
      by: 'lucia',
      hours: 24 * 30,
    }),
  ]
}

// ---------- archivos de ejemplo (contenido real y descargable) ----------

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')

function pdfDataUrl(title: string, lines: string[]) {
  const esc = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[()\\]/g, '\\$&')
  const content = [
    'BT /F1 22 Tf 72 740 Td (' + esc(title) + ') Tj ET',
    ...lines.map((l, i) => `BT /F1 13 Tf 72 ${700 - i * 22} Td (${esc(l)}) Tj ET`),
    'BT /F1 9 Tf 72 72 Td (Documento de ejemplo generado por el modo demo de Veltro) Tj ET',
  ].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return `data:application/pdf;base64,${b64(pdf)}`
}

function photoDataUrl(label: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#efecf5"/><rect x="40" y="60" width="560" height="300" rx="10" fill="#ffffff" stroke="#e7e3f0"/>${[0, 1, 2, 3]
    .map((r) => [0, 1, 2, 3, 4, 5].map((c) => `<rect x="${70 + c * 85}" y="${85 + r * 68}" width="60" height="48" rx="6" fill="${(r + c) % 3 === 0 ? accent : '#d9d3ea'}"/>`).join(''))
    .join('')}<text x="40" y="395" font-family="Helvetica, Arial" font-size="18" fill="#17141f">${label}</text></svg>`
  return `data:image/svg+xml;base64,${b64(svg)}`
}

function csvDataUrl() {
  const csv = 'tienda,cadena,unidades,variacion\nLas Mercedes,Farmatodo,1240,+14%\nChacao,Farmatodo,980,+11%\nEl Cafetal,Farmatodo,860,+9%\nLa Trinidad,Central Madeirense,1105,+6%\n'
  return `data:text/csv;base64,${b64(csv)}`
}

function textDataUrl(text: string) {
  return `data:text/plain;base64,${b64(text)}`
}
