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
| **Pulso** (inicio) | `/home` | Una sola línea de tiempo con AHORA. Arriba lo que viene (cada reunión con su "Prepara"), en la línea la reunión en curso con captura rápida, abajo los **hilos** de lo que pasó (reunión → decisiones → tareas y su estado). A la derecha "Foco de hoy" (máx. 5) y "Pregúntale a Veltro". |
| **Ciclo** (cada reunión) | `/m/[id]` | Sala de la reunión con fases **Preparar → En vivo → Cerrar**. Se capturan notas, decisiones (`<>`), acciones (`->`, `@persona`, "mañana") y preguntas (`??`). La **Salida** se arma sola; al cerrar, Veltro crea las tareas, escribe el resumen, redacta el correo de seguimiento y guarda el registro como doc. |
| **Mesa de control** | `/mesa` | Todas las empresas del consorcio en columnas: próxima reunión, acuerdos vivos, atascado, avance y memoria. Franja "Tu día" y briefing semanal. |

Vistas de soporte: Calendario semanal, Mis tareas, y por espacio: Resumen, Tareas (lista, **tabla con todos los campos**, tablero, calendario), Docs (biblioteca de **documentos y archivos**) y Reuniones (calendario semanal del espacio).
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
- **Estados de tarea fijos:** backlog, todo, in_progress, blocked, done. **Prioridades:** none, low, medium, high, urgent.

Esquema completo: `supabase/migrations/` (`_v2_core.sql`, `_v2_storage.sql`, `_v2_meeting_cycle.sql`, `_v2_attachments_fields.sql`, `_v2_admin.sql`). `supabase/apply_v2.sql` los une con el reset de v1.

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
  app/(app)         home (Pulso), mesa, m/[id] (Ciclo), calendar, my-tasks, w/[slug]/(tasks|docs|meetings), settings/*
  app/api           integrations/google/*, calendar/*, v1/(docs|workspaces), demo
  components/       ui (primitivas Base UI), app (shell), pulse, meeting, mesa, tasks, docs, calendar, workspace, settings
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
- Detalle de tarea en panel lateral (no modal). `⌘K` para todo y `C` para crear tarea.

---

## 8. Asistente

`src/lib/assistant/` prepara la agenda (pendientes del ciclo anterior + tareas vencidas, bloqueadas o de hoy de los convocados), resume reuniones, redacta el seguimiento y responde preguntas sobre los espacios. Hoy es determinista (reglas sobre los datos), así funciona en el modo demo y sin claves. El siguiente paso es un proveedor con la API de Claude (`ANTHROPIC_API_KEY`) detrás de la misma interfaz, más la transcripción de Meet.

## 9. Claude → Veltro (API)

`POST /api/v1/docs` con `Authorization: Bearer vlt_...` (token creado en Ajustes, API y Claude):

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
