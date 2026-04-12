# Veltro — Project Context & Rules

> **Este archivo es la fuente de verdad del proyecto. Todo desarrollador y toda IA que trabaje en este repo debe leerlo antes de escribir una sola línea de código.**

---

## 1. Qué es Veltro

Veltro es una plataforma SaaS de gestión de trabajo en equipo (estilo Monday.com), diseñada con una arquitectura **multi-organización → multi-empresa → multi-usuario**, pensada para ser altamente escalable y comercializable.

**Stack:**
- Frontend: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- Backend/DB: Supabase (PostgreSQL + Auth + Realtime + Storage)
- Estado global: Zustand + TanStack Query
- Drag & Drop: @dnd-kit
- i18n: next-intl
- Deployment: Vercel

---

## 2. Modelo de datos jerárquico (CRÍTICO)

```
Organization (Master Account)
  └── Company (N por organización)
        └── User (N por organización, asignado a 1..N empresas)
              └── Board
                    └── Group
                          └── Item
                                └── SubItem
```

### Ejemplo real:
```
Organization: Consorcio Promoting
  ├── Company: Promoting
  ├── Company: Trade Marketing
  └── Company: Tech Ve

  Users:
  ├── Pepito Pérez  → asignado a: [Promoting]
  └── Ana Díaz      → asignado a: [Promoting, Tech Ve]
```

### Reglas de negocio:
- Un `Organization` es el cliente que paga (cuenta master).
- Una `Organization` puede tener N `Companies`.
- Un `User` pertenece a una `Organization` pero puede estar asignado a una o varias `Companies`.
- Los `Boards` pertenecen a una `Company`.
- Un `User` solo ve los `Boards` de las `Companies` a las que está asignado.
- El `Owner` de la `Organization` puede ver y gestionar todo.
- Los roles son: `org_owner`, `org_admin`, `company_admin`, `member`, `guest`.

---

## 3. Roles y permisos

| Rol | Alcance | Puede hacer |
|-----|---------|-------------|
| `org_owner` | Toda la organización | CRUD orgs, companies, users, billing |
| `org_admin` | Toda la organización | CRUD companies, users (no billing) |
| `company_admin` | Su(s) empresa(s) | CRUD boards, invitar miembros a la empresa |
| `member` | Empresas asignadas | CRUD items en boards donde tiene acceso |
| `guest` | Boards específicos | Solo lectura o edición limitada por board |

Los permisos se implementan con **Row Level Security (RLS)** en Supabase. Nunca se filtran solo en el frontend.

---

## 4. Internacionalización (i18n) — REGLA DE ORO

> **NINGÚN string visible al usuario puede estar hardcodeado en el código. Todo texto va en los archivos de traducción.**

### i18n strategy (updated):
- NO locale prefix in URLs. Routes are clean: /login, /dashboard, etc.
- Locale resolved by priority: DB profile → cookie → Accept-Language header → NEXT_PUBLIC_DEFAULT_LOCALE env var
- Logged-in users: locale persisted in `profiles.locale` column in Supabase
- Logged-out users: locale stored in `veltro-locale` cookie + localStorage
- Changing locale: `LocaleSwitcher` component → calls `updateUserLocale()` server action → sets cookie + updates DB → router.refresh()
- All links use `next/link` (NOT next-intl Link) since there are no locale segments to manage
- `useTranslations()` from next-intl still works exactly the same in all components

### Idiomas soportados (desde día 1):
| Código | Idioma |
|--------|--------|
| `en` | English (default) |
| `es` | Español |
| `pt` | Português |
| `fr` | Français |

### Estructura de archivos de traducción:
```
/messages
  /en
    common.json
    auth.json
    dashboard.json
    boards.json
    items.json
    columns.json
    settings.json
    errors.json
  /es
    (mismos archivos)
  /pt
    (mismos archivos)
  /fr
    (mismos archivos)
```

### Convención de keys:
```
{namespace}.{section}.{element}

Ejemplos:
  auth.login.title
  auth.login.emailPlaceholder
  boards.header.newBoard
  items.status.done
  errors.generic.notFound
  settings.profile.saveButton
```

### Cómo usar en componentes:
```tsx
// En Server Components o Client Components con next-intl
import { useTranslations } from 'next-intl'

export default function LoginForm() {
  const t = useTranslations('auth.login')
  return <h1>{t('title')}</h1>
}
```

### Al agregar un nuevo label — CHECKLIST OBLIGATORIO:
- [ ] ¿Agregué la key en `/messages/en/[namespace].json`?
- [ ] ¿Agregué la traducción en `/messages/es/[namespace].json`?
- [ ] ¿Agregué la traducción en `/messages/pt/[namespace].json`?
- [ ] ¿Agregué la traducción en `/messages/fr/[namespace].json`?
- [ ] ¿El valor es genérico y reutilizable o es muy específico? (si es genérico, va en `common.json`)

**NUNCA hacer esto:**
```tsx
// ❌ MAL — string hardcodeado
<button>Save changes</button>
<p>Board not found</p>

// ✅ BIEN — usando traducción
<button>{t('saveButton')}</button>
<p>{t('errors.notFound')}</p>
```

---

## 5. Estructura de carpetas del proyecto

```
/veltro
  /app
    /(auth)
      /login
      /register
      /invite/[token]
    /(dashboard)
      /[orgSlug]
        /[companySlug]
          /boards
          /board/[boardId]
          /settings
        /settings                # Org-level settings
        /members
    /dashboard                   # Hub post-login (redirects to org/company/boards)
    /layout.tsx
    /page.tsx
  /components
    /ui                          # shadcn/ui base components
    /auth                        # Login, register, invite forms
    /board                       # Board view, group, item row
    /columns                     # Column types (text, status, date, etc.)
    /views                       # Table, Kanban, Calendar, Gantt
    /layout                      # Sidebar, header, nav
    /shared                      # Avatar, badge, dropdown, modal
  /lib
    /supabase                    # Client, server, middleware clients
    /hooks                       # useBoard, useItems, useUser, etc.
    /stores                      # Zustand stores
    /utils                       # Helpers, formatters
    /types                       # TypeScript types globales
  /messages                      # Archivos de traducción (ver sección 4)
  /supabase
    /migrations                  # SQL migrations
    /seed.sql                    # Datos de prueba
  /middleware.ts                  # auth + veltro-locale cookie
```

---

## 6. Convenciones de código

### TypeScript
- Strict mode activado siempre.
- Todos los tipos de DB se generan desde Supabase CLI: `supabase gen types typescript`.
- Los tipos custom van en `/lib/types/`.

### Componentes
- Server Components por defecto. `'use client'` solo cuando sea necesario (interactividad, hooks de estado).
- Nombre de archivos: `kebab-case.tsx` para archivos, `PascalCase` para el componente exportado.

### Supabase
- Siempre usar el cliente correcto: `createServerClient` en Server Components, `createBrowserClient` en Client Components.
- Nunca hacer queries en el cliente que no estén protegidas por RLS.
- Todas las mutaciones pasan por Server Actions o API Routes.

### Commits
```
feat: descripción corta
fix: descripción corta
chore: descripción corta
i18n: add [idioma] translations for [namespace]
```

---

## 7. Variables de entorno requeridas

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=es

# Email (para invitaciones)
RESEND_API_KEY=
```

---

## 8. Schema de base de datos (resumen)

```sql
-- Nivel 1: Organización
organizations (id, name, slug, logo_url, plan, created_at)

-- Nivel 2: Empresas dentro de la organización
companies (id, org_id, name, slug, logo_url, created_at)

-- Usuarios (pertenecen a una org)
users / profiles (id, org_id, email, full_name, avatar_url, role, created_at)

-- Asignación usuario ↔ empresa (muchos a muchos)
user_company_assignments (user_id, company_id, role_in_company)

-- Grupos / departamentos dentro de una empresa
company_groups (id, company_id, name, description, color, icon, created_by)
user_group_memberships (user_id, group_id, added_by, added_at)

-- Boards (owner_id, visibility: private | company | groups; is_private deprecado)
boards (id, company_id, name, color, icon, description, owner_id, visibility, is_private, created_by)
board_members (id, board_id, user_id | group_id, role admin|member|viewer, invited_by)

-- Grupos dentro de un board
board_groups (id, board_id, name, color, position)

-- Items (tareas)
items (id, group_id, board_id, name, position, created_by, created_at)

-- Sub-items
sub_items (id, parent_item_id, name, position)

-- Valores de columnas
column_definitions (id, board_id, type, title, position, settings jsonb)
item_column_values (id, item_id, column_id, value jsonb)

-- Comentarios
item_comments (id, item_id, user_id, content, created_at)

-- Notificaciones
notifications (id, user_id, type, payload jsonb, read_at, created_at)

-- Automatizaciones
automations (id, board_id, trigger jsonb, conditions jsonb, actions jsonb, is_active)
automation_logs (id, automation_id, triggered_at, result jsonb)

-- Invitaciones
invitations (id, org_id, email, role, token, expires_at, accepted_at)
```

Todas las tablas tienen RLS habilitado. Ver `/supabase/migrations/` para los policies completos.

---

## 9. Backlog de épicas

| ID | Épica | Sprint |
|----|-------|--------|
| E1 | Autenticación & Usuarios | S1 |
| E2 | Workspaces & Equipos | S1–S2 |
| E3 | Tableros & Proyectos | S1–S3 |
| E4 | Columnas & Tipos de datos | S1–S3 |
| E5 | Vistas (Tabla, Kanban, Calendario, Gantt) | S2–S3 |
| E6 | Colaboración en tiempo real | S2–S3 |
| E7 | Automatizaciones | S4+ |
| E8 | Dashboard & Reportes | S3–S4+ |

---

## 10. Contacto y decisiones de arquitectura

- Proyecto iniciado: 2026
- Arquitectura decidida por: equipo fundador
- Cualquier cambio de arquitectura mayor debe documentarse en este archivo con fecha y razón.

---

## 11. Design System — Slate Green

**Primary palette:**
| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#1a3a2e` (HSL `158 40% 17%` en tokens shadcn) | Botones, estados activos, acento de marca |
| `--primary-mid` | `#2d8a6a` | Hover, anillos de foco, acentos |
| `--primary-light` | `#e8f5f0` | Fondo de nav activo, pills |
| `--primary-dark` | `#0d1f18` | Texto sobre fondos claros |

**Typography scale:**
| Size | px | Usage |
|------|-----|-------|
| `2xs` | 10px | Labels, section headers |
| `xs` | 11px | Badges, pills, metadata |
| `sm` | 12px | Table cells, secondary content |
| `base` | 13px | Body text, nav items |
| `md` | 15px | Board titles, modal headers |
| `lg` | 18px | Page titles |

**Component classes** (defined in globals.css):
- Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`
- Inputs: `.input`, `.input-sm`
- Cards: `.card`, `.card-surface`
- Status pills: `.pill`, `.pill-todo`, `.pill-progress`, `.pill-done`, `.pill-stuck`, `.pill-waiting`
- Navigation: `.nav-item` (with `.active`)
- Layout: `.section-label`, `.divider`, `.badge`, `.badge-brand`

**Dark mode:** implemented via `.dark` class on `<html>`. Toggle managed by `ThemeProvider`.
All colors use CSS custom properties — never hardcode hex values in components.

---

## 12. Updated data model — Groups & Board Access

**New tables:**
- `company_groups` — departments/groups within a company
- `user_group_memberships` — users assigned to groups (many-to-many)
- `board_members` — individual users OR groups with access to a board

**Board visibility rules:**
| Visibility | Who can see |
|------------|-------------|
| `private` | Owner + explicitly invited users/groups only |
| `company` | All users assigned to the company |
| `groups` | Owner + invited groups + individually invited users |

**Board access logic** (enforced via `can_access_board()` SQL function + RLS):
1. `org_owner` / `org_admin` → always
2. `visibility = 'company'` → any company member
3. `visibility = 'private'/'groups'` → owner OR direct board_member OR member of an invited group

**Invite constraints:**
- A user can only invite people from companies/groups they belong to
- Exception: `org_admin` and `org_owner` can invite anyone in the org
- Board owner can transfer ownership to another board admin

*Updated: 2026-04-11*

---

*Última actualización: 2026-04-11*
