# Veltro: Project Context & Rules (v2)

> Fuente de verdad del proyecto. Toda persona o IA que trabaje en este repo debe leerlo antes de escribir código.

---

## 1. Qué es Veltro

Une **reuniones (Google Calendar)**, **documentación** y **tareas**, y modela el flujo que los conecta:
reunión o sesión con Claude → decisiones y acciones → tareas → hecho. No es un clon de Notion ni de Monday:
el centro es ese flujo.

Tres superficies principales:

| Superficie | Ruta | Idea |
|---|---|---|
| **Pulso** (inicio) | `/home` | Pantalla sin scroll: saludo + frase de alcance ("Viendo las tareas de… en…"), **Pregúntale a Veltro** como barra central (con botón para expandir a Veltro IA), contadores por categoría de estado (cada uno lleva a Mis tareas filtrado) y tres columnas, cada una con una línea que dice qué muestra: **Tus tareas** (vencidas, las que vencen hoy y las en curso, con los mismos nombres que los contadores), **Agenda** y **Pendientes de reuniones** (reuniones sin cerrar, preguntas sin respuesta y acciones sin responsable, que se asignan desde ahí). |
| **Veltro IA** | `/veltro` | El asistente a pantalla completa: conversaciones con repreguntas, respuestas con la lista de tareas (abren su panel), decisiones y docs enlazados, y sugerencias para seguir. Entiende "resume mi semana", bloqueos, vencidas, lo de hoy y lo de una persona (y combinaciones: "¿qué tiene Ana bloqueado?"); si no, busca en reuniones, decisiones, tareas y docs. Atajo `G` `V`. Las conversaciones se guardan en el navegador. |
| **Ciclo** (cada reunión) | `/m/[id]` | Sala de la reunión con fases **Preparar → En vivo → Cerrar**. Se capturan notas, decisiones (`<>`), acciones (`->`, `@persona`, "mañana") y preguntas (`??`). La **Salida** se arma sola; al cerrar, Veltro crea las tareas, escribe el resumen, redacta el correo de seguimiento y guarda el registro como doc. |
| **Mesa de control** | `/mesa` | Cómo van los espacios (vista de gerencia). Responde tres preguntas: **¿cómo va cada espacio?** (semáforo En orden / Atención / En riesgo: riesgo = alguna tarea con más de 3 días de atraso o 4+ vencidas y bloqueadas), **¿avanzamos?** (cerradas contra nuevas en el período, con mini columnas de cerradas por día o tramo) y **¿quién está sobrecargado?** (carga por persona: en riesgo · en curso · por hacer). Una fila por espacio con su detalle al expandir; filtros de rango de fechas y alcance. El rango usa `DateRangePicker` (`components/ui/date-range-picker.tsx`): atajos (Hoy, Ayer, Esta semana, Semana pasada, Últimos 7/30 días, Este mes) que se guardan como atajo y se recalculan cada día, o inicio y fin propios (escribibles o en un calendario de dos meses); el avance se grafica por día, semana o mes según el largo del rango. Lo del día vive en Pulso. Colores de gráfico `--chart-*` validados con la guía de dataviz. |

Vistas de soporte: Calendario semanal, **Tareas** (`/tasks`, antes Mis tareas: las de todos los espacios según el alcance, con vistas Resumen · Lista · Tabla · Tablero · Calendario (`?tab=`). Lista, Tabla, Tablero y Calendario comparten búsqueda y filtros (`components/tasks/task-filters.tsx`, lógica en `lib/task-filters.ts`): Estado, Vencimiento, Espacio, Responsable (si se mira a más de una persona), Prioridad y Etiquetas, cada uno de selección múltiple, con la cifra de cada opción contada con los demás filtros aplicados; viven en la URL (`?status=&due=&ws=&who=&prio=&label=`, repetibles; `?filter=` de Pulso se sigue aceptando) y se escriben con `history.replaceState`. La Lista además agrupa por vencimiento, estado, espacio, responsable o prioridad (`useTaskGroupsBy`, preferencia en `veltro:tasks-group`). Los grupos se abren y cierran de a uno, todos juntos (`CollapseAllButton`, también en la lista de cada espacio) o con Alt + clic; plegados muestran un resumen (`GroupSummary`: vencidas, bloqueadas, para hoy, en curso, la próxima fecha, personas y espacios). Mirando a toda la empresa también aparecen las tareas sin responsable, y el filtro de responsable tiene la opción "Sin asignar". **Bóveda** (`/vault`, G B; `/docs` redirige): todos los archivos y links de la cuenta (`components/vault/`). Cada uno puede tener título y etiquetas y vincularse (o no) a un espacio, una tarea o una reunión; grilla o lista, filtros de tipo, espacio, vínculo, etiquetas y quién lo subió, arrastrar y soltar para subir, y un panel de detalle donde todo se edita al momento y se comparte en Pasillo. La pestaña Escritos es la lista de documentos de los espacios (`DocsHub embedded`). **Pasillo** (`/chat`, G P, con contador de no leídos en el menú): mensajes directos y grupos de la cuenta (`components/chat/`, `lib/queries/chats.ts`). Se comparten tareas, archivos de la bóveda, documentos e invitaciones a reuniones (nuevas, creadas con el diálogo de reunión, o de tu calendario) como tarjetas; las invitaciones se responden en el chat (voy / tal vez / no voy). Desde la página de tarea y la bóveda, "Compartir en Pasillo" manda a uno o varios chats. Sin tiempo real todavía: se refresca cada pocos segundos. **Calendario**: filtros para mostrar reuniones y/o tareas, por espacio y por responsable (por defecto, mis tareas y las sin asignar); las tareas sin responsable se ven punteadas y al hacer clic abren una ficha (`calendar/task-peek.tsx`) para asignarlas al instante. **Página de tarea**: título y descripción a la izquierda, todas las propiedades en un panel a la derecha (en celular, entre el título y la descripción) y pestañas Subtareas · Comentarios · Adjuntos. **Recorrido de bienvenida** (`components/tour/tour.tsx`): sale solo la primera vez que alguien entra a Pulso (por persona y navegador, `veltro:tour:v1:<id>` en localStorage) y se repite desde el menú de la persona o ⌘K. Once pasos que iluminan la parte real de la app (anclas `data-tour="..."` en Pulso y en el menú, expandido y colapsado); si el ancla no está a la vista (celular) la tarjeta va abajo, sin foco. Un paso deja probar la notación con el mismo intérprete de la sala (`lib/capture.ts`). Registra `feature.tour_start/done/skipped` para la consola. **Idioma**: además de Ajustes, en el menú de la persona (submenú Idioma) y en ⌘K. El Resumen dice qué urge (frase con lo atrasado, bloqueado y de hoy + lista accionable), el ritmo (cerradas contra nuevas, 14 días), lo que viene (franja de calor de 2 semanas) y la carga por espacio y persona con `LoadBar` (`components/charts/load-bar.tsx`, compartido con Mesa); el tablero y el calendario aceptan tareas de varios espacios y la tabla multi-espacio es `TaskGrid`), y por espacio: Resumen, Tareas (lista, **tabla con todos los campos**, tablero, calendario), Docs (biblioteca de **documentos y archivos**) y Reuniones (calendario semanal del espacio).
La documentación de una **sesión con Claude** entra por *Importar Markdown* o por la API (`/api/v1/docs`).

**Stack:** Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · Base UI · BlockNote (editor) · Supabase (Postgres, Auth, Storage) · TanStack Query · next-intl · dnd-kit.

---

## 2. Modelo y reglas de negocio

```
Plan (free)  ─┐
              └─ Account (cuenta que paga, 1 dueño)
                   ├─ account_members (owner | admin | member)
                   └─ Workspaces ("espacios": proyectos / empresas)
                        ├─ workspace_members (admin | editor | viewer)
                        ├─ tasks ── task_comments, subtareas (parent_id)
                        ├─ docs (árbol por parent_id, bloques BlockNote)
                        └─ meetings (evento de Google Calendar enlazado; phase prep|live|closed; series_key)
                             └─ meeting_items (agenda | note | decision | action | question)
```

- **Adjuntos** (`attachments`): archivos (Storage, bucket privado `attachments`, ruta `{workspace_id}/…`) o links. Pueden pertenecer a una tarea, una reunión y/o un doc, o directamente al espacio. Una reunión produce tareas **y** adjuntos.
- **Campos de tareas:** fijos (estado, prioridad, responsable, inicio, entrega, estimación en horas, etiquetas) más **campos propios por espacio** (`workspaces.task_fields`: texto, número, fecha, opciones, link) cuyos valores viven en `tasks.custom`. Solo los admins del espacio crean campos.
- **Decisiones** = `meeting_items` con `kind = 'decision'`: son el registro de acuerdos del espacio.
- **Acciones** = `meeting_items` con `kind = 'action'`: al cerrar la reunión se convierten en tareas (`task_id`).
- `series_key` agrupa ocurrencias de una reunión recurrente para arrastrar pendientes al ciclo siguiente.

- **Planes por fases.** Hoy hay un solo plan, `free`. Sus límites (`max_workspaces = 5`, `max_members = 10`) viven en la tabla `plans`. Para cambiar el alcance se cambia esa tabla, no el código. Los triggers de la DB hacen cumplir los límites.
- **Dueño y admins de la cuenta:** crean espacios y crean usuarios dentro de la cuenta. Al crear un usuario se genera una contraseña temporal y se le pide cambiarla al entrar. También lo asignan a espacios. Ven todos los espacios.
- **Miembros:** solo ven los espacios asignados. Su rol por espacio es `admin`, `editor` o `viewer`.
- **El dueño no se puede degradar ni quitar.** Lo garantiza un trigger.
- **Numeración de tareas por espacio:** PRO-1, PRO-2… (`workspaces.key` + `tasks.number`).
- **Estados de tarea por espacio:** cada espacio puede crear los suyos (`workspaces.task_statuses`, Ajustes > Espacios). Cada estado pertenece a una de 5 **categorías fijas** (backlog, todo, in_progress, blocked, done) que vive en `tasks.status`; el estado propio va en `tasks.status_id`. La lógica de la app (Hoy, Mesa, vencimientos, contadores) usa la categoría. Un trigger mantiene ambos sincronizados. **Prioridades:** none, low, medium, high, urgent.
- **Organigrama** (Ajustes > Organigrama): departamentos con jefe, y cargo + "reporta a" por persona (`departments`, `account_members.title/department_id/reports_to`). **Cada persona ve sus tareas y las de todos los que están debajo** (reportes directos e indirectos e integrantes de los departamentos que encabeza), incluso en espacios donde no es miembro, **en solo lectura** (`my_visible_members()`, políticas `tasks_select_hierarchy` y `workspaces_select_hierarchy`). Owner y admins ven todo. Sin ciclos (trigger). **Integrante de un departamento** = quien lo tiene asignado o, si no tiene ninguno, lo hereda de su jefe; la gente de otra área que alguien del departamento tenga debajo no entra (poner al gerente general en un departamento no mete a toda la empresa en él). Misma regla en `my_visible_members()` y en `departmentMembers()` (`src/lib/org.ts`). En pantalla (`settings/org-settings.tsx`): árbol de arriba hacia abajo con tarjetas (área con color propio, "Jefe de…", equipos plegables); los admins arrastran a una persona sobre su nuevo jefe (o a la zona de arriba para dejarla sin jefe) y al tocar una tarjeta editan cargo, área y jefe, o le escriben por Pasillo. Vista "Por área" y búsqueda. Los departamentos se editan abajo.
- **Varios responsables por tarea** (`tasks.assignee_ids uuid[]`). `assignee_id` queda como "el primero" y lo mantiene el trigger `tasks_a_sync_assignees`: quien escriba un solo responsable (cerrar una reunión, la API, `@persona`) sigue funcionando. Solo se valida a quien entra; la lectura por jerarquía y las métricas de la consola miran a todos (`20261011120000_v2_task_assignees.sql`). En la app: `assigneesOf()` / `isAssignedTo()` (`lib/assignees.ts`), `AssigneesMenu` y `AvatarStack`. Las acciones de reunión siguen con un solo dueño.
- **Campos propios por espacio** (`workspaces.task_fields`): se crean en Ajustes > Espacios > (espacio) > pestaña *Campos* (texto, número, fecha, opciones, link). Aparecen en la página de la tarea y como columnas en la vista Tabla.
- **Pulso** muestra cantidades por estado según el alcance elegido: Mías, Mi equipo, un departamento, una persona o Toda la empresa (`src/lib/scope.ts`). El menú (`components/app/scope-menu.tsx`) dice el tipo y quiénes entran ("Departamento Comercial: Ana, Lucía y Pepito") y al lado se ven sus caras. Cada contador abre Mis tareas filtrado (`/my-tasks?view=blocked&scope=team`).

Esquema completo: `supabase/migrations/` (`_v2_core.sql`, `_v2_storage.sql`, `_v2_meeting_cycle.sql`, `_v2_attachments_fields.sql`, `_v2_admin.sql`, `_v2_org_statuses.sql`). `supabase/apply_v2.sql` los une con el reset de v1.

---

## 3. Arquitectura (decisiones)

| Decisión | Por qué |
|---|---|
| **RLS es la frontera de seguridad.** Las lecturas y escrituras comunes van del cliente a Supabase con React Query y updates optimistas. | La UI es instantánea (kanban, edición inline, autosave) y la seguridad no depende del frontend. |
| **Server Actions / Route Handlers solo para lo privilegiado.** Crear usuarios, tokens de Google y tokens de API usan `service_role`. | Esas operaciones necesitan secretos o saltarse RLS, siempre después de validar permisos. |
| **Campos fijos en tareas** en lugar de columnas EAV. | Hace posibles "Mis tareas", el calendario y los filtros sin joins complejos. |
| **Docs en JSON de BlockNote**, más `content_text` para búsqueda. `import_markdown` guarda el Markdown pendiente, que el editor convierte al abrir. | Permite crear docs desde la API (Claude) sin un DOM en el servidor. |
| **Tokens de Google cifrados** con AES-256-GCM (`TOKEN_ENCRYPTION_KEY`). La tabla no tiene políticas, así que solo la lee `service_role`. | Los refresh tokens son secretos de larga vida. |
| **Políticas con `my_workspace_ids()`.** | Se evalúa una vez por query, no por fila. |

Estructura:

```
src/
  app/(auth)        login, registro
  app/onboarding    crea cuenta + primer espacio
  app/(app)         home (Pulso), veltro (Veltro IA), tasks/[ref] (página de tarea), mesa, m/[id] (Ciclo), calendar, tasks (Tareas; my-tasks redirige), w/[slug]/(tasks|docs|meetings), settings/*
  app/api           integrations/google/*, calendar/*, v1/(docs|workspaces), demo
  components/       ui (primitivas Base UI), app (shell), pulse, veltro, meeting, mesa, tasks, docs, calendar, workspace, settings
  lib/              supabase/*, queries/* (React Query), google/*, demo/*, assistant/*, capture.ts, session.ts
  messages/         es.json en.json pt.json fr.json
```

---

## 4. Modo demo (datos de prueba)

Con `NEXT_PUBLIC_DEMO=1` en `.env.local` la app corre **sin Supabase ni Google**:

- `lib/demo/engine.ts` emula las tablas, defaults y triggers de la DB en memoria y persiste en `.demo/db.json`, que está en `.gitignore`.
- `lib/supabase/{client,server,admin}.ts` devuelven un cliente compatible que habla con ese motor. El navegador lo hace vía `POST /api/demo`.
- `lib/demo/calendar-gen.ts` genera una semana de reuniones relativa a la fecha del seed, incluida una "en curso".
- Botón **Reiniciar datos** en el sidebar, o `POST /api/demo {kind: "reset"}`.

Para usar Supabase real: aplicar `supabase/apply_v2.sql` y poner `NEXT_PUBLIC_DEMO=0`.

---

## 5. Puesta en marcha con servicios reales

1. **Base de datos:** en Supabase, abre SQL Editor y ejecuta `supabase/apply_v2.sql`. Es reset de v1 + esquema v2 + storage y se puede volver a correr.
2. **Google Calendar:** en Google Cloud crea un proyecto y habilita Calendar API. Configura la pantalla de consentimiento OAuth (External, Testing). Crea un OAuth client de tipo Web con este redirect URI: `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`.
3. **`.env.local`:**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=es
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=        # recomendado (32+ caracteres aleatorios)
NEXT_PUBLIC_DEMO=0
```

---

## 6. Internacionalización (regla de oro)

- **Ningún texto visible hardcodeado.** Todo va en `src/messages/{es,en,pt,fr}.json`, un archivo por idioma con namespaces anidados.
- Al agregar una clave, se agrega en **los 4 idiomas**.
- **Sin rayas largas (—) en los textos.** Usa comas, dos puntos o paréntesis.
- Locale: cookie `veltro-locale` (sincronizada con `profiles.locale`), luego `Accept-Language`, luego `NEXT_PUBLIC_DEFAULT_LOCALE`.
- Los valores en DB van en inglés (`todo`, `in_progress`…) y se traducen al renderizar.

---

## 7. Diseño

- **Marca:** Violeta Veltro `#6C47FF` (acciones, marca, selección), Violeta profundo `#4B2BD6` (hover, enlaces), Lavanda `#B9A8FF`, Niebla `#F1EDFF` (selección, lo destacado), **Mandarina `#FF8A3D`** (en curso, ahora, avisos), Tinta `#17141F` (texto, modo oscuro). Neutros teñidos hacia el violeta.
- **Isotipo** "el punto de encuentro": V de dos trazos (lavanda + violeta) con un corte del color del fondo (`components/app/logo.tsx`, `app/icon.svg`).
- **Tipografía:** Sora para la marca (logo, títulos grandes, bienvenida), Geist y Geist Mono para el producto.
- **Sin emojis:** los espacios usan monograma en baldosa de color (`WorkspaceMark`), los docs un ícono por origen (`DocMark`).
- Tokens en `src/app/globals.css` (`--canvas`, `--sidebar`, `--panel`, `--fg*`, `--accent*`, `--highlight`, `--mandarina`, `--k-*` para tipos de captura, `--st-*`, `--ws-*`), con variante `.dark`. **Nunca hex en componentes.**
- **Cada tarea tiene su página** `/tasks/TV-3` (la referencia que se ve en las listas): encabezado con título, estado, prioridad, responsable y fecha, y pestañas Detalle · Subtareas · Comentarios · Adjuntos (`?tab=` en la URL). **Se lee tranquila y se edita a propósito:** "Editar" (o `E`) convierte todo en formulario y los cambios se aplican juntos con "Guardar" (`⌘↵`) o se descartan con "Cancelar"; subtareas, comentarios y adjuntos se agregan sin entrar a editar. "Marcar como hecha" va a mano. Volver o `Esc` regresa a donde estabas. Se abre con `useOpenTask()` (`lib/use-open-task.ts`); `/tasks/<id>` y los enlaces viejos `?task=<id>` se corrigen solos. `⌘K` para todo y `C` para crear tarea.
- **Tema claro y oscuro** (por defecto, el del sistema): se cambia con el sol/luna junto al perfil en la barra lateral, desde `⌘K` o en Perfil.
- **Barra lateral colapsable** a un riel de íconos con tooltips (botón o tecla `[`). El estado va en la cookie `veltro-sidebar-collapsed` (`SIDEBAR_COOKIE` en `lib/constants.ts`) para que el servidor la dibuje ya colapsada.

---

### Ajustes

Menú agrupado a la izquierda: **Tú** (Perfil, Preferencias: idioma, tema, zona horaria e Integraciones con Google Calendar; `/settings/integrations` redirige ahí), **la empresa** (General y plan, Personas, Organigrama) y **Espacios** (uno por espacio + Nuevo espacio). Cada espacio tiene su página `/settings/workspaces/[slug]` con pestañas General · Estados · Campos · Personas. Piezas en `components/settings/ui.tsx`: `SettingsHeader`, `SettingsTabs`, `SettingsCard` + `SettingsRow` (qué es a la izquierda, control a la derecha) y `SaveBar` (un solo guardar por página o pestaña, aparece al cambiar algo).

## 8. Asistente

`src/lib/assistant/` prepara la agenda (pendientes del ciclo anterior + tareas vencidas, bloqueadas o de hoy de los convocados), resume reuniones, redacta el seguimiento y responde preguntas sobre los espacios. `intents.ts` (`askVeltro`) reconoce intenciones frecuentes en los 4 idiomas y lo que va entre comillas lo trata como título; `use-veltro.ts` junta los datos para Pulso y Veltro IA, que usan el mismo motor. Hoy es determinista (reglas sobre los datos), así funciona en el modo demo y sin claves. El siguiente paso es un proveedor con la API de Claude (`ANTHROPIC_API_KEY`) detrás de la misma interfaz, más la transcripción de Meet.

## 9. Claude → Veltro (API)

`POST /api/v1/docs` con `Authorization: Bearer vlt_...` (la pantalla para crear tokens se quitó de Ajustes; la API y las acciones `listApiTokens`/`createApiToken`/`revokeApiToken` siguen en el código):

```json
{ "workspace": "promoting", "markdown": "# Sesión: ...\n\n## Qué hicimos\n- ..." }
```

`GET /api/v1/workspaces` lista los espacios donde el token puede escribir.

---

## 10. Consola de administración (repo `veltro-console`)

App aparte para el equipo de Veltro (puerto 3010) sobre **la misma base**. Detalle en el README de ese repo.

- **Migración:** `supabase/migrations/20261010180000_v2_admin.sql` (incluida en `apply_v2.sql`). Este repo es la fuente de verdad del esquema; la consola copia las migraciones con `npm run db:sync`.
- **Equipo de plataforma:** `platform_admins` con roles `owner | admin | support | finance | viewer`. El primer dueño se agrega a mano en el SQL Editor (ver README de la consola).
- **Planes y cobros:** `plans` ahora tiene precios y visibilidad; `subscriptions` (una por cuenta, nace sola con la cuenta) mantiene `accounts.plan_id` sincronizado; `payments` registra los cobros (manuales hoy, Stripe después).
- **Suspensiones:** `accounts.status` y `profiles.suspended_at` cortan el acceso en `my_workspace_ids()` y `workspace_role_for()`. La app muestra un aviso (`nav.suspendedBanner`).
- **Telemetría (`src/lib/telemetry.ts`):**
  - presencia con `touch_presence()` (tabla `user_sessions`): al entrar y cada 2 minutos con la pestaña visible;
  - pantallas y funciones con `track_events()` (`view.*`, `feature.*`, en lotes);
  - las escrituras (tareas, docs, reuniones, adjuntos, comentarios, miembros) se registran solas con triggers en `usage_events`;
  - para medir una función nueva: `track('feature.nombre')` y su texto en `veltro-console/src/lib/events.ts`.

---

## 11. Próximas fases

- Proveedor de Claude para el asistente (resúmenes, agenda, preguntas) y transcripción de Meet.
- Sincronización tarea ↔ checklist del doc, que marque el ítem al cerrar la tarea.
- Realtime y edición colaborativa de docs (Yjs).
- Reglas para enlazar reuniones automáticamente a un espacio (por calendario o palabra clave).
- Pasarela de pagos (Stripe) escribiendo en `subscriptions` y `payments`; planes de pago visibles en la app.
- Login con Google y planes pagos con límites por plan.
- Notificaciones y actividad.

*Actualizado: 2026-10-10 (v2: identidad violeta, Pulso + Ciclo + Mesa)*

### Pendiente en la base de datos (se hizo solo en el front y el demo)
- `attachments`: columnas `account_id`, `title`, `labels text[]`; `workspace_id` pasa a admitir null (archivos sueltos de la bóveda). RLS: los sueltos se ven por cuenta.
- Pasillo: tablas `chats` (account_id, kind direct|group, name, created_by, last_message_at), `chat_members` (chat_id, user_id, role, last_read_at) y `chat_messages` (chat_id, user_id, kind, body, ref_id, meta jsonb). RLS por membresía; un trigger que actualice `last_message_at`; una vista o RPC con el resumen por chat (último mensaje y no leídos) para no traer todos los mensajes; suscripción en tiempo real.
- Las respuestas a invitaciones hoy viven en `chat_messages.meta.invite.rsvp`; en la base conviene una tabla propia (`chat_rsvps`).
- `attachments.chat_id` (archivos subidos en un chat: solo los ven sus miembros). En `apply_v2.sql` hoy el trigger obliga a que la ruta del archivo empiece por el id del espacio y congela `workspace_id`, y las políticas de storage van por carpeta de espacio: hay que abrirlas para archivos de cuenta (carpeta `<account_id>/`) y para mover un archivo de espacio.
- Archivos sueltos: editar o borrar solo quien lo subió o un admin de la cuenta (el front ya lo respeta; falta la política).

### Pendiente técnico del front (revisión de código)
- Listas largas sin virtualizar (Tareas, Bóveda) y menús montados por fila: medir y virtualizar si crece el volumen.
- Unificar piezas repetidas: un solo buscador (`ui/search-input`), pestañas y control segmentado compartidos, y una sola biblioteca de docs entre el espacio y la Bóveda.
- `TaskRow` es `role="button"` con menús adentro (interactivos anidados): pasar el botón al título.
- Espacios "observados" (de mi equipo, sin ser miembro): en modo real los loaders solo dejan entrar a miembros (`lib/workspace.ts`).
- Horas y tamaños con el formato del idioma (hoy `HH:mm` y "1.5 MB" fijos).
- Subidas desde el editor de docs: sin el tope de 20 MB, sin fila de adjunto y con URL firmada que vence.
