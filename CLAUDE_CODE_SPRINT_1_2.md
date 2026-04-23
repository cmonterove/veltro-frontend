# Veltro — Claude Code: Sprint 1 + Sprint 2

> Ejecutá este prompt de forma autónoma. Avanzá tarea por tarea en el orden indicado.
> Si encontrás un bloqueante real (falta de dato, ambigüedad crítica), dejá un `TODO` claro
> con el problema específico y continuá con la siguiente tarea. No te detengas.
>
> Leé este documento completo antes de tocar cualquier archivo.

---

## Contexto del proyecto

**Veltro** — SaaS de gestión de trabajo en equipo (réplica de Monday.com), multi-tenant.

### Jerarquía de datos
```
Organization → Company → User → Board → Group → Item → ItemColumnValue
```

### Stack
- **Frontend:** Next.js 14 App Router + TypeScript strict
- **Estilos:** Tailwind CSS + shadcn/ui + `globals.css` con CSS vars
- **DB / Auth:** Supabase (PostgreSQL + Auth + RLS)
- **i18n:** next-intl (sin prefijo en URL, locale por cookie `veltro-locale`)
- **Estado:** Zustand + TanStack Query
- **Drag & Drop:** @dnd-kit (instalado, aún no implementado)
- **Email:** Resend (configurado)

### Design system — regla crítica
- **NUNCA hardcodear hex.** Siempre `var(--primary)`, `var(--primary-mid)`, `var(--primary-light)`, `var(--primary-dark)`.
- Dark mode: clase `.dark` en `<html>`.

### Regla de i18n — regla crítica
Cada vez que agregues texto visible al usuario:
1. Agregar key en `messages/en/[namespace].json`
2. Agregar en `messages/es/`, `messages/pt/`, `messages/fr/`
3. Usar `useTranslations('namespace')` (client) o `getTranslations` (server)
4. **NUNCA** hardcodear strings en inglés en componentes

Los valores en DB (status labels: `"Not started"`, `"In progress"`, etc.) se guardan **siempre en inglés** y se traducen en render time.

### Regla Supabase — regla crítica
- En el middleware usar **siempre `getUser()`**, nunca `getSession()`.
- Para INSERTs que fallen por RLS (`auth.uid()` llega `null` en server actions), usar función SQL `SECURITY DEFINER` llamada via RPC. Ver patrón en sección de notas al final.

### Datos de prueba
```
Organization: Consorcio Promoting  (id: 8c5dabab-d327-432e-be33-73fb5a804074)
Company:      Consorcio Promoting  (id: 25759c3f-dd9a-4e7c-9b51-9c32cfc96cf3, slug: consorcio-promoting)
User:         Cesar Montero        (id: afa7cc40-d233-433b-aa48-17fe81683388, role: org_owner)
Email:        appveltro@gmail.com
```

---

## Estructura de archivos relevante

```
src/
  app/
    (auth)/login/page.tsx + actions.ts
    (auth)/register/page.tsx + actions.ts
    (dashboard)/
      layout.tsx
      [orgSlug]/[companySlug]/
        boards/page.tsx + boards-page-client.tsx + actions.ts
        board/[boardId]/page.tsx + actions.ts
  components/
    board/
      board-view.tsx
      board-header.tsx
      board-toolbar.tsx
      board-table.tsx
      board-group.tsx
      board-item-row.tsx
      item-detail-panel.tsx
      create-board-modal.tsx
    layout/
      topbar.tsx + sidebar.tsx + sidebar-boards.tsx + ...
    shared/
      theme-provider.tsx + locale-provider.tsx + locale-switcher.tsx
  lib/supabase/client.ts + server.ts + types.ts
  lib/types/index.ts + board.ts + layout.ts + enums.ts
  messages/en/ es/ pt/ fr/
    common.json, auth.json, dashboard.json, boards.json,
    items.json, columns.json, settings.json, errors.json
  middleware.ts
```

---

## SPRINT 1 — Board funcional completo

---

### TAREA 1 — i18n completo del board

#### 1.1 — Actualizar archivos de mensajes (los 4 idiomas)

**`messages/[lang]/boards.json`** — agregar estas keys en los 4 idiomas:
```json
{
  "addItem": "Add item",
  "addGroup": "Add group",
  "filter": "Filter",
  "sort": "Sort",
  "groupBy": "Group by",
  "hideColumns": "Hide columns",
  "search": "Search...",
  "newBoard": "New board",
  "boardName": "Board name",
  "boardDescription": "Description (optional)",
  "createBoard": "Create board",
  "cancel": "Cancel",
  "visibility": {
    "label": "Visibility",
    "private": "Private",
    "privateDesc": "Only you and invited members",
    "company": "Company",
    "companyDesc": "Everyone in this company",
    "groups": "Groups",
    "groupsDesc": "Specific groups only"
  },
  "emptyState": {
    "title": "No boards yet",
    "description": "Create your first board to start organizing work",
    "cta": "Create board"
  },
  "views": {
    "table": "Table",
    "kanban": "Kanban",
    "calendar": "Calendar",
    "gantt": "Gantt"
  }
}
```

**`messages/[lang]/items.json`** — agregar:
```json
{
  "addItem": "Add item",
  "deleteItem": "Delete item",
  "openDetail": "Open",
  "newItem": "New item",
  "comments": "Comments",
  "writeComment": "Write a comment...",
  "properties": "Properties",
  "activity": "Activity",
  "noComments": "No comments yet"
}
```

**`messages/[lang]/columns.json`** — agregar:
```json
{
  "statusLabels": {
    "Not started": "Not started",
    "In progress": "In progress",
    "Done": "Done",
    "Stuck": "Stuck",
    "Waiting": "Waiting"
  },
  "columnTypes": {
    "status": "Status",
    "person": "Person",
    "date": "Date",
    "number": "Number",
    "text": "Text",
    "checkbox": "Checkbox"
  }
}
```

Traducir correctamente en ES, PT, FR (no dejes los valores en inglés en esos archivos).

#### 1.2 — Componentes: reemplazar strings hardcodeados

En cada componente, importar `useTranslations` del namespace correspondiente y reemplazar cada string visible hardcodeado.

**`board-header.tsx`:**
- Agregar prop `onAddItem: () => void`
- Traducir: tabs de vista (Table/Kanban/Calendar/Gantt), cualquier label hardcodeado
- Conectar el botón "+ Add item" del header para que llame `onAddItem`

**`board-toolbar.tsx`:**
- Traducir: Filter, Sort, Group by, Hide columns, Search placeholder

**`board-table.tsx`:**
- Traducir: header de columna "Item" y cualquier string hardcodeado

**`board-group.tsx`:**
- Traducir: "Add item", colapsar/expandir

**`board-item-row.tsx`:**
- Traducir status labels en render time con este helper exacto:
```typescript
const tColumns = useTranslations('columns')
const translateStatus = (rawLabel: string): string => {
  try {
    return tColumns(`statusLabels.${rawLabel}`)
  } catch {
    return rawLabel
  }
}
```
- Usar `translateStatus(value)` al renderizar el label de status, no el valor crudo.

**`item-detail-panel.tsx`:**
- Traducir: "Comments", "Write a comment...", "Properties", "Activity", nombres de columna

**`boards-page-client.tsx` y `create-board-modal.tsx`:**
- Traducir: empty state, campos del modal (nombre, descripción, visibilidad), botones

#### 1.3 — Conectar "Add item" del header en `board-view.tsx`

```typescript
// En board-view.tsx
const handleAddItemFromHeader = useCallback(() => {
  if (groups.length === 0) return
  const firstGroup = groups[0]
  handleCreateItem(firstGroup.id)
}, [groups, handleCreateItem])

// Pasar como prop a BoardHeader:
<BoardHeader
  ...
  onAddItem={handleAddItemFromHeader}
/>
```

---

### TAREA 2 — Drag & drop de items con @dnd-kit

Implementar drag & drop para items dentro y entre grupos. @dnd-kit ya está instalado (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`).

#### 2.1 — Lógica en `board-view.tsx`

```typescript
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
```

- Envolver el contenido del board en `<DndContext>` con `sensors`, `collisionDetection={closestCorners}`, `onDragStart`, `onDragOver`, `onDragEnd`.
- `onDragEnd`: determinar si el item se movió dentro del mismo grupo (reordenar) o a otro grupo (mover). Llamar `syncItemPositions` o `moveItem` según el caso.
- Implementar update optimista: actualizar el estado local inmediatamente, luego persistir.
- Mostrar un `DragOverlay` con una versión simplificada de la fila mientras se arrastra.

#### 2.2 — `board-group.tsx` como contenedor sortable

```typescript
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
```

- Cada grupo es un `useDroppable` con `id={group.id}`.
- Los items del grupo van dentro de `<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>`.

#### 2.3 — `board-item-row.tsx` como item sortable

```typescript
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- Usar `useSortable({ id: item.id })`.
- Aplicar `transform` y `transition` al contenedor de la fila.
- Agregar un handle de drag (ícono de 6 puntos, `GripVertical` de lucide-react) visible al hover de la fila.
- Cuando `isDragging`, reducir opacidad de la fila original a 0.3.

#### 2.4 — Server actions en `board/[boardId]/actions.ts`

Verificar que existen y funcionan:
- `syncItemPositions(rows: { id: string; position: number; group_id: string }[])` — para reordenar dentro del mismo grupo
- `moveItem(itemId: string, newGroupId: string, newPosition: number)` — para mover entre grupos

Si alguna no existe, crearla. Si falla por RLS, aplicar el patrón SECURITY DEFINER (ver sección de notas al final).

---

## SPRINT 2 — Company Groups, Members e Invitaciones

---

### TAREA 3 — Migraciones de base de datos para Sprint 2

Crear el archivo `supabase/migrations/003_sprint2.sql` con el siguiente contenido.

> **IMPORTANTE:** No ejecutes esta migración automáticamente. Dejá el archivo creado y agregá un TODO comentando que debe ejecutarse en Supabase Dashboard → SQL Editor.

```sql
-- ============================================================
-- SPRINT 2: company_groups, invitations, board memberships
-- ============================================================

-- Tabla: company_groups (departamentos dentro de una company)
CREATE TABLE IF NOT EXISTS public.company_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#2d8a6a',
  description text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabla: company_group_members (usuarios asignados a un departamento)
CREATE TABLE IF NOT EXISTS public.company_group_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_group_id uuid NOT NULL REFERENCES public.company_groups(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_group_id, user_id)
);

-- Tabla: invitations (invitaciones por email a la org)
CREATE TABLE IF NOT EXISTS public.invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('org_owner', 'admin', 'member', 'guest')),
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by      uuid REFERENCES public.profiles(id),
  accepted_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Políticas company_groups: miembros de la company pueden leer; admins pueden escribir
CREATE POLICY "company_groups_select" ON public.company_groups
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_insert" ON public.company_groups
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_update" ON public.company_groups
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_delete" ON public.company_groups
  FOR DELETE USING (
    created_by = auth.uid()
  );

-- Políticas invitations: solo admins/owners pueden ver y crear invitaciones de su org
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_company_groups_company_id ON public.company_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_company_group_members_group_id ON public.company_group_members(company_group_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.invitations(organization_id);
```

---

### TAREA 4 — Tipos TypeScript para Sprint 2

En `src/lib/types/index.ts` (o el archivo de tipos que corresponda), agregar:

```typescript
export interface CompanyGroup {
  id: string
  company_id: string
  name: string
  color: string
  description?: string
  created_by?: string
  created_at: string
  updated_at: string
  members?: CompanyGroupMember[]
}

export interface CompanyGroupMember {
  id: string
  company_group_id: string
  user_id: string
  role: 'lead' | 'member'
  created_at: string
  profile?: {
    id: string
    full_name: string
    avatar_url?: string
    email: string
  }
}

export interface Invitation {
  id: string
  organization_id: string
  company_id?: string
  email: string
  role: 'org_owner' | 'admin' | 'member' | 'guest'
  token: string
  invited_by?: string
  accepted_at?: string
  expires_at: string
  created_at: string
}
```

---

### TAREA 5 — CRUD de Company Groups (departamentos)

#### 5.1 — Server Actions: `src/app/(dashboard)/[orgSlug]/[companySlug]/settings/groups/actions.ts`

Crear el archivo con estas server actions:

```typescript
'use server'
// Todas usan createServerClient de @/lib/supabase/server

// getCompanyGroups(companyId: string): Promise<CompanyGroup[]>
// Trae grupos con sus miembros (join con profiles)

// createCompanyGroup(companyId: string, name: string, color: string, description?: string): Promise<CompanyGroup>
// Si falla por RLS → aplicar patrón SECURITY DEFINER (TODO documentado)

// updateCompanyGroup(groupId: string, data: { name?: string; color?: string; description?: string }): Promise<void>

// deleteCompanyGroup(groupId: string): Promise<void>

// addMemberToGroup(groupId: string, userId: string, role: 'lead' | 'member'): Promise<void>

// removeMemberFromGroup(groupId: string, userId: string): Promise<void>
```

#### 5.2 — Página: `src/app/(dashboard)/[orgSlug]/[companySlug]/settings/groups/page.tsx`

Server Component. Carga grupos de la company y los pasa al client component.

#### 5.3 — Client Component: `src/components/settings/company-groups-page.tsx`

UI con:
- **Lista de grupos** existentes: nombre, color, descripción, cantidad de miembros, botones Editar / Eliminar.
- **Botón "New group"** → abre modal de creación.
- **Modal de creación/edición:** campo nombre (required), selector de color (los mismos 12 colores del create-board-modal), campo descripción (optional), botón guardar.
- **Panel de miembros** de cada grupo: al expandir un grupo, muestra los miembros con su avatar, nombre y rol (Lead / Member). Botón para agregar miembro (dropdown con usuarios de la company) y para remover.
- Todo con i18n en los 4 idiomas. Namespace: `settings`.
- Usar el design system (CSS vars, no hex hardcodeados).
- Manejo de loading y error states.

#### 5.4 — Agregar al sidebar

En `sidebar-nav.tsx` o donde corresponda según la estructura actual, agregar un link a `/[orgSlug]/[companySlug]/settings/groups` con ícono `Users` de lucide-react y label traducido.

---

### TAREA 6 — Gestión de miembros de la organización

#### 6.1 — Server Actions: `src/app/(dashboard)/[orgSlug]/settings/members/actions.ts`

```typescript
'use server'

// getOrgMembers(organizationId: string): Promise<Profile[]>
// Trae todos los usuarios de la org con su rol, company assignments y company_groups

// updateMemberRole(userId: string, organizationId: string, role: string): Promise<void>
// Solo org_owner puede cambiar roles

// removeMemberFromOrg(userId: string, organizationId: string): Promise<void>
// Elimina user_company_assignments y profiles (soft delete: setear deleted_at si existe, o hard delete)
```

#### 6.2 — Página: `src/app/(dashboard)/[orgSlug]/settings/members/page.tsx`

Server Component. Carga miembros y pasa al client component.

#### 6.3 — Client Component: `src/components/settings/members-page.tsx`

UI con:
- **Tabla de miembros:** avatar, nombre, email, rol (badge), companies asignadas, company groups, fecha de ingreso, acciones.
- **Cambio de rol** inline (dropdown: org_owner / admin / member / guest). Solo habilitado para org_owner.
- **Botón "Remove member"** con confirmación (dialog de shadcn/ui).
- **Búsqueda** por nombre o email.
- Todo con i18n. Namespace: `settings`.

---

### TAREA 7 — Sistema de invitaciones por email

#### 7.1 — Server Actions: `src/app/(dashboard)/[orgSlug]/settings/members/actions.ts`

Agregar a las actions existentes:

```typescript
// sendInvitation(organizationId: string, email: string, role: string, companyId?: string): Promise<void>
// 1. Verificar que no exista ya una invitación pendiente para ese email en esa org
// 2. Insertar en tabla invitations
// 3. Enviar email con Resend usando el token:
//    - URL de aceptación: `${process.env.NEXT_PUBLIC_APP_URL}/invite/[token]`
//    - Template simple (HTML inline): invitación de [orgName] a Veltro, botón "Accept invitation"
// Si Resend falla → dejar TODO claro y continuar (loguear error, no romper el flujo)

// getPendingInvitations(organizationId: string): Promise<Invitation[]>

// cancelInvitation(invitationId: string): Promise<void>

// resendInvitation(invitationId: string): Promise<void>
// Regenera token, extiende expires_at 7 días, reenvía email
```

#### 7.2 — UI de invitaciones en members page

En `members-page.tsx`, agregar una sección "Pending invitations" debajo de la tabla de miembros:
- Lista de invitaciones pendientes: email, rol, fecha de envío, expiración, botones Reenviar / Cancelar.
- Botón "Invite member" → modal con campo email, selector de rol, selector de company (opcional).

#### 7.3 — Página de aceptación de invitación

**`src/app/invite/[token]/page.tsx`** — Server Component público (no requiere auth):

Lógica:
1. Buscar el token en la tabla `invitations`.
2. Si no existe o expiró → mostrar página de error ("This invitation is invalid or has expired").
3. Si ya fue aceptada → redirigir al dashboard.
4. Si válida → mostrar página de bienvenida con nombre de la org y botón "Accept & create account" (si no tiene cuenta) o "Accept & sign in" (si ya tiene).

**`src/app/invite/[token]/accept/page.tsx`** — Server Component:

Al llegar aquí (post-auth):
1. Verificar token nuevamente.
2. Crear/actualizar el `user_company_assignment` con el `company_id` de la invitación.
3. Marcar `accepted_at = now()` en la invitación.
4. Redirigir al dashboard de la org.

> **TODO:** El flujo completo de aceptación para usuarios nuevos (sin cuenta) requiere integración con el registro. Implementar el happy path para usuarios que ya tienen cuenta. Para usuarios nuevos, dejar la página de landing con TODO documentado.

---

### TAREA 8 — Actualizar i18n para Sprint 2

Agregar en `messages/[lang]/settings.json` (los 4 idiomas) al menos estas keys:

```json
{
  "groups": {
    "title": "Company Groups",
    "newGroup": "New group",
    "editGroup": "Edit group",
    "deleteGroup": "Delete group",
    "groupName": "Group name",
    "groupDescription": "Description (optional)",
    "groupColor": "Color",
    "members": "Members",
    "noMembers": "No members yet",
    "addMember": "Add member",
    "removeMember": "Remove",
    "lead": "Lead",
    "member": "Member",
    "confirmDelete": "Are you sure you want to delete this group?"
  },
  "members": {
    "title": "Members",
    "invite": "Invite member",
    "inviteEmail": "Email address",
    "inviteRole": "Role",
    "inviteCompany": "Company (optional)",
    "sendInvite": "Send invitation",
    "pendingInvitations": "Pending invitations",
    "resend": "Resend",
    "cancel": "Cancel",
    "remove": "Remove member",
    "confirmRemove": "Are you sure you want to remove this member?",
    "roles": {
      "org_owner": "Owner",
      "admin": "Admin",
      "member": "Member",
      "guest": "Guest"
    },
    "joinedAt": "Joined",
    "invitedAt": "Invited",
    "expiresAt": "Expires",
    "noMembers": "No members yet"
  },
  "invite": {
    "title": "You've been invited",
    "subtitle": "to join {orgName} on Veltro",
    "accept": "Accept invitation",
    "alreadyMember": "Sign in to accept",
    "invalid": "This invitation is invalid or has expired.",
    "accepted": "Invitation accepted"
  }
}
```

---

### TAREA 9 — Navegación y layout de Settings

#### 9.1 — Layout de settings: `src/app/(dashboard)/[orgSlug]/settings/layout.tsx`

Server Component que renderiza un sub-layout con:
- Sidebar de settings (links: Members, Company Groups, Profile, Organization).
- Breadcrumb en el topbar o debajo de él.

#### 9.2 — Links en sidebar principal

En el sidebar, agregar al final (antes del footer):
- "Settings" con ícono `Settings` de lucide-react, link a `/[orgSlug]/settings/members`.

---

## Checklist de verificación (al terminar cada tarea)

### Sprint 1
- [ ] Cambiar idioma a español → todos los labels del board aparecen en español
- [ ] Status labels del board en español (No iniciado, En progreso, Hecho, etc.)
- [ ] Botón "+ Add item" del header crea un ítem en el primer grupo
- [ ] Ítem nuevo aparece sin recargar (optimistic update)
- [ ] Cursor queda en el nombre del ítem nuevo para editar inline
- [ ] Drag & drop funciona dentro del mismo grupo (reordenamiento)
- [ ] Drag & drop funciona entre grupos (mover item)
- [ ] Las posiciones se persisten al soltar (llamada a server action)
- [ ] No hay strings hardcodeados en inglés visibles en modo español

### Sprint 2
- [ ] Página `/settings/groups` lista los grupos de la company
- [ ] Se puede crear, editar y eliminar grupos
- [ ] Se pueden agregar y remover miembros de grupos
- [ ] Página `/settings/members` lista todos los miembros de la org
- [ ] Se puede cambiar el rol de un miembro
- [ ] Se puede invitar por email (modal + server action)
- [ ] La invitación enviada aparece en "Pending invitations"
- [ ] Se puede cancelar o reenviar una invitación
- [ ] Página `/invite/[token]` muestra info correcta de la invitación
- [ ] El flujo de aceptación para usuario existente funciona end-to-end
- [ ] Todos los textos nuevos están en los 4 idiomas

---

## Notas técnicas críticas

### Patrón SECURITY DEFINER para INSERTs que fallan por RLS

Si un INSERT desde un server action de Next.js falla con "new row violates row-level security" o `auth.uid()` devuelve `null`, aplicar este patrón:

**1. Crear función SQL en Supabase:**
```sql
CREATE OR REPLACE FUNCTION public.mi_funcion(
  p_param1 text,
  p_param2 uuid
  -- etc.
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO mi_tabla (col1, col2)
  VALUES (p_param1, p_param2)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.mi_funcion TO authenticated;
```

**2. Llamar desde el server action:**
```typescript
const { data, error } = await (supabase as any).rpc('mi_funcion', {
  p_param1: valor1,
  p_param2: valor2,
})
```

**Aplica actualmente a:** `create_board`. Si hay problemas con `createCompanyGroup`, `addMemberToGroup`, etc., aplicar el mismo patrón y dejar el SQL en `supabase/migrations/003_sprint2_rpc.sql`.

### NUNCA usar getSession() en middleware
```typescript
// ❌ MAL
const { data: { session } } = await supabase.auth.getSession()
// ✅ BIEN
const { data: { user } } = await supabase.auth.getUser()
```

### Tipos de Supabase desactualizados
Los tipos generados no conocen funciones RPC nuevas. Usar `(supabase as any).rpc(...)` como workaround. Antes del deploy regenerar con:
```bash
npx supabase gen types typescript --project-id TU_PROJECT_ID > src/lib/supabase/types.ts
```

### shadcn/ui disponible
Usar componentes de shadcn/ui existentes: `Dialog`, `DropdownMenu`, `Button`, `Input`, `Badge`, `Avatar`, `Tooltip`, `AlertDialog` para confirmaciones destructivas, `Select` para dropdowns de rol.

### Resend — envío de emails
```typescript
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: 'Veltro <noreply@veltro.app>', // TODO: cambiar por dominio real cuando se configure
  to: email,
  subject: `You've been invited to ${orgName} on Veltro`,
  html: `...` // template simple inline
})
```
Si el dominio no está configurado en Resend, dejar TODO claro y no romper el flujo.

---

## Orden de ejecución recomendado

```
1. i18n mensajes (todos los archivos JSON) ← sin dependencias
2. Componentes del board (i18n + Add item) ← depende de #1
3. Drag & drop ← depende de #2
4. Migración SQL (crear archivo, no ejecutar) ← sin dependencias
5. Tipos TypeScript Sprint 2 ← depende de #4
6. Server actions company groups ← depende de #4 y #5
7. UI company groups ← depende de #6
8. Server actions members ← depende de #4 y #5
9. UI members ← depende de #8
10. Server actions invitaciones + Resend ← depende de #8
11. UI invitaciones ← depende de #10
12. Páginas /invite/[token] ← depende de #10
13. Settings layout + navegación ← depende de #7, #9, #12
14. i18n settings.json ← puede hacerse junto con #7
```

---

*Generado el 12 de abril de 2026. Ejecutar en Claude Code con acceso completo al repositorio de Veltro.*
