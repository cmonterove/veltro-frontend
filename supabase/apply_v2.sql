-- Veltro v2: reset + esquema completo (generado; fuente en reset_v1.sql y migrations/)
begin;
-- ============================================================
-- Veltro — RESET v1 → v2
-- Borra TODO el esquema public de la v1 (organizations, companies,
-- boards, items, column_definitions, ...) y lo deja limpio para v2.
-- Los usuarios de auth.users se conservan; la migración v2 les
-- crea su perfil y pasan por el onboarding.
--
-- Ejecutar UNA sola vez, antes de supabase/migrations/*.sql
-- ============================================================

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
-- ============================================================
-- Veltro v2 — Core schema
--
--   plans ─┐
--          └─ accounts ── account_members ── profiles (auth.users)
--               └─ workspaces ── workspace_members
--                    ├─ tasks ── task_comments
--                    ├─ docs (árbol, editor por bloques)
--                    └─ meetings (eventos de Google Calendar enlazados)
--
--   google_connections / api_tokens: solo accesibles con service_role
-- ============================================================

-- ------------------------------------------------------------
-- Utilidades
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- PLANS — límites por plan. null = ilimitado.
-- Fase 1: un único plan "free". Cambiar límites aquí, no en código.
-- ------------------------------------------------------------
create table public.plans (
  id              text primary key,
  name            text not null,
  max_workspaces  integer check (max_workspaces is null or max_workspaces > 0),
  max_members     integer check (max_members is null or max_members > 0),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);

insert into public.plans (id, name, max_workspaces, max_members, is_default)
values ('free', 'Free', 5, 10, true);

-- ------------------------------------------------------------
-- PROFILES — 1:1 con auth.users
-- ------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null,
  full_name             text not null default '',
  avatar_url            text,
  locale                text not null default 'es' check (locale in ('en', 'es', 'pt', 'fr')),
  timezone              text not null default 'UTC',
  must_change_password  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ACCOUNTS — la cuenta que "paga" (dueño + plan)
-- ------------------------------------------------------------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  plan_id     text not null default 'free' references public.plans(id),
  owner_id    uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

create table public.account_members (
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index account_members_user_idx on public.account_members(user_id);

-- ------------------------------------------------------------
-- WORKSPACES — "espacios de trabajo" (proyectos / empresas)
-- ------------------------------------------------------------
create table public.workspaces (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 80),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  key          text not null check (key ~ '^[A-Z0-9]{2,5}$'),
  icon         text not null default '',   -- monograma (1-2 letras)
  color        text not null default 'violet',
  description  text,
  task_seq     integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index workspaces_account_idx on public.workspaces(account_id);

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members(user_id);

-- ------------------------------------------------------------
-- MEETINGS — evento de Google Calendar enlazado a un espacio
-- ------------------------------------------------------------
create table public.meetings (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  google_event_id     text,
  google_calendar_id  text,
  title               text not null default '',
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  attendees           jsonb not null default '[]'::jsonb,
  location            text,
  conference_url      text,
  html_link           text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, google_event_id)
);

create index meetings_workspace_starts_idx on public.meetings(workspace_id, starts_at desc);
create index meetings_google_event_idx on public.meetings(google_event_id);

create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create or replace function public.meetings_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.created_by = coalesce((select auth.uid()), new.created_by);
  return new;
end;
$$;

create trigger meetings_before_insert before insert on public.meetings
  for each row execute function public.meetings_before_insert();

-- ------------------------------------------------------------
-- DOCS — páginas estilo Notion (árbol por parent_id)
-- content: bloques de BlockNote (jsonb). content_text: texto plano para búsqueda.
-- import_markdown: markdown pendiente de convertir (lo convierte el editor al abrir).
-- ------------------------------------------------------------
create table public.docs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  parent_id        uuid references public.docs(id) on delete cascade,
  title            text not null default '',
  icon             text,
  content          jsonb not null default '[]'::jsonb,
  content_text     text not null default '',
  import_markdown  text,
  source           text not null default 'manual' check (source in ('manual', 'meeting', 'claude', 'import')),
  meeting_id       uuid references public.meetings(id) on delete set null,
  position         double precision not null default 0,
  created_by       uuid references public.profiles(id) on delete set null,
  updated_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

create index docs_workspace_parent_idx on public.docs(workspace_id, parent_id, position);
create index docs_meeting_idx on public.docs(meeting_id);
create index docs_updated_idx on public.docs(workspace_id, updated_at desc);

create trigger docs_updated_at before update on public.docs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- TASKS
-- ------------------------------------------------------------
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  number            integer not null default 0,
  title             text not null check (char_length(trim(title)) between 1 and 500),
  description       jsonb,
  description_text  text not null default '',
  status            text not null default 'todo' check (status in ('backlog', 'todo', 'in_progress', 'blocked', 'done')),
  priority          text not null default 'none' check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  assignee_id       uuid references public.profiles(id) on delete set null,
  due_date          date,
  labels            text[] not null default '{}',
  position          double precision not null default 0,
  parent_id         uuid references public.tasks(id) on delete cascade,
  doc_id            uuid references public.docs(id) on delete set null,
  doc_block_id      text,
  meeting_id        uuid references public.meetings(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, number)
);

create index tasks_workspace_status_idx on public.tasks(workspace_id, status, position);
create index tasks_assignee_due_idx on public.tasks(assignee_id, due_date);
create index tasks_doc_idx on public.tasks(doc_id);
create index tasks_meeting_idx on public.tasks(meeting_id);
create index tasks_parent_idx on public.tasks(parent_id);

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_comments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(trim(body)) between 1 and 10000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments(task_id, created_at);

create trigger task_comments_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- GOOGLE CONNECTIONS — tokens cifrados por la app (AES-256-GCM).
-- Sin policies: solo service_role puede leer/escribir.
-- ------------------------------------------------------------
create table public.google_connections (
  user_id                  uuid primary key references public.profiles(id) on delete cascade,
  google_email             text not null,
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  scopes                   text[] not null default '{}',
  selected_calendar_ids    text[] not null default '{primary}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger google_connections_updated_at before update on public.google_connections
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- API TOKENS — para que Claude (u otras herramientas) creen docs vía API.
-- Solo se guarda el hash sha256. Sin policies: solo service_role.
-- ------------------------------------------------------------
create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  token_hash    text not null unique,
  token_prefix  text not null,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index api_tokens_user_idx on public.api_tokens(user_id);

-- ============================================================
-- Funciones de permisos (SECURITY DEFINER para evitar recursión en RLS)
-- ============================================================

create or replace function public.is_account_member(p_account uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = p_account and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_account_admin(p_account uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = p_account
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

-- Rol efectivo de un usuario en un espacio: admins de cuenta = 'admin' en todos.
create or replace function public.workspace_role_for(p_workspace uuid, p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists (
      select 1
      from workspaces w
      join account_members am on am.account_id = w.account_id
      where w.id = p_workspace and am.user_id = p_user and am.role in ('owner', 'admin')
    ) then 'admin'
    else (
      select wm.role from workspace_members wm
      where wm.workspace_id = p_workspace and wm.user_id = p_user
    )
  end;
$$;

create or replace function public.workspace_role(p_workspace uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select public.workspace_role_for(p_workspace, (select auth.uid()));
$$;

create or replace function public.can_access_workspace(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.workspace_role(p_workspace) is not null;
$$;

create or replace function public.can_edit_workspace(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.workspace_role(p_workspace) in ('admin', 'editor'), false);
$$;

create or replace function public.is_workspace_admin(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.workspace_role(p_workspace) = 'admin', false);
$$;

create or replace function public.shares_account_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from account_members mine
    join account_members theirs on theirs.account_id = mine.account_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

-- Conjuntos de espacios del usuario actual (se evalúan una vez por query en RLS)
create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select w.id
  from workspaces w
  join account_members am on am.account_id = w.account_id
  where am.user_id = (select auth.uid()) and am.role in ('owner', 'admin')
  union
  select wm.workspace_id from workspace_members wm
  where wm.user_id = (select auth.uid());
$$;

create or replace function public.my_editable_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select w.id
  from workspaces w
  join account_members am on am.account_id = w.account_id
  where am.user_id = (select auth.uid()) and am.role in ('owner', 'admin')
  union
  select wm.workspace_id from workspace_members wm
  where wm.user_id = (select auth.uid()) and wm.role in ('admin', 'editor');
$$;

-- ============================================================
-- Triggers de integridad y límites de plan
-- ============================================================

-- Límite de espacios por plan
create or replace function public.enforce_workspace_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
  v_count integer;
begin
  select p.max_workspaces into v_max
  from accounts a join plans p on p.id = a.plan_id
  where a.id = new.account_id;

  if v_max is not null then
    select count(*) into v_count
    from workspaces where account_id = new.account_id and archived_at is null;
    if v_count >= v_max then
      raise exception 'plan_limit_workspaces' using errcode = 'P0001', hint = v_max::text;
    end if;
  end if;
  return new;
end;
$$;

create trigger workspaces_enforce_limit before insert on public.workspaces
  for each row execute function public.enforce_workspace_limit();

-- Límite de miembros por plan
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
  v_count integer;
begin
  select p.max_members into v_max
  from accounts a join plans p on p.id = a.plan_id
  where a.id = new.account_id;

  if v_max is not null then
    select count(*) into v_count from account_members where account_id = new.account_id;
    if v_count >= v_max then
      raise exception 'plan_limit_members' using errcode = 'P0001', hint = v_max::text;
    end if;
  end if;
  return new;
end;
$$;

create trigger account_members_enforce_limit before insert on public.account_members
  for each row execute function public.enforce_member_limit();

-- Un miembro de espacio debe pertenecer a la cuenta del espacio
create or replace function public.ensure_workspace_member_in_account()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from workspaces w
    join account_members am on am.account_id = w.account_id
    where w.id = new.workspace_id and am.user_id = new.user_id
  ) then
    raise exception 'member_not_in_account' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger workspace_members_check_account before insert or update on public.workspace_members
  for each row execute function public.ensure_workspace_member_in_account();

-- Al salir de la cuenta, sale de todos sus espacios
create or replace function public.cleanup_workspace_memberships()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from workspace_members wm
  using workspaces w
  where wm.workspace_id = w.id
    and w.account_id = old.account_id
    and wm.user_id = old.user_id;
  return old;
end;
$$;

create trigger account_members_cleanup after delete on public.account_members
  for each row execute function public.cleanup_workspace_memberships();

-- El dueño de la cuenta no se puede degradar ni eliminar
create or replace function public.protect_account_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'owner' then
    if tg_op = 'DELETE' then
      -- permitido solo si la cuenta se está borrando (cascade)
      if exists (select 1 from accounts where id = old.account_id) then
        raise exception 'cannot_remove_owner' using errcode = 'P0001';
      end if;
      return old;
    end if;
    if new.role <> 'owner' then
      raise exception 'cannot_remove_owner' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and new.role = 'owner' then
    raise exception 'cannot_assign_owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger account_members_protect_owner before update or delete on public.account_members
  for each row execute function public.protect_account_owner();

-- Numeración por espacio (PRO-1, PRO-2...) y completed_at
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce((select auth.uid()), new.created_by);
  else
    new.created_by = old.created_by;
    new.number = old.number;
  end if;

  if tg_op = 'INSERT' or new.workspace_id <> old.workspace_id then
    update workspaces set task_seq = task_seq + 1
    where id = new.workspace_id
    returning task_seq into new.number;
  end if;

  if new.status = 'done' then
    new.completed_at = case when tg_op = 'UPDATE' and old.status = 'done' then old.completed_at else now() end;
  else
    new.completed_at = null;
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.workspace_id <> old.workspace_id)
     and public.workspace_role_for(new.workspace_id, new.assignee_id) is null then
    raise exception 'assignee_not_in_workspace' using errcode = 'P0001';
  end if;

  if new.parent_id is not null and not exists (
    select 1 from tasks where id = new.parent_id and workspace_id = new.workspace_id
  ) then
    raise exception 'parent_task_other_workspace' using errcode = 'P0001';
  end if;

  if new.doc_id is not null and not exists (
    select 1 from docs where id = new.doc_id and workspace_id = new.workspace_id
  ) then
    new.doc_id = null;
    new.doc_block_id = null;
  end if;

  if new.meeting_id is not null and not exists (
    select 1 from meetings where id = new.meeting_id and workspace_id = new.workspace_id
  ) then
    new.meeting_id = null;
  end if;

  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Docs: el padre debe estar en el mismo espacio; no se mueven entre espacios
create or replace function public.docs_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception 'doc_workspace_immutable' using errcode = 'P0001';
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'doc_parent_self' using errcode = 'P0001';
    end if;
    if not exists (select 1 from docs where id = new.parent_id and workspace_id = new.workspace_id) then
      raise exception 'doc_parent_other_workspace' using errcode = 'P0001';
    end if;
    -- evitar ciclos: el nuevo padre no puede ser descendiente del doc
    if tg_op = 'UPDATE' and exists (
      with recursive chain as (
        select id, parent_id from docs where id = new.parent_id
        union all
        select d.id, d.parent_id from docs d join chain c on d.id = c.parent_id
      )
      select 1 from chain where id = new.id
    ) then
      raise exception 'doc_parent_cycle' using errcode = 'P0001';
    end if;
  end if;

  if new.meeting_id is not null and not exists (
    select 1 from meetings where id = new.meeting_id and workspace_id = new.workspace_id
  ) then
    new.meeting_id = null;
  end if;

  if tg_op = 'INSERT' then
    new.created_by = coalesce((select auth.uid()), new.created_by);
  else
    new.created_by = old.created_by;
  end if;
  new.updated_by = coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

create trigger docs_before_write before insert or update on public.docs
  for each row execute function public.docs_before_write();

-- Comentarios: workspace_id se toma de la tarea; autor = usuario actual
create or replace function public.task_comments_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.user_id = coalesce((select auth.uid()), new.user_id);
  select workspace_id into new.workspace_id from tasks where id = new.task_id;
  if new.workspace_id is null then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger task_comments_before_insert before insert on public.task_comments
  for each row execute function public.task_comments_before_insert();

-- ============================================================
-- Alta de usuarios: crea el perfil
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, email, full_name, avatar_url, locale, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    -- Google y Apple (OAuth) entregan la foto en avatar_url o picture
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when v_locale in ('en', 'es', 'pt', 'fr') then v_locale else 'es' end,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para usuarios que ya existían (v1)
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1))
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- ============================================================
-- RPCs
-- ============================================================

-- Onboarding: crea la cuenta del usuario actual (si aún no pertenece a ninguna)
create or replace function public.create_account(p_name text)
returns public.accounts
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_account public.accounts;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if exists (select 1 from account_members where user_id = v_uid) then
    raise exception 'already_in_account' using errcode = 'P0001';
  end if;

  select id into v_plan from plans where is_default order by created_at limit 1;

  insert into accounts (name, plan_id, owner_id)
  values (trim(p_name), coalesce(v_plan, 'free'), v_uid)
  returning * into v_account;

  insert into account_members (account_id, user_id, role)
  values (v_account.id, v_uid, 'owner');

  return v_account;
end;
$$;

-- Crea un espacio (valida admin de cuenta, límite de plan, slug único)
create or replace function public.create_workspace(
  p_account_id uuid,
  p_name text,
  p_slug text,
  p_key text,
  p_icon text default '',
  p_color text default 'violet',
  p_description text default null
)
returns public.workspaces
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_base text;
  v_slug text;
  v_key text;
  v_n integer := 1;
  v_ws public.workspaces;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not public.is_account_admin(p_account_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  v_base := lower(regexp_replace(coalesce(nullif(p_slug, ''), 'espacio'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'espacio'; end if;
  v_base := left(v_base, 48);
  v_slug := v_base;
  while exists (select 1 from workspaces where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  v_key := upper(regexp_replace(coalesce(p_key, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_key := left(v_key, 5);
  if char_length(v_key) < 2 then v_key := 'WS'; end if;

  insert into workspaces (account_id, name, slug, key, icon, color, description, created_by)
  values (p_account_id, trim(p_name), v_slug, v_key, coalesce(nullif(upper(left(trim(p_icon), 2)), ''), upper(left(trim(p_name), 1))), coalesce(nullif(p_color, ''), 'violet'), p_description, v_uid)
  returning * into v_ws;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_ws.id, v_uid, 'admin');

  return v_ws;
end;
$$;

-- Estado de Google Calendar del usuario actual (sin exponer tokens)
create or replace function public.get_my_google_connection()
returns table (google_email text, selected_calendar_ids text[], connected_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select google_email, selected_calendar_ids, created_at
  from google_connections
  where user_id = (select auth.uid());
$$;

-- Uso del plan de una cuenta
create or replace function public.get_account_usage(p_account uuid)
returns table (
  plan_id text,
  plan_name text,
  max_workspaces integer,
  max_members integer,
  workspaces_count integer,
  members_count integer
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.max_workspaces, p.max_members,
    (select count(*)::int from workspaces w where w.account_id = a.id and w.archived_at is null),
    (select count(*)::int from account_members m where m.account_id = a.id)
  from accounts a
  join plans p on p.id = a.plan_id
  where a.id = p_account and public.is_account_member(p_account);
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.meetings enable row level security;
alter table public.docs enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.google_connections enable row level security;
alter table public.api_tokens enable row level security;

-- plans
create policy plans_select on public.plans for select to authenticated using (true);

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_account_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- accounts
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_account_member(id));
create policy accounts_update on public.accounts for update to authenticated
  using (public.is_account_admin(id)) with check (public.is_account_admin(id));

-- account_members
create policy account_members_select on public.account_members for select to authenticated
  using (public.is_account_member(account_id));
create policy account_members_insert on public.account_members for insert to authenticated
  with check (public.is_account_admin(account_id) and role <> 'owner');
create policy account_members_update on public.account_members for update to authenticated
  using (public.is_account_admin(account_id)) with check (public.is_account_admin(account_id));
create policy account_members_delete on public.account_members for delete to authenticated
  using (public.is_account_admin(account_id));

-- workspaces (alta solo vía create_workspace)
create policy workspaces_select on public.workspaces for select to authenticated
  using (id in (select public.my_workspace_ids()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.is_account_admin(account_id));

-- workspace_members
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (public.is_workspace_admin(workspace_id) or user_id = (select auth.uid()));

-- meetings / docs / tasks: leer = acceso al espacio, escribir = editor
create policy meetings_select on public.meetings for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meetings_update on public.meetings for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meetings_delete on public.meetings for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));

create policy docs_select on public.docs for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy docs_insert on public.docs for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy docs_update on public.docs for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy docs_delete on public.docs for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));

create policy tasks_select on public.tasks for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy tasks_update on public.tasks for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));

-- task_comments: cualquiera con acceso comenta; solo el autor edita/borra
create policy task_comments_select on public.task_comments for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_workspace(workspace_id));
create policy task_comments_update on public.task_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- Privilegios por columna (lo que RLS no cubre)
-- ============================================================
revoke all on public.google_connections, public.api_tokens from anon, authenticated;

revoke insert, update on public.accounts from anon, authenticated;
grant update (name) on public.accounts to authenticated;

revoke insert, update on public.workspaces from anon, authenticated;
grant update (name, icon, color, description, archived_at) on public.workspaces to authenticated;

revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, locale, timezone, must_change_password) on public.profiles to authenticated;

revoke all on public.plans from anon;
revoke insert, update, delete on public.plans from authenticated;

-- Las funciones son ejecutables por PUBLIC por defecto: restringir las RPC
revoke execute on function public.create_account(text) from public, anon;
revoke execute on function public.create_workspace(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.get_my_google_connection() from public, anon;
revoke execute on function public.get_account_usage(uuid) from public, anon;
grant execute on function public.create_account(text) to authenticated, service_role;
grant execute on function public.create_workspace(uuid, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.get_my_google_connection() to authenticated, service_role;
grant execute on function public.get_account_usage(uuid) to authenticated, service_role;

-- workspace_role_for recibe cualquier usuario: solo para uso interno y service_role
revoke execute on function public.workspace_role_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.workspace_role_for(uuid, uuid) to service_role;
-- ============================================================
-- Veltro v2 — Storage: adjuntos de docs y tareas
-- Bucket privado. Ruta: {workspace_id}/{uuid}-{archivo}
-- El editor resuelve URLs firmadas al mostrar cada archivo.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520)
on conflict (id) do nothing;

create or replace function public.storage_workspace_id(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end;
$$;

create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_workspace_ids())
  );

create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_editable_workspace_ids())
  );

create policy attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_editable_workspace_ids())
  );
-- ============================================================
-- Veltro v2: ciclo de reunión (Preparar → En vivo → Cerrar)
--
-- meetings.phase      fase actual de la reunión
-- meetings.series_key agrupa ocurrencias de una reunión recurrente
--                     (recurringEventId de Google) para arrastrar pendientes
-- meeting_items       lo que se captura: agenda, nota, decisión, acción, pregunta.
--                     Las decisiones forman el registro de acuerdos del espacio;
--                     las acciones se convierten en tareas al cerrar.
-- ============================================================

alter table public.meetings
  add column if not exists series_key text,
  add column if not exists phase text not null default 'prep' check (phase in ('prep', 'live', 'closed')),
  add column if not exists summary text,
  add column if not exists follow_up text,
  add column if not exists closed_at timestamptz;

create index if not exists meetings_series_idx on public.meetings(workspace_id, series_key, starts_at desc);

create table public.meeting_items (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('agenda', 'note', 'decision', 'action', 'question')),
  text          text not null default '' check (char_length(text) <= 2000),
  assignee_id   uuid references public.profiles(id) on delete set null,
  due_date      date,
  task_id       uuid references public.tasks(id) on delete set null,
  done          boolean not null default false,
  source        text not null default 'manual' check (source in ('manual', 'assistant', 'carry')),
  position      double precision not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index meeting_items_meeting_idx on public.meeting_items(meeting_id, position);
create index meeting_items_workspace_kind_idx on public.meeting_items(workspace_id, kind, created_at desc);
create index meeting_items_task_idx on public.meeting_items(task_id);

create trigger meeting_items_updated_at before update on public.meeting_items
  for each row execute function public.set_updated_at();

-- workspace_id siempre el de la reunión; autor = usuario actual
create or replace function public.meeting_items_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select workspace_id into new.workspace_id from meetings where id = new.meeting_id;
  if new.workspace_id is null then
    raise exception 'meeting_not_found' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.created_by = coalesce((select auth.uid()), new.created_by);
  else
    new.created_by = old.created_by;
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and public.workspace_role_for(new.workspace_id, new.assignee_id) is null then
    raise exception 'assignee_not_in_workspace' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger meeting_items_before_write before insert or update on public.meeting_items
  for each row execute function public.meeting_items_before_write();

alter table public.meeting_items enable row level security;

create policy meeting_items_select on public.meeting_items for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy meeting_items_insert on public.meeting_items for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meeting_items_update on public.meeting_items for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meeting_items_delete on public.meeting_items for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));
-- ============================================================
-- Veltro v2: adjuntos y campos de tareas
--
-- attachments  archivos (Storage) o links, que pertenecen a una tarea,
--              una reunión y/o un doc, o directamente al espacio.
--              Una reunión puede producir adjuntos igual que produce tareas.
-- tasks        + start_date, estimate_hours, custom (valores de campos propios)
-- workspaces   + task_fields: definición de campos propios del espacio
--              [{ "id": "f_xxx", "name": "Cliente", "type": "text|number|date|select|url", "options": ["A","B"] }]
-- ============================================================

alter table public.tasks
  add column if not exists start_date date,
  add column if not exists estimate_hours numeric(7, 2) check (estimate_hours is null or estimate_hours >= 0),
  add column if not exists custom jsonb not null default '{}'::jsonb;

alter table public.workspaces
  add column if not exists task_fields jsonb not null default '[]'::jsonb;

grant update (task_fields) on public.workspaces to authenticated;

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  meeting_id    uuid references public.meetings(id) on delete set null,
  doc_id        uuid references public.docs(id) on delete set null,
  kind          text not null default 'file' check (kind in ('file', 'link')),
  name          text not null check (char_length(trim(name)) between 1 and 300),
  storage_path  text,
  url           text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);

create index attachments_workspace_idx on public.attachments(workspace_id, created_at desc);
create index attachments_task_idx on public.attachments(task_id);
create index attachments_meeting_idx on public.attachments(meeting_id);
create index attachments_doc_idx on public.attachments(doc_id);

-- Integridad: lo vinculado debe ser del mismo espacio; el archivo debe vivir en la carpeta del espacio
create or replace function public.attachments_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by = coalesce((select auth.uid()), new.uploaded_by);
  else
    new.uploaded_by = old.uploaded_by;
    new.workspace_id = old.workspace_id;
  end if;
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.meeting_id is not null and not exists (select 1 from meetings where id = new.meeting_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.doc_id is not null and not exists (select 1 from docs where id = new.doc_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.kind = 'file' and split_part(new.storage_path, '/', 1) <> new.workspace_id::text then
    raise exception 'attachment_bad_path' using errcode = 'P0001';
  end if;
  if new.kind = 'link' and new.url !~* '^https?://' then
    raise exception 'attachment_bad_url' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger attachments_before_write before insert or update on public.attachments
  for each row execute function public.attachments_before_write();

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy attachments_update on public.attachments for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy attachments_delete on public.attachments for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));

-- Extracto del doc para vistas previas en listas (sin traer el contenido completo)
alter table public.docs
  add column if not exists excerpt text generated always as (left(content_text, 240)) stored;
-- ============================================================
-- Veltro v2: consola de administración (veltro-console)
--
-- platform_admins   equipo de Veltro con acceso a la consola, con rol
-- accounts          + status (active | suspended)
-- profiles          + last_seen_at, suspended_at
-- plans             + precios, moneda, visibilidad y orden
-- subscriptions     suscripción vigente de cada cuenta (manual hoy; Stripe después)
-- payments          cobros registrados
-- user_sessions     conexiones: una fila por sesión, se extiende con touch_presence()
-- usage_events      qué se usa: escrituras (triggers) y vistas (track_events())
-- admin_notes       notas internas sobre usuarios y cuentas
-- admin_audit_log   todo lo que hace el equipo desde la consola
--
-- Las funciones admin_* son SECURITY DEFINER y exigen ser admin de plataforma.
-- Las tablas nuevas no tienen policies de escritura: solo se tocan vía funciones.
--
-- Primer admin (una sola vez, en el SQL Editor):
--   insert into public.platform_admins (user_id, role)
--   select id, 'owner' from public.profiles where email = 'tu@correo.com';
-- ============================================================

-- ------------------------------------------------------------
-- Equipo de plataforma
-- ------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('owner', 'admin', 'support', 'finance', 'viewer')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.platform_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from platform_admins where user_id = (select auth.uid());
$$;

-- Exige ser admin de plataforma (y uno de los roles, si se indican). owner siempre pasa.
create or replace function public.platform_assert(p_roles text[] default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role text := public.platform_role();
begin
  if v_role is null or (p_roles is not null and v_role <> 'owner' and not (v_role = any (p_roles))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- ------------------------------------------------------------
-- Estado de cuentas y usuarios
-- ------------------------------------------------------------
alter table public.accounts
  add column if not exists status text not null default 'active' check (status in ('active', 'suspended')),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists suspended_at timestamptz;

create index if not exists profiles_last_seen_idx on public.profiles(last_seen_at desc nulls last);

-- Una cuenta suspendida o un usuario suspendido pierden el acceso a los espacios.
-- Todas las policies pasan por estas tres funciones, así que basta con redefinirlas.
create or replace function public.workspace_role_for(p_workspace uuid, p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when not exists (
      select 1 from workspaces w join accounts a on a.id = w.account_id
      where w.id = p_workspace and a.status = 'active'
    ) then null
    when exists (select 1 from profiles where id = p_user and suspended_at is not null) then null
    when exists (
      select 1
      from workspaces w
      join account_members am on am.account_id = w.account_id
      where w.id = p_workspace and am.user_id = p_user and am.role in ('owner', 'admin')
    ) then 'admin'
    else (
      select wm.role from workspace_members wm
      where wm.workspace_id = p_workspace and wm.user_id = p_user
    )
  end;
$$;

create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select w.id
  from workspaces w
  join accounts a on a.id = w.account_id and a.status = 'active'
  join account_members am on am.account_id = w.account_id
  where am.user_id = (select auth.uid()) and am.role in ('owner', 'admin')
    and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null)
  union
  select wm.workspace_id
  from workspace_members wm
  join workspaces w on w.id = wm.workspace_id
  join accounts a on a.id = w.account_id and a.status = 'active'
  where wm.user_id = (select auth.uid())
    and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null);
$$;

create or replace function public.my_editable_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select w.id
  from workspaces w
  join accounts a on a.id = w.account_id and a.status = 'active'
  join account_members am on am.account_id = w.account_id
  where am.user_id = (select auth.uid()) and am.role in ('owner', 'admin')
    and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null)
  union
  select wm.workspace_id
  from workspace_members wm
  join workspaces w on w.id = wm.workspace_id
  join accounts a on a.id = w.account_id and a.status = 'active'
  where wm.user_id = (select auth.uid()) and wm.role in ('admin', 'editor')
    and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null);
$$;

-- ------------------------------------------------------------
-- Planes con precio
-- ------------------------------------------------------------
alter table public.plans
  add column if not exists description text,
  add column if not exists price_monthly_cents integer not null default 0 check (price_monthly_cents >= 0),
  add column if not exists price_yearly_cents integer check (price_yearly_cents is null or price_yearly_cents >= 0),
  add column if not exists currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists is_public boolean not null default true,
  add column if not exists sort integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists plans_single_default on public.plans ((true)) where is_default;

drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Suscripciones: una vigente por cuenta. accounts.plan_id sigue siendo
-- la fuente de los límites; un trigger lo mantiene sincronizado.
-- ------------------------------------------------------------
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  account_id                uuid not null unique references public.accounts(id) on delete cascade,
  plan_id                   text not null references public.plans(id),
  status                    text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  billing_interval          text not null default 'month' check (billing_interval in ('month', 'year')),
  unit_amount_cents         integer not null default 0 check (unit_amount_cents >= 0),
  currency                  text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  trial_ends_at             timestamptz,
  cancel_at_period_end      boolean not null default false,
  canceled_at               timestamptz,
  provider                  text not null default 'manual' check (provider in ('manual', 'stripe')),
  provider_customer_id      text,
  provider_subscription_id  text unique,
  started_at                timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_status_idx on public.subscriptions(status);
create index subscriptions_period_end_idx on public.subscriptions(current_period_end);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- MRR de una suscripción (centavos/mes). Las de prueba y las pausadas no cuentan.
create or replace function public.subscription_mrr_cents(p_status text, p_interval text, p_amount integer)
returns integer
language sql immutable
as $$
  select case
    when p_status not in ('active', 'past_due') then 0
    when p_interval = 'year' then round(p_amount / 12.0)::int
    else p_amount
  end;
$$;

create or replace function public.subscriptions_sync_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan text;
begin
  if new.status in ('trialing', 'active', 'past_due') then
    v_plan := new.plan_id;
  else
    select id into v_plan from plans where is_default limit 1;
  end if;
  update accounts set plan_id = coalesce(v_plan, 'free')
  where id = new.account_id and plan_id is distinct from coalesce(v_plan, 'free');
  return new;
end;
$$;

create trigger subscriptions_sync_plan after insert or update of plan_id, status on public.subscriptions
  for each row execute function public.subscriptions_sync_plan();

-- Toda cuenta nueva nace con su suscripción (del plan por defecto, sin costo)
create or replace function public.accounts_create_subscription()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into subscriptions (account_id, plan_id, status, unit_amount_cents, currency, current_period_start, started_at)
  select new.id, p.id, 'active', p.price_monthly_cents, p.currency, new.created_at, new.created_at
  from plans p where p.id = new.plan_id
  on conflict (account_id) do nothing;
  return new;
end;
$$;

create trigger accounts_create_subscription after insert on public.accounts
  for each row execute function public.accounts_create_subscription();

insert into public.subscriptions (account_id, plan_id, status, unit_amount_cents, currency, current_period_start, started_at)
select a.id, a.plan_id, 'active', p.price_monthly_cents, p.currency, a.created_at, a.created_at
from public.accounts a join public.plans p on p.id = a.plan_id
on conflict (account_id) do nothing;

-- ------------------------------------------------------------
-- Pagos
-- ------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated by default as identity unique,
  account_id       uuid not null references public.accounts(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  amount_cents     integer not null check (amount_cents >= 0),
  refunded_cents   integer not null default 0 check (refunded_cents >= 0),
  currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status           text not null default 'paid' check (status in ('paid', 'pending', 'failed', 'refunded')),
  description      text check (description is null or char_length(description) <= 300),
  period_start     date,
  period_end       date,
  method           text check (method is null or method in ('card', 'transfer', 'cash', 'other')),
  card_brand       text,
  card_last4       text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  failure_reason   text,
  provider         text not null default 'manual' check (provider in ('manual', 'stripe')),
  provider_ref     text unique,
  paid_at          timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (refunded_cents <= amount_cents)
);

create index payments_account_idx on public.payments(account_id, created_at desc);
create index payments_status_idx on public.payments(status, created_at desc);
create index payments_paid_idx on public.payments(paid_at desc);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Conexiones
-- ------------------------------------------------------------
create table public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  pings         integer not null default 1,
  ip            text,
  country       text check (country is null or country ~ '^[A-Z]{2}$'),
  user_agent    text,
  device        text check (device is null or device in ('desktop', 'mobile', 'tablet')),
  browser       text,
  os            text
);

create index user_sessions_user_idx on public.user_sessions(user_id, last_seen_at desc);
create index user_sessions_seen_idx on public.user_sessions(last_seen_at desc);
create index user_sessions_started_idx on public.user_sessions(started_at desc);

-- Latido del cliente: extiende la sesión abierta (30 min sin latidos = sesión nueva).
create or replace function public.touch_presence(p_client jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_headers jsonb;
  v_ip text;
  v_ua text;
  v_country text;
  v_session uuid;
  v_last timestamptz;
begin
  if v_uid is null then
    return;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '');
  v_ua := left(coalesce(v_headers ->> 'user-agent', p_client ->> 'ua'), 400);
  v_country := upper(coalesce(v_headers ->> 'cf-ipcountry', p_client ->> 'country', ''));
  if v_country !~ '^[A-Z]{2}$' or v_country = 'XX' then
    v_country := null;
  end if;

  select id, last_seen_at into v_session, v_last
  from user_sessions
  where user_id = v_uid
    and last_seen_at > now() - interval '30 minutes'
    and coalesce(user_agent, '') = coalesce(v_ua, '')
  order by last_seen_at desc
  limit 1;

  if v_session is not null then
    if v_last > now() - interval '45 seconds' then
      return;
    end if;
    update user_sessions
    set last_seen_at = now(), pings = pings + 1, ip = coalesce(v_ip, ip)
    where id = v_session;
  else
    insert into user_sessions (user_id, ip, country, user_agent, device, browser, os)
    values (
      v_uid, v_ip, v_country, v_ua,
      case when p_client ->> 'device' in ('desktop', 'mobile', 'tablet') then p_client ->> 'device' end,
      left(p_client ->> 'browser', 40),
      left(p_client ->> 'os', 40)
    );
  end if;

  update profiles set last_seen_at = now() where id = v_uid;
end;
$$;

-- ------------------------------------------------------------
-- Uso: eventos del producto
-- ------------------------------------------------------------
create table public.usage_events (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  event         text not null check (event ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,3}$'),
  user_id       uuid references public.profiles(id) on delete set null,
  account_id    uuid references public.accounts(id) on delete cascade,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  props         jsonb not null default '{}'::jsonb
);

create index usage_events_time_idx on public.usage_events(occurred_at desc);
create index usage_events_event_time_idx on public.usage_events(event, occurred_at desc);
create index usage_events_user_time_idx on public.usage_events(user_id, occurred_at desc);
create index usage_events_account_time_idx on public.usage_events(account_id, occurred_at desc);

-- Registra un evento. Nunca rompe la escritura que lo origina.
create or replace function public.log_usage(
  p_event text,
  p_account uuid,
  p_workspace uuid,
  p_user uuid default null,
  p_props jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into usage_events (event, user_id, account_id, workspace_id, props)
  values (
    p_event,
    coalesce((select auth.uid()), p_user),
    coalesce(p_account, (select account_id from workspaces where id = p_workspace)),
    p_workspace,
    coalesce(p_props, '{}'::jsonb)
  );
exception when others then
  null;
end;
$$;

create or replace function public.usage_on_tasks()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform log_usage('task.created', null, new.workspace_id, new.created_by,
      jsonb_strip_nulls(jsonb_build_object(
        'from_meeting', case when new.meeting_id is not null then true end,
        'from_doc', case when new.doc_id is not null then true end,
        'subtask', case when new.parent_id is not null then true end)));
    return null;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    perform log_usage('task.completed', null, new.workspace_id, null,
      jsonb_build_object('hours', round(extract(epoch from now() - new.created_at) / 3600)));
  end if;
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    perform log_usage('task.assigned', null, new.workspace_id);
  end if;
  if new.custom is distinct from old.custom then
    perform log_usage('task.custom_field', null, new.workspace_id);
  end if;
  return null;
end;
$$;

create trigger tasks_usage after insert or update of status, assignee_id, custom on public.tasks
  for each row execute function public.usage_on_tasks();

create or replace function public.usage_on_docs()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('doc.created', null, new.workspace_id, new.created_by, jsonb_build_object('source', new.source));
  return null;
end;
$$;

create trigger docs_usage after insert on public.docs
  for each row execute function public.usage_on_docs();

create or replace function public.usage_on_meetings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform log_usage('meeting.linked', null, new.workspace_id, new.created_by);
  elsif new.phase is distinct from old.phase then
    perform log_usage(case new.phase when 'live' then 'meeting.started' when 'closed' then 'meeting.closed' else 'meeting.reopened' end,
      null, new.workspace_id);
  end if;
  return null;
end;
$$;

create trigger meetings_usage after insert or update of phase on public.meetings
  for each row execute function public.usage_on_meetings();

create or replace function public.usage_on_meeting_items()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('meeting.captured', null, new.workspace_id, new.created_by,
    jsonb_build_object('kind', new.kind, 'source', new.source));
  return null;
end;
$$;

create trigger meeting_items_usage after insert on public.meeting_items
  for each row execute function public.usage_on_meeting_items();

create or replace function public.usage_on_attachments()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('attachment.added', null, new.workspace_id, new.uploaded_by,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', new.kind,
      'bytes', new.size_bytes,
      'on', case when new.task_id is not null then 'task' when new.meeting_id is not null then 'meeting' when new.doc_id is not null then 'doc' else 'workspace' end)));
  return null;
end;
$$;

create trigger attachments_usage after insert on public.attachments
  for each row execute function public.usage_on_attachments();

create or replace function public.usage_on_comments()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('comment.created', null, new.workspace_id, new.user_id);
  return null;
end;
$$;

create trigger task_comments_usage after insert on public.task_comments
  for each row execute function public.usage_on_comments();

create or replace function public.usage_on_workspaces()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('workspace.created', new.account_id, new.id, new.created_by);
  return null;
end;
$$;

create trigger workspaces_usage after insert on public.workspaces
  for each row execute function public.usage_on_workspaces();

create or replace function public.usage_on_account_members()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'owner' then
    perform log_usage('account.created', new.account_id, null, new.user_id);
  else
    perform log_usage('member.added', new.account_id, null, null, jsonb_build_object('role', new.role));
  end if;
  return null;
end;
$$;

create trigger account_members_usage after insert on public.account_members
  for each row execute function public.usage_on_account_members();

create or replace function public.usage_on_profiles()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('user.signed_up', null, null, new.id,
    jsonb_build_object('provider', coalesce((select raw_app_meta_data ->> 'provider' from auth.users where id = new.id), 'email')));
  return null;
end;
$$;

create trigger profiles_usage after insert on public.profiles
  for each row execute function public.usage_on_profiles();

create or replace function public.usage_on_integrations()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage(case tg_table_name when 'google_connections' then 'integration.google_connected' else 'integration.api_token' end,
    (select account_id from account_members where user_id = new.user_id order by created_at limit 1), null, new.user_id);
  return null;
end;
$$;

create trigger google_connections_usage after insert on public.google_connections
  for each row execute function public.usage_on_integrations();
create trigger api_tokens_usage after insert on public.api_tokens
  for each row execute function public.usage_on_integrations();

-- Eventos de vista y de funciones del cliente: view.* y feature.*
create or replace function public.track_events(p_events jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e jsonb;
  v_ws uuid;
  v_acc uuid;
  v_n integer := 0;
begin
  if v_uid is null or jsonb_typeof(p_events) <> 'array' then
    return;
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    v_n := v_n + 1;
    exit when v_n > 25;
    continue when coalesce(e ->> 'event', '') !~ '^(view|feature)\.[a-z0-9_]+(\.[a-z0-9_]+)?$';

    v_ws := null;
    v_acc := null;
    begin
      v_ws := (e ->> 'workspace_id')::uuid;
    exception when others then
      v_ws := null;
    end;
    begin
      v_acc := (e ->> 'account_id')::uuid;
    exception when others then
      v_acc := null;
    end;
    if v_ws is not null and v_ws not in (select public.my_workspace_ids()) then
      v_ws := null;
    end if;
    if v_ws is not null then
      select account_id into v_acc from workspaces where id = v_ws;
    elsif v_acc is not null and not public.is_account_member(v_acc) then
      v_acc := null;
    end if;

    insert into usage_events (event, user_id, account_id, workspace_id, props)
    values (
      e ->> 'event', v_uid, v_acc, v_ws,
      case when jsonb_typeof(e -> 'props') = 'object' and length((e -> 'props')::text) <= 500 then e -> 'props' else '{}'::jsonb end
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Notas internas y auditoría
-- ------------------------------------------------------------
create table public.admin_notes (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('user', 'account')),
  subject_id    uuid not null,
  body          text not null check (char_length(trim(body)) between 1 and 4000),
  author_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index admin_notes_subject_idx on public.admin_notes(subject_type, subject_id, created_at desc);

create table public.admin_audit_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  subject_type  text,
  subject_id    text,
  summary       text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index admin_audit_log_time_idx on public.admin_audit_log(created_at desc);
create index admin_audit_log_subject_idx on public.admin_audit_log(subject_type, subject_id, created_at desc);

create or replace function public.platform_log(
  p_action text,
  p_subject_type text,
  p_subject_id text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql security definer set search_path = public
as $$
  insert into admin_audit_log (actor_id, action, subject_type, subject_id, summary, details)
  values ((select auth.uid()), p_action, p_subject_type, p_subject_id, p_summary, coalesce(p_details, '{}'::jsonb));
$$;

-- ------------------------------------------------------------
-- RLS de las tablas nuevas
-- ------------------------------------------------------------
alter table public.platform_admins enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.user_sessions enable row level security;
alter table public.usage_events enable row level security;
alter table public.admin_notes enable row level security;
alter table public.admin_audit_log enable row level security;

-- Los miembros ven la suscripción de su cuenta; los admins de cuenta, sus pagos; cada uno, sus sesiones.
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_account_member(account_id));
create policy payments_select on public.payments for select to authenticated
  using (public.is_account_admin(account_id));
create policy user_sessions_select on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.platform_admins, public.usage_events, public.admin_notes, public.admin_audit_log from anon, authenticated;
revoke insert, update, delete on public.subscriptions, public.payments, public.user_sessions from anon, authenticated;
revoke all on public.subscriptions, public.payments, public.user_sessions from anon;

-- ============================================================
-- Consola: lecturas
-- Todas devuelven jsonb; las listas, { total, rows }.
-- ============================================================

-- Quién soy en la consola (null si no soy admin de plataforma)
create or replace function public.admin_me()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name, 'avatar_url', p.avatar_url, 'role', pa.role)
  from platform_admins pa join profiles p on p.id = pa.user_id
  where pa.user_id = (select auth.uid());
$$;

-- Contadores livianos para la barra lateral
create or replace function public.admin_badges()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return jsonb_build_object(
    'online', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
    'payments_attention', (select count(*) from payments where status in ('failed', 'pending') and created_at >= now() - interval '60 days'),
    'past_due', (select count(*) from subscriptions where status = 'past_due'),
    'suspended', (select count(*) from accounts where status = 'suspended')
  );
end;
$$;

-- Resumen general del periodo
create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 400);
  v_from timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := v_from - make_interval(days => v_days);
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'to', now()),
    'users', jsonb_build_object(
      'total', (select count(*) from profiles),
      'new', (select count(*) from profiles where created_at >= v_from),
      'new_prev', (select count(*) from profiles where created_at >= v_prev and created_at < v_from),
      'active', (select count(distinct user_id) from user_sessions where last_seen_at >= v_from),
      'active_prev', (select count(distinct user_id) from user_sessions where last_seen_at >= v_prev and started_at < v_from),
      'online', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
      'dau', (select count(distinct user_id) from user_sessions where last_seen_at >= date_trunc('day', now())),
      'wau', (select count(distinct user_id) from user_sessions where last_seen_at >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from user_sessions where last_seen_at >= now() - interval '30 days'),
      'suspended', (select count(*) from profiles where suspended_at is not null)
    ),
    'accounts', jsonb_build_object(
      'total', (select count(*) from accounts),
      'new', (select count(*) from accounts where created_at >= v_from),
      'new_prev', (select count(*) from accounts where created_at >= v_prev and created_at < v_from),
      'paying', (select count(*) from subscriptions where subscription_mrr_cents(status, billing_interval, unit_amount_cents) > 0),
      'trialing', (select count(*) from subscriptions where status = 'trialing'),
      'suspended', (select count(*) from accounts where status = 'suspended')
    ),
    'workspaces', jsonb_build_object(
      'total', (select count(*) from workspaces where archived_at is null),
      'active', (select count(distinct workspace_id) from usage_events where occurred_at >= v_from and workspace_id is not null)
    ),
    'content', jsonb_build_object(
      'tasks', (select count(*) from tasks),
      'tasks_new', (select count(*) from tasks where created_at >= v_from),
      'tasks_done', (select count(*) from tasks where completed_at >= v_from),
      'docs', (select count(*) from docs where archived_at is null),
      'docs_new', (select count(*) from docs where created_at >= v_from),
      'meetings', (select count(*) from meetings),
      'meetings_closed', (select count(*) from meetings where closed_at >= v_from),
      'storage_bytes', (select coalesce(sum(size_bytes), 0) from attachments where kind = 'file')
    ),
    'revenue', jsonb_build_object(
      'currency', coalesce((select currency from plans where price_monthly_cents > 0 order by sort limit 1), 'USD'),
      'mrr_cents', (select coalesce(sum(subscription_mrr_cents(status, billing_interval, unit_amount_cents)), 0) from subscriptions),
      'mrr_prev_cents', (
        select coalesce(sum(case when billing_interval = 'year' then round(unit_amount_cents / 12.0) else unit_amount_cents end), 0)::bigint
        from subscriptions
        where started_at < v_from and (canceled_at is null or canceled_at >= v_from)
          and (trial_ends_at is null or trial_ends_at < v_from)
      ),
      'collected_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_from),
      'collected_prev_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_prev and paid_at < v_from),
      'failed', (select count(*) from payments where status = 'failed' and created_at >= v_from)
    ),
    'series', (
      with days as (
        select generate_series(v_from, date_trunc('day', now()), interval '1 day') as day
      ),
      su as (select date_trunc('day', created_at) as day, count(*) as n from profiles where created_at >= v_from group by 1),
      ac as (select date_trunc('day', started_at) as day, count(distinct user_id) as n from user_sessions where started_at >= v_from group by 1),
      ev as (select date_trunc('day', occurred_at) as day, count(*) as n from usage_events where occurred_at >= v_from group by 1),
      rv as (
        select date_trunc('day', paid_at) as day, sum(amount_cents - refunded_cents) as n
        from payments where status in ('paid', 'refunded') and paid_at >= v_from group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'signups', coalesce(su.n, 0),
        'active', coalesce(ac.n, 0),
        'events', coalesce(ev.n, 0),
        'revenue_cents', coalesce(rv.n, 0)
      ) order by d.day), '[]'::jsonb)
      from days d
      left join su on su.day = d.day
      left join ac on ac.day = d.day
      left join ev on ev.day = d.day
      left join rv on rv.day = d.day
    ),
    'plans', (
      select coalesce(jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name, 'accounts', x.n, 'mrr_cents', x.mrr) order by p.sort, p.created_at), '[]'::jsonb)
      from plans p
      cross join lateral (
        select count(a.id) as n, coalesce(sum(subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents)), 0) as mrr
        from accounts a left join subscriptions s on s.account_id = a.id
        where a.plan_id = p.id
      ) x
    ),
    'top_features', (
      select coalesce(jsonb_agg(t order by t.count desc), '[]'::jsonb)
      from (
        select event, count(*) as count, count(distinct user_id) as users
        from usage_events
        where occurred_at >= v_from and event not like 'user.%' and event not like 'account.%'
        group by event
        order by count(*) desc
        limit 8
      ) t
    ),
    'recent_signups', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, p.created_at,
          coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
          (select a.name from account_members am join accounts a on a.id = am.account_id where am.user_id = p.id order by am.created_at limit 1) as account_name
        from profiles p left join auth.users u on u.id = p.id
        order by p.created_at desc
        limit 6
      ) t
    ),
    'online_now', (
      select coalesce(jsonb_agg(t order by t.last_seen_at desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, p.last_seen_at,
          (select s.device from user_sessions s where s.user_id = p.id order by s.last_seen_at desc limit 1) as device
        from profiles p
        where p.last_seen_at > now() - interval '5 minutes'
        order by p.last_seen_at desc
        limit 12
      ) t
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Carga de trabajo de un usuario (usada en listas y detalle)
create or replace function public.user_load(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with t as (
    select t.* from tasks t
    join workspaces w on w.id = t.workspace_id and w.archived_at is null
    where t.assignee_id = p_user
  ),
  m as (
    select count(*) as n
    from meetings mt
    join profiles p on p.id = p_user
    where mt.starts_at >= now() and mt.starts_at < now() + interval '7 days'
      and (mt.created_by = p_user or mt.attendees @> jsonb_build_array(jsonb_build_object('email', p.email)))
  ),
  agg as (
    select
      count(*) filter (where status <> 'done') as open,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'blocked') as blocked,
      count(*) filter (where status <> 'done' and due_date < current_date) as overdue,
      count(*) filter (where status <> 'done' and due_date between current_date and current_date + 7) as due_7d,
      count(*) filter (where status <> 'done' and priority in ('urgent', 'high')) as urgent_high,
      coalesce(sum(estimate_hours) filter (where status <> 'done'), 0) as estimate_hours,
      count(*) filter (where status = 'done' and completed_at >= now() - interval '14 days') as done_14d
    from t
  )
  select jsonb_build_object(
    'open', a.open, 'in_progress', a.in_progress, 'blocked', a.blocked, 'overdue', a.overdue,
    'due_7d', a.due_7d, 'urgent_high', a.urgent_high, 'estimate_hours', a.estimate_hours,
    'done_14d', a.done_14d, 'meetings_7d', m.n,
    'score', round(a.open + a.overdue * 2 + a.urgent_high + a.due_7d + a.blocked + m.n * 0.5, 1)
  )
  from agg a, m;
$$;

-- Usuarios
create or replace function public.admin_users(
  p_search text default null,
  p_filter text default 'all',
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with base as (
    select p.*, u.last_sign_in_at, u.banned_until, coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
      pa.role as platform_role,
      (select count(*) from usage_events e where e.user_id = p.id and e.occurred_at >= now() - interval '30 days') as events_30d
    from profiles p
    left join auth.users u on u.id = p.id
    left join platform_admins pa on pa.user_id = p.id
    where (v_q is null or p.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%' or p.id::text = v_q)
  ),
  filtered as (
    select b.*, user_load(b.id) as load
    from base b
    where case coalesce(p_filter, 'all')
      when 'online' then b.last_seen_at > now() - interval '5 minutes'
      when 'active' then b.last_seen_at >= now() - interval '7 days'
      when 'inactive' then b.last_seen_at is null or b.last_seen_at < now() - interval '30 days'
      when 'new' then b.created_at >= now() - interval '30 days'
      when 'suspended' then b.suspended_at is not null or b.banned_until > now()
      when 'admins' then b.platform_role is not null
      when 'no_account' then not exists (select 1 from account_members am where am.user_id = b.id)
      else true
    end
  ),
  ranked as (
    select f.*, count(*) over () as total,
      row_number() over (order by
        case when p_sort = 'last_seen' then f.last_seen_at end desc nulls last,
        case when p_sort = 'load' then (f.load ->> 'score')::numeric end desc nulls last,
        case when p_sort = 'activity' then f.events_30d end desc nulls last,
        case when p_sort = 'name' then lower(f.full_name) end asc,
        f.created_at desc, f.id) as ord
    from filtered f
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id, 'email', pg.email, 'full_name', pg.full_name, 'avatar_url', pg.avatar_url,
      'created_at', pg.created_at, 'last_seen_at', pg.last_seen_at, 'last_sign_in_at', pg.last_sign_in_at,
      'provider', pg.provider, 'locale', pg.locale, 'platform_role', pg.platform_role,
      'suspended', pg.suspended_at is not null or coalesce(pg.banned_until > now(), false),
      'events_30d', pg.events_30d, 'load', pg.load,
      'accounts', (
        select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'role', am.role, 'plan_id', a.plan_id) order by am.created_at), '[]'::jsonb)
        from account_members am join accounts a on a.id = am.account_id where am.user_id = pg.id
      ),
      'workspaces', (
        select count(distinct w.id) from workspaces w
        where w.archived_at is null and public.workspace_role_for(w.id, pg.id) is not null
          and w.account_id in (select account_id from account_members where user_id = pg.id)
      )
    ) order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg;

  return v_out;
end;
$$;

-- Detalle de un usuario
create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'profile', to_jsonb(p) - 'updated_at',
    'auth', jsonb_build_object(
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until,
      'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)
    ),
    'platform_role', (select role from platform_admins where user_id = p.id),
    'load', user_load(p.id),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'role', am.role, 'plan_id', a.plan_id, 'status', a.status, 'joined_at', am.created_at
      ) order by am.created_at), '[]'::jsonb)
      from account_members am join accounts a on a.id = am.account_id
      where am.user_id = p.id
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x order by x.last_activity desc nulls last), '[]'::jsonb)
      from (
        select w.id, w.name, w.slug, w.key, w.color, w.icon, a.name as account_name,
          public.workspace_role_for(w.id, p.id) as role,
          (select count(*) from tasks t where t.workspace_id = w.id and t.assignee_id = p.id and t.status <> 'done') as open_tasks,
          (select max(e.occurred_at) from usage_events e where e.workspace_id = w.id and e.user_id = p.id) as last_activity
        from workspaces w join accounts a on a.id = w.account_id
        where w.archived_at is null
          and w.account_id in (select account_id from account_members where user_id = p.id)
          and public.workspace_role_for(w.id, p.id) is not null
      ) x
    ),
    'tasks', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select t.id, w.key || '-' || t.number as ref, t.title, t.status, t.priority, t.due_date, w.name as workspace
        from tasks t join workspaces w on w.id = t.workspace_id
        where t.assignee_id = p.id and t.status <> 'done'
        order by (t.due_date is null), t.due_date, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end
        limit 12
      ) x
    ),
    'activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'events', (select count(*) from usage_events e where e.user_id = p.id and e.occurred_at >= d.day and e.occurred_at < d.day + interval '1 day'),
        'minutes', (
          select coalesce(round(sum(extract(epoch from (least(s.last_seen_at, d.day + interval '1 day') - greatest(s.started_at, d.day))) / 60)), 0)
          from user_sessions s
          where s.user_id = p.id and s.last_seen_at >= d.day and s.started_at < d.day + interval '1 day'
        )
      ) order by d.day), '[]'::jsonb)
      from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') d(day)
    ),
    'top_events', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb)
      from (
        select event, count(*) as count from usage_events
        where user_id = p.id and occurred_at >= now() - interval '30 days'
        group by event order by count(*) desc limit 10
      ) x
    ),
    'recent_events', (
      select coalesce(jsonb_agg(x order by x.occurred_at desc), '[]'::jsonb)
      from (
        select e.id, e.event, e.occurred_at, e.props, w.name as workspace
        from usage_events e left join workspaces w on w.id = e.workspace_id
        where e.user_id = p.id
        order by e.occurred_at desc
        limit 40
      ) x
    ),
    'sessions', (
      select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]'::jsonb)
      from (
        select s.id, s.started_at, s.last_seen_at, s.device, s.browser, s.os, s.country, s.ip,
          round(extract(epoch from s.last_seen_at - s.started_at) / 60) as minutes
        from user_sessions s where s.user_id = p.id
        order by s.last_seen_at desc
        limit 25
      ) x
    ),
    'google', (
      select jsonb_build_object('email', g.google_email, 'connected_at', g.created_at, 'calendars', coalesce(array_length(g.selected_calendar_ids, 1), 0))
      from google_connections g where g.user_id = p.id
    ),
    'api_tokens', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'prefix', t.token_prefix, 'last_used_at', t.last_used_at, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from api_tokens t where t.user_id = p.id
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author', ap.full_name, 'author_id', n.author_id) order by n.created_at desc), '[]'::jsonb)
      from admin_notes n left join profiles ap on ap.id = n.author_id
      where n.subject_type = 'user' and n.subject_id = p.id
    ),
    'audit', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select l.id, l.action, l.summary, l.created_at, ap.full_name as actor
        from admin_audit_log l left join profiles ap on ap.id = l.actor_id
        where l.subject_type = 'user' and l.subject_id = p.id::text
        order by l.created_at desc limit 20
      ) x
    )
  ) into v_out
  from profiles p left join auth.users u on u.id = p.id
  where p.id = p_user;

  return v_out;
end;
$$;

-- Cuentas
create or replace function public.admin_accounts(
  p_search text default null,
  p_filter text default 'all',
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with base as (
    select a.*, pl.name as plan_name, pl.max_members, pl.max_workspaces,
      o.full_name as owner_name, o.email as owner_email, o.avatar_url as owner_avatar,
      s.status as sub_status, s.billing_interval, s.unit_amount_cents, s.current_period_end, s.trial_ends_at, s.cancel_at_period_end,
      coalesce(subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents), 0) as mrr_cents,
      (select count(*) from account_members m where m.account_id = a.id) as members,
      (select count(*) from workspaces w where w.account_id = a.id and w.archived_at is null) as workspaces,
      (select count(*) from usage_events e where e.account_id = a.id and e.occurred_at >= now() - interval '30 days') as events_30d,
      (select max(e.occurred_at) from usage_events e where e.account_id = a.id) as last_active_at,
      (select coalesce(sum(at.size_bytes), 0) from attachments at join workspaces w on w.id = at.workspace_id where w.account_id = a.id and at.kind = 'file') as storage_bytes,
      (select coalesce(sum(pm.amount_cents - pm.refunded_cents), 0) from payments pm where pm.account_id = a.id and pm.status in ('paid', 'refunded')) as ltv_cents
    from accounts a
    join plans pl on pl.id = a.plan_id
    join profiles o on o.id = a.owner_id
    left join subscriptions s on s.account_id = a.id
    where v_q is null or a.name ilike '%' || v_q || '%' or o.email ilike '%' || v_q || '%' or o.full_name ilike '%' || v_q || '%' or a.id::text = v_q
  ),
  filtered as (
    select * from base b
    where case coalesce(p_filter, 'all')
      when 'paying' then b.mrr_cents > 0
      when 'free' then b.mrr_cents = 0 and coalesce(b.sub_status, 'active') <> 'trialing'
      when 'trialing' then b.sub_status = 'trialing'
      when 'past_due' then b.sub_status = 'past_due'
      when 'suspended' then b.status = 'suspended'
      when 'at_limit' then (b.max_members is not null and b.members >= b.max_members) or (b.max_workspaces is not null and b.workspaces >= b.max_workspaces)
      when 'inactive' then b.events_30d = 0
      else true
    end
  ),
  ranked as (
    select f.*, count(*) over () as total,
      row_number() over (order by
        case when p_sort = 'mrr' then f.mrr_cents end desc nulls last,
        case when p_sort = 'members' then f.members end desc nulls last,
        case when p_sort = 'activity' then f.events_30d end desc nulls last,
        case when p_sort = 'name' then lower(f.name) end asc,
        f.created_at desc, f.id) as ord
    from filtered f
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id, 'name', pg.name, 'created_at', pg.created_at, 'status', pg.status,
      'owner', jsonb_build_object('id', pg.owner_id, 'full_name', pg.owner_name, 'email', pg.owner_email, 'avatar_url', pg.owner_avatar),
      'plan_id', pg.plan_id, 'plan_name', pg.plan_name,
      'members', pg.members, 'max_members', pg.max_members,
      'workspaces', pg.workspaces, 'max_workspaces', pg.max_workspaces,
      'subscription', jsonb_build_object('status', pg.sub_status, 'interval', pg.billing_interval, 'amount_cents', pg.unit_amount_cents,
        'current_period_end', pg.current_period_end, 'trial_ends_at', pg.trial_ends_at, 'cancel_at_period_end', pg.cancel_at_period_end),
      'mrr_cents', pg.mrr_cents, 'ltv_cents', pg.ltv_cents,
      'events_30d', pg.events_30d, 'last_active_at', pg.last_active_at, 'storage_bytes', pg.storage_bytes
    ) order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg;

  return v_out;
end;
$$;

-- Detalle de una cuenta
create or replace function public.admin_account_detail(p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'account', to_jsonb(a),
    'owner', jsonb_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email, 'avatar_url', o.avatar_url),
    'plan', to_jsonb(pl),
    'subscription', (select to_jsonb(s) || jsonb_build_object('mrr_cents', subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents)) from subscriptions s where s.account_id = a.id),
    'usage', jsonb_build_object(
      'members', (select count(*) from account_members where account_id = a.id),
      'workspaces', (select count(*) from workspaces where account_id = a.id and archived_at is null),
      'tasks', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id where w.account_id = a.id),
      'tasks_open', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id where w.account_id = a.id and t.status <> 'done'),
      'docs', (select count(*) from docs d join workspaces w on w.id = d.workspace_id where w.account_id = a.id and d.archived_at is null),
      'meetings', (select count(*) from meetings m join workspaces w on w.id = m.workspace_id where w.account_id = a.id),
      'attachments', (select count(*) from attachments at join workspaces w on w.id = at.workspace_id where w.account_id = a.id),
      'storage_bytes', (select coalesce(sum(at.size_bytes), 0) from attachments at join workspaces w on w.id = at.workspace_id where w.account_id = a.id and at.kind = 'file'),
      'events_30d', (select count(*) from usage_events where account_id = a.id and occurred_at >= now() - interval '30 days'),
      'ltv_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where account_id = a.id and status in ('paid', 'refunded'))
    ),
    'members', (
      select coalesce(jsonb_agg(x order by x.role_rank, x.full_name), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, am.role, am.created_at as joined_at, p.last_seen_at,
          p.suspended_at is not null as suspended,
          case am.role when 'owner' then 0 when 'admin' then 1 else 2 end as role_rank,
          user_load(p.id) as load,
          (select count(*) from usage_events e where e.user_id = p.id and e.account_id = a.id and e.occurred_at >= now() - interval '30 days') as events_30d
        from account_members am join profiles p on p.id = am.user_id
        where am.account_id = a.id
      ) x
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x order by x.archived_at nulls first, x.last_activity desc nulls last), '[]'::jsonb)
      from (
        select w.id, w.name, w.slug, w.key, w.icon, w.color, w.created_at, w.archived_at,
          (select count(*) from workspace_members wm where wm.workspace_id = w.id) as members,
          (select count(*) from tasks t where t.workspace_id = w.id and t.status <> 'done') as tasks_open,
          (select count(*) from tasks t where t.workspace_id = w.id and t.status = 'done') as tasks_done,
          (select count(*) from docs d where d.workspace_id = w.id and d.archived_at is null) as docs,
          (select count(*) from meetings m where m.workspace_id = w.id) as meetings,
          (select max(e.occurred_at) from usage_events e where e.workspace_id = w.id) as last_activity
        from workspaces w where w.account_id = a.id
      ) x
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(pm) order by pm.created_at desc), '[]'::jsonb)
      from (select * from payments where account_id = a.id order by created_at desc limit 24) pm
    ),
    'activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'events', (select count(*) from usage_events e where e.account_id = a.id and e.occurred_at >= d.day and e.occurred_at < d.day + interval '1 day'),
        'users', (select count(distinct e.user_id) from usage_events e where e.account_id = a.id and e.occurred_at >= d.day and e.occurred_at < d.day + interval '1 day')
      ) order by d.day), '[]'::jsonb)
      from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') d(day)
    ),
    'top_events', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb)
      from (
        select event, count(*) as count, count(distinct user_id) as users from usage_events
        where account_id = a.id and occurred_at >= now() - interval '30 days'
        group by event order by count(*) desc limit 10
      ) x
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author', ap.full_name, 'author_id', n.author_id) order by n.created_at desc), '[]'::jsonb)
      from admin_notes n left join profiles ap on ap.id = n.author_id
      where n.subject_type = 'account' and n.subject_id = a.id
    ),
    'audit', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select l.id, l.action, l.summary, l.created_at, ap.full_name as actor
        from admin_audit_log l left join profiles ap on ap.id = l.actor_id
        where l.subject_type = 'account' and l.subject_id = a.id::text
        order by l.created_at desc limit 20
      ) x
    )
  ) into v_out
  from accounts a
  join profiles o on o.id = a.owner_id
  join plans pl on pl.id = a.plan_id
  where a.id = p_account;

  return v_out;
end;
$$;

-- Espacios de todas las cuentas
create or replace function public.admin_workspaces(
  p_search text default null,
  p_sort text default 'activity',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with base as (
    select w.id, w.name, w.slug, w.key, w.icon, w.color, w.created_at, w.archived_at,
      a.id as account_id, a.name as account_name,
      (select count(*) from workspace_members wm where wm.workspace_id = w.id) as members,
      (select count(*) from tasks t where t.workspace_id = w.id and t.status <> 'done') as tasks_open,
      (select count(*) from tasks t where t.workspace_id = w.id and t.status <> 'done' and t.due_date < current_date) as tasks_overdue,
      (select count(*) from tasks t where t.workspace_id = w.id and t.completed_at >= now() - interval '30 days') as tasks_done_30d,
      (select count(*) from docs d where d.workspace_id = w.id and d.archived_at is null) as docs,
      (select count(*) from meetings m where m.workspace_id = w.id and m.starts_at >= now() - interval '30 days' and m.starts_at < now()) as meetings_30d,
      (select count(*) from attachments at where at.workspace_id = w.id) as attachments,
      (select count(*) from usage_events e where e.workspace_id = w.id and e.occurred_at >= now() - interval '30 days') as events_30d,
      (select max(e.occurred_at) from usage_events e where e.workspace_id = w.id) as last_activity
    from workspaces w join accounts a on a.id = w.account_id
    where v_q is null or w.name ilike '%' || v_q || '%' or a.name ilike '%' || v_q || '%' or w.key ilike v_q
  ),
  ranked as (
    select b.*, count(*) over () as total,
      row_number() over (order by
        case when p_sort = 'tasks' then b.tasks_open end desc nulls last,
        case when p_sort = 'overdue' then b.tasks_overdue end desc nulls last,
        case when p_sort = 'members' then b.members end desc nulls last,
        case when p_sort = 'recent' then b.created_at end desc nulls last,
        case when p_sort = 'name' then lower(b.name) end asc,
        b.events_30d desc, b.created_at desc, b.id) as ord
    from base b
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'rows', coalesce(jsonb_agg((to_jsonb(pg) - 'total' - 'ord') order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg;

  return v_out;
end;
$$;

-- Facturación
create or replace function public.admin_billing(p_months integer default 12)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_months integer := least(greatest(coalesce(p_months, 12), 1), 36);
  v_month timestamptz := date_trunc('month', now());
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'currency', coalesce((select currency from plans where price_monthly_cents > 0 order by sort limit 1), 'USD'),
    'mrr_cents', (select coalesce(sum(subscription_mrr_cents(status, billing_interval, unit_amount_cents)), 0) from subscriptions),
    'paying', (select count(*) from subscriptions where subscription_mrr_cents(status, billing_interval, unit_amount_cents) > 0),
    'trialing', (select count(*) from subscriptions where status = 'trialing'),
    'past_due', (select count(*) from subscriptions where status = 'past_due'),
    'cancel_scheduled', (select count(*) from subscriptions where cancel_at_period_end and status <> 'canceled'),
    'canceled_30d', (select count(*) from subscriptions where canceled_at >= now() - interval '30 days'),
    'new_paying_30d', (select count(*) from subscriptions where started_at >= now() - interval '30 days' and subscription_mrr_cents(status, billing_interval, unit_amount_cents) > 0),
    'collected_month_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_month),
    -- mismo tramo del mes anterior (del día 1 a la misma fecha), para comparar meses en curso
    'collected_prev_month_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_month - interval '1 month' and paid_at < now() - interval '1 month'),
    'pending_cents', (select coalesce(sum(amount_cents), 0) from payments where status = 'pending'),
    'failed_30d', (select count(*) from payments where status = 'failed' and created_at >= now() - interval '30 days'),
    'failed_30d_cents', (select coalesce(sum(amount_cents), 0) from payments where status = 'failed' and created_at >= now() - interval '30 days'),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', m.month::date,
        'collected_cents', (select coalesce(sum(amount_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= m.month and paid_at < m.month + interval '1 month'),
        'refunded_cents', (select coalesce(sum(refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= m.month and paid_at < m.month + interval '1 month'),
        'failed_cents', (select coalesce(sum(amount_cents), 0) from payments where status = 'failed' and created_at >= m.month and created_at < m.month + interval '1 month'),
        'payments', (select count(*) from payments where status in ('paid', 'refunded') and paid_at >= m.month and paid_at < m.month + interval '1 month'),
        'new_paying', (select count(*) from subscriptions s where s.started_at >= m.month and s.started_at < m.month + interval '1 month' and s.unit_amount_cents > 0),
        'churned', (select count(*) from subscriptions s where s.canceled_at >= m.month and s.canceled_at < m.month + interval '1 month')
      ) order by m.month), '[]'::jsonb)
      from generate_series(v_month - make_interval(months => v_months - 1), v_month, interval '1 month') m(month)
    ),
    'by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name, 'price_monthly_cents', p.price_monthly_cents,
        'accounts', x.n, 'paying', x.paying, 'mrr_cents', x.mrr) order by p.sort, p.created_at), '[]'::jsonb)
      from plans p
      cross join lateral (
        select count(*) as n,
          count(*) filter (where subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents) > 0) as paying,
          coalesce(sum(subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents)), 0) as mrr
        from subscriptions s where s.plan_id = p.id
      ) x
    ),
    'by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc), '[]'::jsonb)
      from (select status, count(*) as n from subscriptions group by status) x
    ),
    'renewals', (
      select coalesce(jsonb_agg(x order by x.renews_at), '[]'::jsonb)
      from (
        select s.account_id, a.name as account_name, s.plan_id, s.billing_interval, s.unit_amount_cents, s.cancel_at_period_end, s.status,
          case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end as renews_at
        from subscriptions s join accounts a on a.id = s.account_id
        where s.unit_amount_cents > 0 and s.status in ('active', 'past_due', 'trialing')
          and (case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end) between now() and now() + interval '14 days'
        order by case when s.status = 'trialing' then s.trial_ends_at else s.current_period_end end
        limit 12
      ) x
    ),
    'attention', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select pm.id, pm.number, pm.account_id, a.name as account_name, pm.amount_cents, pm.currency, pm.status, pm.failure_reason, pm.created_at
        from payments pm join accounts a on a.id = pm.account_id
        where pm.status in ('failed', 'pending') and pm.created_at >= now() - interval '60 days'
        order by pm.created_at desc
        limit 12
      ) x
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Pagos
create or replace function public.admin_payments(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with ranked as (
    select pm.*, a.name as account_name, count(*) over () as total,
      row_number() over (order by coalesce(pm.paid_at, pm.created_at) desc, pm.number desc) as ord
    from payments pm join accounts a on a.id = pm.account_id
    where (p_status is null or p_status = 'all' or pm.status = p_status)
      and (v_q is null or a.name ilike '%' || v_q || '%' or pm.description ilike '%' || v_q || '%'
           or pm.number::text = ltrim(v_q, '#') or pm.provider_ref = v_q)
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'rows', coalesce(jsonb_agg((to_jsonb(pg) - 'total' - 'ord') order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg;

  return v_out;
end;
$$;

-- Planes con su uso
create or replace function public.admin_plans()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return (
    select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'accounts', (select count(*) from accounts a where a.plan_id = p.id),
      'paying', (select count(*) from subscriptions s where s.plan_id = p.id and subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents) > 0),
      'mrr_cents', (select coalesce(sum(subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents)), 0) from subscriptions s where s.plan_id = p.id),
      'at_limit', (
        select count(*) from accounts a
        where a.plan_id = p.id and (
          (p.max_members is not null and (select count(*) from account_members m where m.account_id = a.id) >= p.max_members)
          or (p.max_workspaces is not null and (select count(*) from workspaces w where w.account_id = a.id and w.archived_at is null) >= p.max_workspaces)
        )
      )
    ) order by p.sort, p.created_at), '[]'::jsonb)
    from plans p
  );
end;
$$;

-- Uso del producto
create or replace function public.admin_usage(p_days integer default 30, p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 400);
  v_from timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := v_from - make_interval(days => v_days);
  v_tz text := coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC');
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'tz', v_tz),
    -- activas = se conectaron o hicieron algo en el periodo (así la adopción nunca pasa de 100 %)
    'active_users', (
      select count(*) from (
        select user_id from user_sessions where last_seen_at >= v_from
        union
        select user_id from usage_events where occurred_at >= v_from and user_id is not null
      ) x
    ),
    'active_accounts', (select count(distinct account_id) from usage_events where occurred_at >= v_from and account_id is not null),
    'events', (select count(*) from usage_events where occurred_at >= v_from),
    'events_prev', (select count(*) from usage_events where occurred_at >= v_prev and occurred_at < v_from),
    'features', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb)
      from (
        select cur.event, cur.count, cur.users, cur.accounts, coalesce(prev.count, 0) as prev_count
        from (
          select event, count(*) as count, count(distinct user_id) as users, count(distinct account_id) as accounts
          from usage_events where occurred_at >= v_from group by event
        ) cur
        left join (
          select event, count(*) as count from usage_events
          where occurred_at >= v_prev and occurred_at < v_from group by event
        ) prev using (event)
      ) x
    ),
    'trend', (
      with top as (
        select event from usage_events where occurred_at >= v_from
        group by event order by count(*) desc limit 40
      ),
      days as (select generate_series(v_from, date_trunc('day', now()), interval '1 day') as day),
      counts as (
        select e.event, date_trunc('day', e.occurred_at) as day, count(*) as n
        from usage_events e join top using (event)
        where e.occurred_at >= v_from
        group by 1, 2
      )
      select coalesce(jsonb_object_agg(t.event, (
        select jsonb_agg(coalesce(c.n, 0) order by d.day)
        from days d left join counts c on c.event = t.event and c.day = d.day
      )), '{}'::jsonb)
      from top t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'count', n)), '[]'::jsonb)
      from (
        select extract(isodow from occurred_at at time zone v_tz)::int as dow,
               extract(hour from occurred_at at time zone v_tz)::int as hour,
               count(*) as n
        from usage_events where occurred_at >= v_from
        group by 1, 2
      ) h
    ),
    'funnel', (
      with cohort as (
        select p.id, p.created_at from profiles p where p.created_at >= v_from
      )
      select jsonb_build_array(
        jsonb_build_object('step', 'signed_up', 'users', (select count(*) from cohort)),
        jsonb_build_object('step', 'has_account', 'users', (select count(*) from cohort c where exists (select 1 from account_members am where am.user_id = c.id))),
        jsonb_build_object('step', 'first_task', 'users', (select count(*) from cohort c where exists (select 1 from tasks t where t.created_by = c.id))),
        jsonb_build_object('step', 'first_doc', 'users', (select count(*) from cohort c where exists (select 1 from docs d where d.created_by = c.id))),
        jsonb_build_object('step', 'meeting_closed', 'users', (select count(*) from cohort c where exists (
          select 1 from usage_events e where e.user_id = c.id and e.event = 'meeting.closed'))),
        jsonb_build_object('step', 'invited_team', 'users', (select count(*) from cohort c where exists (
          select 1 from account_members am where am.user_id = c.id and am.role in ('owner', 'admin')
            and (select count(*) from account_members x where x.account_id = am.account_id) > 1))),
        jsonb_build_object('step', 'returned_week_2', 'users', (select count(*) from cohort c where exists (
          select 1 from user_sessions s where s.user_id = c.id
            and s.last_seen_at >= c.created_at + interval '7 days' and s.started_at < c.created_at + interval '14 days')))
      )
    ),
    'retention', (
      select coalesce(jsonb_agg(jsonb_build_object('week', c.week::date, 'size', c.size, 'weeks', c.weeks) order by c.week), '[]'::jsonb)
      from (
        select wk.week, count(p.id) as size,
          (
            select jsonb_agg(
              case when wk.week + make_interval(weeks => n) > now() then null
              else (
                select count(distinct s.user_id) from user_sessions s
                join profiles p2 on p2.id = s.user_id
                where date_trunc('week', p2.created_at) = wk.week
                  and s.last_seen_at >= wk.week + make_interval(weeks => n)
                  and s.started_at < wk.week + make_interval(weeks => n + 1)
              ) end
              order by n)
            from generate_series(0, 7) n
          ) as weeks
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') wk(week)
        left join profiles p on date_trunc('week', p.created_at) = wk.week
        group by wk.week
      ) c
    ),
    'top_accounts', (
      select coalesce(jsonb_agg(x order by x.events desc), '[]'::jsonb)
      from (
        select a.id, a.name, a.plan_id, count(*) as events, count(distinct e.user_id) as users
        from usage_events e join accounts a on a.id = e.account_id
        where e.occurred_at >= v_from
        group by a.id order by count(*) desc limit 10
      ) x
    ),
    'top_users', (
      select coalesce(jsonb_agg(x order by x.events desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, count(*) as events,
          count(distinct e.event) as features, count(distinct date_trunc('day', e.occurred_at)) as days
        from usage_events e join profiles p on p.id = e.user_id
        where e.occurred_at >= v_from
        group by p.id order by count(*) desc limit 10
      ) x
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Carga de trabajo
create or replace function public.admin_workload(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  with loads as (
    select p.id, p.full_name, p.email, p.avatar_url, p.last_seen_at, user_load(p.id) as load,
      (select string_agg(a.name, ', ' order by am.created_at) from account_members am join accounts a on a.id = am.account_id where am.user_id = p.id) as accounts
    from profiles p
    where exists (select 1 from tasks t where t.assignee_id = p.id)
       or p.last_seen_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'open', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done'),
      'overdue', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and t.due_date < current_date),
      'unassigned', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and t.assignee_id is null),
      'no_due', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and t.due_date is null),
      'blocked', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status = 'blocked'),
      'done_7d', (select count(*) from tasks where completed_at >= now() - interval '7 days'),
      'created_7d', (select count(*) from tasks where created_at >= now() - interval '7 days'),
      'people', (select count(*) from loads where (load ->> 'open')::int > 0)
    ),
    'users', (
      select coalesce(jsonb_agg(x order by (x.load ->> 'score')::numeric desc), '[]'::jsonb)
      from (select * from loads order by (load ->> 'score')::numeric desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x
    ),
    'distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', b.label, 'users', (
        select count(*) from loads l where (l.load ->> 'open')::int between b.lo and b.hi
      )) order by b.lo), '[]'::jsonb)
      from (values ('0', 0, 0), ('1-5', 1, 5), ('6-10', 6, 10), ('11-20', 11, 20), ('21+', 21, 1000000)) b(label, lo, hi)
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x order by x.tasks_open desc), '[]'::jsonb)
      from (
        select w.id, w.name, w.key, w.color, w.icon, a.name as account_name,
          count(t.id) filter (where t.status <> 'done') as tasks_open,
          count(t.id) filter (where t.status <> 'done' and t.due_date < current_date) as overdue,
          count(t.id) filter (where t.status <> 'done' and t.assignee_id is null) as unassigned,
          count(t.id) filter (where t.status = 'blocked') as blocked,
          count(distinct t.assignee_id) filter (where t.status <> 'done') as people
        from workspaces w join accounts a on a.id = w.account_id
        left join tasks t on t.workspace_id = w.id
        where w.archived_at is null
        group by w.id, a.name
        having count(t.id) filter (where t.status <> 'done') > 0
        order by tasks_open desc
        limit 15
      ) x
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Conexiones
create or replace function public.admin_connections(p_limit integer default 100, p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz text := coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC');
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'online', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
      'today', (select count(distinct user_id) from user_sessions where last_seen_at >= date_trunc('day', now() at time zone v_tz) at time zone v_tz),
      'sessions_24h', (select count(*) from user_sessions where last_seen_at >= now() - interval '24 hours'),
      'avg_minutes_7d', (select coalesce(round(avg(extract(epoch from last_seen_at - started_at) / 60)), 0) from user_sessions where started_at >= now() - interval '7 days'),
      'sign_ins_24h', (select count(*) from auth.users where last_sign_in_at >= now() - interval '24 hours'),
      'countries_30d', (select count(distinct country) from user_sessions where last_seen_at >= now() - interval '30 days' and country is not null)
    ),
    'recent', (
      select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]'::jsonb)
      from (
        select s.id, s.started_at, s.last_seen_at, s.device, s.browser, s.os, s.country, s.ip,
          round(extract(epoch from s.last_seen_at - s.started_at) / 60) as minutes,
          s.last_seen_at > now() - interval '5 minutes' as online,
          jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url) as "user"
        from user_sessions s join profiles p on p.id = s.user_id
        order by s.last_seen_at desc
        limit least(greatest(coalesce(p_limit, 100), 1), 500)
      ) x
    ),
    'hourly', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'users', (
        select count(distinct s.user_id) from user_sessions s
        where s.last_seen_at >= h.hour and s.started_at < h.hour + interval '1 hour'
      )) order by h.hour), '[]'::jsonb)
      from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h(hour)
    ),
    'by_device', (
      select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(device, 'unknown'), 'users', n) order by n desc), '[]'::jsonb)
      from (select device, count(distinct user_id) as n from user_sessions where last_seen_at >= now() - interval '30 days' group by device) x
    ),
    'by_browser', (
      select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(browser, 'unknown'), 'users', n) order by n desc), '[]'::jsonb)
      from (select browser, count(distinct user_id) as n from user_sessions where last_seen_at >= now() - interval '30 days' group by browser) x
    ),
    'by_os', (
      select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(os, 'unknown'), 'users', n) order by n desc), '[]'::jsonb)
      from (select os, count(distinct user_id) as n from user_sessions where last_seen_at >= now() - interval '30 days' group by os) x
    ),
    'by_country', (
      select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(country, '??'), 'users', n) order by n desc), '[]'::jsonb)
      from (select country, count(distinct user_id) as n from user_sessions where last_seen_at >= now() - interval '30 days' group by country order by n desc limit 12) x
    ),
    'sign_ins', (
      select coalesce(jsonb_agg(x order by x.last_sign_in_at desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, u.last_sign_in_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
        from auth.users u join profiles p on p.id = u.id
        where u.last_sign_in_at is not null
        order by u.last_sign_in_at desc
        limit 15
      ) x
    ),
    'at_risk', (
      select coalesce(jsonb_agg(x order by x.events_before desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, p.last_seen_at,
          (select count(*) from usage_events e where e.user_id = p.id and e.occurred_at < p.last_seen_at and e.occurred_at >= p.last_seen_at - interval '30 days') as events_before
        from profiles p
        where p.last_seen_at between now() - interval '60 days' and now() - interval '14 days'
          and p.suspended_at is null
        order by events_before desc
        limit 10
      ) x
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Sistema: integraciones, almacenamiento, volumen de datos
create or replace function public.admin_system()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'google', jsonb_build_object(
      'connected', (select count(*) from google_connections),
      'recent', (
        select coalesce(jsonb_agg(x order by x.connected_at desc), '[]'::jsonb)
        from (
          select p.id, p.full_name, p.email, g.google_email, g.created_at as connected_at, g.updated_at,
            coalesce(array_length(g.selected_calendar_ids, 1), 0) as calendars
          from google_connections g join profiles p on p.id = g.user_id
          order by g.created_at desc limit 10
        ) x
      )
    ),
    'api_tokens', jsonb_build_object(
      'total', (select count(*) from api_tokens),
      'active_30d', (select count(*) from api_tokens where last_used_at >= now() - interval '30 days'),
      'recent', (
        select coalesce(jsonb_agg(x order by x.last_used_at desc nulls last), '[]'::jsonb)
        from (
          select t.id, t.name, t.token_prefix, t.last_used_at, t.created_at, p.full_name, p.email
          from api_tokens t join profiles p on p.id = t.user_id
          order by t.last_used_at desc nulls last limit 10
        ) x
      ),
      'docs_from_claude_30d', (select count(*) from docs where source = 'claude' and created_at >= now() - interval '30 days')
    ),
    'storage', jsonb_build_object(
      'bytes', (select coalesce(sum(size_bytes), 0) from attachments where kind = 'file'),
      'files', (select count(*) from attachments where kind = 'file'),
      'links', (select count(*) from attachments where kind = 'link'),
      'by_type', (
        select coalesce(jsonb_agg(jsonb_build_object('type', t, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
        from (
          select case
              when mime_type like 'image/%' then 'image'
              when mime_type = 'application/pdf' then 'pdf'
              when mime_type ~ '(spreadsheet|excel|csv)' then 'sheet'
              when mime_type ~ '(word|document|text/)' then 'doc'
              when mime_type ~ '(presentation|powerpoint)' then 'slides'
              else 'other' end as t,
            count(*) as n, coalesce(sum(size_bytes), 0) as b
          from attachments where kind = 'file' group by 1
        ) x
      ),
      'by_account', (
        select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb)
        from (
          select a.id, a.name, coalesce(sum(at.size_bytes), 0) as bytes, count(at.id) as files
          from attachments at join workspaces w on w.id = at.workspace_id join accounts a on a.id = w.account_id
          where at.kind = 'file'
          group by a.id order by bytes desc limit 10
        ) x
      )
    ),
    'tables', jsonb_build_object(
      'profiles', (select count(*) from profiles),
      'accounts', (select count(*) from accounts),
      'workspaces', (select count(*) from workspaces),
      'tasks', (select count(*) from tasks),
      'task_comments', (select count(*) from task_comments),
      'docs', (select count(*) from docs),
      'meetings', (select count(*) from meetings),
      'meeting_items', (select count(*) from meeting_items),
      'attachments', (select count(*) from attachments),
      'user_sessions', (select count(*) from user_sessions),
      'usage_events', (select count(*) from usage_events),
      'payments', (select count(*) from payments)
    ),
    'events', jsonb_build_object(
      'last_24h', (select count(*) from usage_events where occurred_at >= now() - interval '24 hours'),
      'oldest', (select min(occurred_at) from usage_events),
      'latest', (select max(occurred_at) from usage_events)
    ),
    'providers', (
      select coalesce(jsonb_agg(jsonb_build_object('key', k, 'users', n) order by n desc), '[]'::jsonb)
      from (select coalesce(raw_app_meta_data ->> 'provider', 'email') as k, count(*) as n from auth.users group by 1) x
    ),
    'locales', (
      select coalesce(jsonb_agg(jsonb_build_object('key', locale, 'users', n) order by n desc), '[]'::jsonb)
      from (select locale, count(*) as n from profiles group by locale) x
    ),
    'timezones', (
      select coalesce(jsonb_agg(jsonb_build_object('key', timezone, 'users', n) order by n desc), '[]'::jsonb)
      from (select timezone, count(*) as n from profiles group by timezone order by n desc limit 8) x
    )
  ) into v_out;

  return v_out;
end;
$$;

-- Auditoría
create or replace function public.admin_audit(
  p_search text default null,
  p_action text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with ranked as (
    select l.*, p.full_name as actor_name, p.email as actor_email, p.avatar_url as actor_avatar, count(*) over () as total,
      row_number() over (order by l.created_at desc, l.id desc) as ord
    from admin_audit_log l left join profiles p on p.id = l.actor_id
    where (p_action is null or p_action = 'all' or l.action like p_action || '%')
      and (v_q is null or l.summary ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%' or l.subject_id = v_q)
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'rows', coalesce(jsonb_agg((to_jsonb(pg) - 'total' - 'ord') order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg;

  return v_out;
end;
$$;

-- Equipo de la consola
create or replace function public.admin_team()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', pa.user_id, 'role', pa.role, 'created_at', pa.created_at,
      'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'last_seen_at', p.last_seen_at,
      'actions_30d', (select count(*) from admin_audit_log l where l.actor_id = pa.user_id and l.created_at >= now() - interval '30 days')
    ) order by case pa.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.full_name), '[]'::jsonb)
    from platform_admins pa join profiles p on p.id = pa.user_id
  );
end;
$$;

-- Búsqueda rápida (paleta de comandos)
create or replace function public.admin_search(p_q text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  perform platform_assert();
  if v_q is null or char_length(v_q) < 2 then
    return jsonb_build_object('users', '[]'::jsonb, 'accounts', '[]'::jsonb, 'workspaces', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'users', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select id, full_name, email, avatar_url from profiles
        where email ilike '%' || v_q || '%' or full_name ilike '%' || v_q || '%'
        order by last_seen_at desc nulls last limit 6
      ) x
    ),
    'accounts', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select id, name, plan_id, status from accounts where name ilike '%' || v_q || '%'
        order by created_at desc limit 6
      ) x
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select w.id, w.name, w.key, w.color, w.icon, w.account_id, a.name as account_name
        from workspaces w join accounts a on a.id = w.account_id
        where w.name ilike '%' || v_q || '%' or w.key ilike v_q
        order by w.created_at desc limit 5
      ) x
    )
  );
end;
$$;

-- ============================================================
-- Consola: escrituras (todas quedan en la auditoría)
-- ============================================================

create or replace function public.admin_set_account_status(p_account uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  perform platform_assert(array['admin', 'support']);
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update accounts
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then now() end,
      suspended_reason = case when p_status = 'suspended' then nullif(trim(p_reason), '') end
  where id = p_account
  returning name into v_name;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform platform_log(case p_status when 'suspended' then 'account.suspended' else 'account.reactivated' end,
    'account', p_account::text, v_name, jsonb_strip_nulls(jsonb_build_object('reason', nullif(trim(p_reason), ''))));
end;
$$;

-- Marca la suspensión del usuario. El bloqueo de inicio de sesión lo hace la consola en Auth.
create or replace function public.admin_set_user_suspended(p_user uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
begin
  perform platform_assert(array['admin', 'support']);
  if p_user = (select auth.uid()) then
    raise exception 'cannot_suspend_self' using errcode = 'P0001';
  end if;
  update profiles set suspended_at = case when p_suspended then now() end
  where id = p_user
  returning email into v_email;
  if v_email is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform platform_log(case when p_suspended then 'user.suspended' else 'user.reactivated' end,
    'user', p_user::text, v_email, jsonb_strip_nulls(jsonb_build_object('reason', nullif(trim(p_reason), ''))));
end;
$$;

-- Cambia el plan de una cuenta (crea o actualiza su suscripción)
create or replace function public.admin_change_plan(
  p_account uuid,
  p_plan text,
  p_interval text default 'month',
  p_amount_cents integer default null,
  p_trial_days integer default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_plan plans;
  v_old text;
  v_name text;
  v_amount integer;
  v_status text;
begin
  perform platform_assert(array['admin', 'finance']);
  select * into v_plan from plans where id = p_plan;
  if v_plan.id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if p_interval not in ('month', 'year') then
    raise exception 'invalid_interval' using errcode = 'P0001';
  end if;
  select plan_id, name into v_old, v_name from accounts where id = p_account;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_amount := coalesce(p_amount_cents, case when p_interval = 'year' then coalesce(v_plan.price_yearly_cents, v_plan.price_monthly_cents * 12) else v_plan.price_monthly_cents end);
  v_status := case when coalesce(p_trial_days, 0) > 0 then 'trialing' else 'active' end;

  insert into subscriptions (account_id, plan_id, status, billing_interval, unit_amount_cents, currency,
    current_period_start, current_period_end, trial_ends_at, cancel_at_period_end, canceled_at, started_at)
  values (p_account, p_plan, v_status, p_interval, v_amount, v_plan.currency,
    now(), case when v_amount > 0 then now() + case when p_interval = 'year' then interval '1 year' else interval '1 month' end end,
    case when v_status = 'trialing' then now() + make_interval(days => p_trial_days) end, false, null, now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_interval = excluded.billing_interval,
    unit_amount_cents = excluded.unit_amount_cents,
    currency = excluded.currency,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_ends_at = excluded.trial_ends_at,
    cancel_at_period_end = false,
    canceled_at = null,
    started_at = case when subscriptions.plan_id = excluded.plan_id then subscriptions.started_at else now() end;

  perform platform_log('account.plan_changed', 'account', p_account::text, v_name,
    jsonb_strip_nulls(jsonb_build_object('from', v_old, 'to', p_plan, 'interval', p_interval, 'amount_cents', v_amount, 'trial_days', p_trial_days)));
end;
$$;

-- Acciones sobre la suscripción
create or replace function public.admin_subscription_action(p_account uuid, p_action text, p_days integer default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sub subscriptions;
  v_name text;
begin
  perform platform_assert(array['admin', 'finance']);
  select * into v_sub from subscriptions where account_id = p_account;
  select name into v_name from accounts where id = p_account;
  if v_sub.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  case p_action
    when 'cancel_now' then
      update subscriptions set status = 'canceled', canceled_at = now(), cancel_at_period_end = false where id = v_sub.id;
    when 'cancel_at_period_end' then
      update subscriptions set cancel_at_period_end = true where id = v_sub.id;
    when 'resume' then
      update subscriptions set status = 'active', cancel_at_period_end = false, canceled_at = null,
        current_period_start = case when v_sub.status = 'canceled' then now() else current_period_start end,
        current_period_end = case when v_sub.status = 'canceled' and unit_amount_cents > 0
          then now() + case when billing_interval = 'year' then interval '1 year' else interval '1 month' end
          else current_period_end end
      where id = v_sub.id;
    when 'pause' then
      update subscriptions set status = 'paused' where id = v_sub.id;
    when 'mark_past_due' then
      update subscriptions set status = 'past_due' where id = v_sub.id;
    when 'extend_trial' then
      if coalesce(p_days, 0) <= 0 or p_days > 365 then
        raise exception 'invalid_days' using errcode = 'P0001';
      end if;
      update subscriptions set status = 'trialing',
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
      where id = v_sub.id;
    when 'extend_period' then
      if coalesce(p_days, 0) <= 0 or p_days > 365 then
        raise exception 'invalid_days' using errcode = 'P0001';
      end if;
      update subscriptions set current_period_end = greatest(coalesce(current_period_end, now()), now()) + make_interval(days => p_days)
      where id = v_sub.id;
    else
      raise exception 'invalid_action' using errcode = 'P0001';
  end case;

  perform platform_log('subscription.' || p_action, 'account', p_account::text, v_name,
    jsonb_strip_nulls(jsonb_build_object('days', p_days, 'previous_status', v_sub.status)));
end;
$$;

-- Registra un pago manual
create or replace function public.admin_record_payment(
  p_account uuid,
  p_amount_cents integer,
  p_status text default 'paid',
  p_description text default null,
  p_method text default 'transfer',
  p_paid_at timestamptz default null,
  p_period_start date default null,
  p_period_end date default null,
  p_reference text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_sub uuid;
  v_currency text;
begin
  perform platform_assert(array['admin', 'finance']);
  if coalesce(p_amount_cents, -1) < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  select a.name, s.id, coalesce(s.currency, 'USD') into v_name, v_sub, v_currency
  from accounts a left join subscriptions s on s.account_id = a.id where a.id = p_account;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into payments (account_id, subscription_id, amount_cents, currency, status, description, method,
    period_start, period_end, provider_ref, paid_at, created_by)
  values (p_account, v_sub, p_amount_cents, v_currency, p_status, nullif(trim(p_description), ''), p_method,
    p_period_start, p_period_end, nullif(trim(p_reference), ''),
    case when p_status = 'paid' then coalesce(p_paid_at, now()) end, (select auth.uid()))
  returning id into v_id;

  perform platform_log('payment.recorded', 'account', p_account::text, v_name,
    jsonb_build_object('payment_id', v_id, 'amount_cents', p_amount_cents, 'status', p_status));
  return v_id;
end;
$$;

create or replace function public.admin_update_payment(p_payment uuid, p_status text, p_refund_cents integer default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pm payments;
  v_refund integer;
begin
  perform platform_assert(array['admin', 'finance']);
  select * into v_pm from payments where id = p_payment;
  if v_pm.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if p_status = 'refunded' then
    if v_pm.status not in ('paid', 'refunded') then
      raise exception 'not_refundable' using errcode = 'P0001';
    end if;
    v_refund := least(v_pm.amount_cents, v_pm.refunded_cents + coalesce(p_refund_cents, v_pm.amount_cents - v_pm.refunded_cents));
    update payments set refunded_cents = v_refund,
      status = case when v_refund >= amount_cents then 'refunded' else 'paid' end
    where id = p_payment;
  elsif p_status in ('paid', 'failed', 'pending') then
    update payments set status = p_status,
      paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      failure_reason = case when p_status = 'failed' then coalesce(nullif(trim(p_reason), ''), failure_reason) else failure_reason end
    where id = p_payment;
  else
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  perform platform_log('payment.' || p_status, 'account', v_pm.account_id::text,
    (select name from accounts where id = v_pm.account_id),
    jsonb_strip_nulls(jsonb_build_object('payment_id', p_payment, 'number', v_pm.number, 'refund_cents', p_refund_cents, 'reason', nullif(trim(p_reason), ''))));
end;
$$;

-- Crea o edita un plan
create or replace function public.admin_upsert_plan(p_plan jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id text := lower(trim(p_plan ->> 'id'));
  v_exists boolean;
begin
  perform platform_assert(array['admin']);
  if v_id is null or v_id !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception 'invalid_plan_id' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_plan ->> 'name', ''))) = 0 then
    raise exception 'invalid_plan_name' using errcode = 'P0001';
  end if;
  v_exists := exists (select 1 from plans where id = v_id);

  if coalesce((p_plan ->> 'is_default')::boolean, false) then
    update plans set is_default = false where is_default and id <> v_id;
  end if;

  insert into plans (id, name, description, price_monthly_cents, price_yearly_cents, currency, max_workspaces, max_members, is_public, is_default, sort)
  values (
    v_id,
    trim(p_plan ->> 'name'),
    nullif(trim(p_plan ->> 'description'), ''),
    coalesce((p_plan ->> 'price_monthly_cents')::int, 0),
    (p_plan ->> 'price_yearly_cents')::int,
    upper(coalesce(nullif(p_plan ->> 'currency', ''), 'USD')),
    (p_plan ->> 'max_workspaces')::int,
    (p_plan ->> 'max_members')::int,
    coalesce((p_plan ->> 'is_public')::boolean, true),
    coalesce((p_plan ->> 'is_default')::boolean, false),
    coalesce((p_plan ->> 'sort')::int, 0)
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    price_monthly_cents = excluded.price_monthly_cents,
    price_yearly_cents = excluded.price_yearly_cents,
    currency = excluded.currency,
    max_workspaces = excluded.max_workspaces,
    max_members = excluded.max_members,
    is_public = excluded.is_public,
    is_default = excluded.is_default or plans.is_default and not exists (select 1 from plans x where x.is_default and x.id <> plans.id),
    sort = excluded.sort;

  perform platform_log(case when v_exists then 'plan.updated' else 'plan.created' end, 'plan', v_id, trim(p_plan ->> 'name'), p_plan);
end;
$$;

create or replace function public.admin_delete_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  perform platform_assert(array['admin']);
  if exists (select 1 from accounts where plan_id = p_plan) or exists (select 1 from subscriptions where plan_id = p_plan) then
    raise exception 'plan_in_use' using errcode = 'P0001';
  end if;
  delete from plans where id = p_plan and not is_default returning name into v_name;
  if v_name is null then
    raise exception 'plan_not_deletable' using errcode = 'P0001';
  end if;
  perform platform_log('plan.deleted', 'plan', p_plan, v_name);
end;
$$;

-- Notas internas
create or replace function public.admin_add_note(p_subject_type text, p_subject_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform platform_assert(array['admin', 'support', 'finance']);
  insert into admin_notes (subject_type, subject_id, body, author_id)
  values (p_subject_type, p_subject_id, trim(p_body), (select auth.uid()))
  returning id into v_id;
  perform platform_log('note.added', p_subject_type, p_subject_id::text, left(trim(p_body), 120));
  return v_id;
end;
$$;

create or replace function public.admin_delete_note(p_note uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_note admin_notes;
  v_role text;
begin
  v_role := platform_assert(array['admin', 'support', 'finance']);
  select * into v_note from admin_notes where id = p_note;
  if v_note.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_note.author_id is distinct from (select auth.uid()) and v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from admin_notes where id = p_note;
  perform platform_log('note.deleted', v_note.subject_type, v_note.subject_id::text, left(v_note.body, 120));
end;
$$;

-- Equipo: dar, cambiar o quitar acceso a la consola (solo owner)
create or replace function public.admin_set_platform_role(p_email text, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_old text;
begin
  perform platform_assert(array['owner']);
  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  select role into v_old from platform_admins where user_id = v_user;

  if p_role is null or p_role = 'none' then
    if v_old = 'owner' and (select count(*) from platform_admins where role = 'owner') <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
    delete from platform_admins where user_id = v_user;
  else
    if p_role not in ('owner', 'admin', 'support', 'finance', 'viewer') then
      raise exception 'invalid_role' using errcode = 'P0001';
    end if;
    if v_old = 'owner' and p_role <> 'owner' and (select count(*) from platform_admins where role = 'owner') <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
    insert into platform_admins (user_id, role, created_by) values (v_user, p_role, (select auth.uid()))
    on conflict (user_id) do update set role = excluded.role;
  end if;

  perform platform_log('team.role_changed', 'user', v_user::text, lower(trim(p_email)),
    jsonb_strip_nulls(jsonb_build_object('from', v_old, 'to', coalesce(nullif(p_role, 'none'), 'none'))));
end;
$$;

-- Para acciones que la consola hace fuera de la base (Auth: bloqueo, correos de acceso)
create or replace function public.admin_record(
  p_action text,
  p_subject_type text,
  p_subject_id text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform platform_assert(array['admin', 'support', 'finance']);
  if p_action !~ '^[a-z_]+\.[a-z_]+$' then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  perform platform_log(p_action, p_subject_type, p_subject_id, left(p_summary, 300), p_details);
end;
$$;

-- ============================================================
-- Privilegios de ejecución
-- ============================================================
do $$
declare
  f record;
begin
  -- internas: nadie las llama directo
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname in ('platform_assert', 'platform_log', 'log_usage', 'user_load', 'subscriptions_sync_plan', 'accounts_create_subscription')
           or p.proname like 'usage\_on\_%')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;

  -- consola y cliente: usuarios autenticados (cada función valida el rol)
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%' or p.proname in ('platform_role', 'touch_presence', 'track_events', 'subscription_mrr_cents'))
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
-- ============================================================
-- Veltro v2 — Organigrama y estados de tareas por espacio
--
-- 1) Organigrama de la cuenta: departamentos (con jefe), cargo y "reporta a" por persona.
--    Cada persona ve sus tareas y las de todos los que están debajo de ella (directos e
--    indirectos, y los integrantes de los departamentos que encabeza), incluso en espacios
--    donde no es miembro, en SOLO LECTURA. Owner y admins de la cuenta ven todo.
-- 2) Estados propios por espacio: cada estado cae en una categoría fija
--    (backlog, todo, in_progress, blocked, done) que sigue viviendo en tasks.status,
--    así Hoy, Mesa, vencimientos y contadores funcionan igual en cualquier espacio.
-- ============================================================

-- ------------------------------------------------------------
-- DEPARTAMENTOS
-- ------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  head_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index departments_account_idx on public.departments(account_id);

create trigger departments_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- CARGO, DEPARTAMENTO Y "REPORTA A" EN LA MEMBRESÍA DE LA CUENTA
-- ------------------------------------------------------------
alter table public.account_members
  add column title         text check (title is null or char_length(title) <= 80),
  add column department_id uuid references public.departments(id) on delete set null,
  add column reports_to    uuid references public.profiles(id) on delete set null;

create index account_members_reports_to_idx on public.account_members(account_id, reports_to);
create index account_members_department_idx on public.account_members(department_id);

-- Coherencia: departamento y jefe de la misma cuenta, sin ciclos en la cadena de mando
create or replace function public.account_members_check_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cursor uuid;
  v_depth  integer := 0;
begin
  if new.department_id is not null and not exists (
    select 1 from departments where id = new.department_id and account_id = new.account_id
  ) then
    raise exception 'department_other_account' using errcode = 'P0001';
  end if;

  if new.reports_to is not null then
    if new.reports_to = new.user_id then
      raise exception 'reports_to_self' using errcode = 'P0001';
    end if;
    if not exists (select 1 from account_members where account_id = new.account_id and user_id = new.reports_to) then
      raise exception 'reports_to_not_member' using errcode = 'P0001';
    end if;
    -- subir por la cadena: si llegamos a la propia persona, sería un ciclo
    v_cursor := new.reports_to;
    while v_cursor is not null and v_depth < 64 loop
      if v_cursor = new.user_id then
        raise exception 'reports_to_cycle' using errcode = 'P0001';
      end if;
      select reports_to into v_cursor from account_members where account_id = new.account_id and user_id = v_cursor;
      v_depth := v_depth + 1;
    end loop;
  end if;

  return new;
end;
$$;

create trigger account_members_check_org before insert or update of department_id, reports_to on public.account_members
  for each row execute function public.account_members_check_org();

-- El jefe de un departamento debe pertenecer a la cuenta
create or replace function public.departments_check_head()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.head_id is not null and not exists (
    select 1 from account_members where account_id = new.account_id and user_id = new.head_id
  ) then
    raise exception 'head_not_member' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.account_id = old.account_id;
  end if;
  return new;
end;
$$;

create trigger departments_check_head before insert or update on public.departments
  for each row execute function public.departments_check_head();

-- Al salir de la cuenta, nadie queda reportándole ni encabezando sus departamentos
create or replace function public.cleanup_org_on_leave()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update account_members set reports_to = null where account_id = old.account_id and reports_to = old.user_id;
  update departments set head_id = null where account_id = old.account_id and head_id = old.user_id;
  return old;
end;
$$;

create trigger account_members_cleanup_org after delete on public.account_members
  for each row execute function public.cleanup_org_on_leave();

-- ------------------------------------------------------------
-- VISIBILIDAD POR JERARQUÍA
-- ------------------------------------------------------------

-- Personas que el usuario actual "ve" en cada cuenta: él mismo, quienes le reportan
-- (directa o indirectamente) y los integrantes de los departamentos que encabeza. Integrante
-- es quien tiene ese departamento o, si no tiene ninguno, lo hereda de su jefe; la rama de
-- alguien del departamento que es de otra área no entra (poner al gerente general en un
-- departamento no le abre toda la empresa a su jefe). Owner/admin: toda la cuenta.
create or replace function public.my_visible_members()
returns table (account_id uuid, user_id uuid)
language sql stable security definer set search_path = public
as $$
  with recursive
  me as (select (select auth.uid()) as uid),
  -- mi rama: yo y quienes me reportan, directo o indirecto
  tree as (
    select am.account_id, am.user_id
    from account_members am where am.user_id = (select uid from me)
    union
    select am.account_id, am.user_id
    from account_members am
    join tree t on am.account_id = t.account_id and am.reports_to = t.user_id
  ),
  -- departamento efectivo: el propio o, si no tiene, el del primer jefe hacia arriba que tenga uno
  -- (sube solo mientras no haya departamento; los ciclos los impide account_members_check_org)
  eff as (
    select am.account_id, am.user_id, am.department_id as dept, am.reports_to, 0 as depth
    from account_members am
    union all
    select e.account_id, e.user_id, boss.department_id, boss.reports_to, e.depth + 1
    from eff e
    join account_members boss on boss.account_id = e.account_id and boss.user_id = e.reports_to
    where e.dept is null and e.depth < 50
  ),
  -- integrantes de los departamentos que encabezo (sin arrastrar la rama de alguien de otra área)
  headed as (
    select e.account_id, e.user_id
    from departments d
    join eff e on e.account_id = d.account_id and e.dept = d.id
    where d.head_id = (select uid from me)
  )
  select t.account_id, t.user_id from tree t
  union
  select h.account_id, h.user_id from headed h
  union
  select am.account_id, am.user_id
  from account_members am
  join account_members mine on mine.account_id = am.account_id
  where mine.user_id = (select uid from me) and mine.role in ('owner', 'admin');
$$;

-- Pares (espacio, persona) cuyas tareas el usuario puede leer por jerarquía
create or replace function public.my_hierarchy_task_scope()
returns table (workspace_id uuid, user_id uuid)
language sql stable security definer set search_path = public
as $$
  select w.id, v.user_id
  from public.my_visible_members() v
  join workspaces w on w.account_id = v.account_id
  where w.archived_at is null;
$$;

-- Espacios donde trabaja alguien de mi equipo (para mostrar nombre y color de sus tareas)
create or replace function public.my_hierarchy_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct wm.workspace_id
  from workspace_members wm
  join workspaces w on w.id = wm.workspace_id
  join public.my_visible_members() v on v.account_id = w.account_id and v.user_id = wm.user_id
  where v.user_id <> (select auth.uid()) and w.archived_at is null;
$$;

-- Lectura extra por jerarquía (las políticas se suman con OR; escribir sigue exigiendo ser editor del espacio)
create policy tasks_select_hierarchy on public.tasks for select to authenticated
  using ((workspace_id, assignee_id) in (select s.workspace_id, s.user_id from public.my_hierarchy_task_scope() s));

create policy workspaces_select_hierarchy on public.workspaces for select to authenticated
  using (id in (select public.my_hierarchy_workspace_ids()));

-- departments: lectura para toda la cuenta, gestión para admins
alter table public.departments enable row level security;

create policy departments_select on public.departments for select to authenticated
  using (public.is_account_member(account_id));
create policy departments_insert on public.departments for insert to authenticated
  with check (public.is_account_admin(account_id));
create policy departments_update on public.departments for update to authenticated
  using (public.is_account_admin(account_id)) with check (public.is_account_admin(account_id));
create policy departments_delete on public.departments for delete to authenticated
  using (public.is_account_admin(account_id));

grant select, insert, update, delete on public.departments to authenticated;

-- account_members: los admins editan el organigrama (rol sigue protegido por protect_account_owner)
grant update (title, department_id, reports_to) on public.account_members to authenticated;

-- ------------------------------------------------------------
-- ESTADOS DE TAREAS POR ESPACIO
-- ------------------------------------------------------------
-- task_statuses: [{ "id": "s_review", "name": "En revisión cliente", "category": "in_progress" }, ...]
-- Vacío = los 5 estados estándar.
alter table public.workspaces add column task_statuses jsonb not null default '[]'::jsonb;
alter table public.tasks add column status_id text check (status_id is null or char_length(status_id) <= 40);

grant update (task_statuses) on public.workspaces to authenticated;

create or replace function public.workspaces_check_statuses()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s jsonb;
begin
  if jsonb_typeof(new.task_statuses) <> 'array' or jsonb_array_length(new.task_statuses) > 30 then
    raise exception 'invalid_statuses' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(new.task_statuses) loop
    if jsonb_typeof(s) <> 'object'
       or coalesce(char_length(s->>'id'), 0) not between 1 and 40
       or coalesce(char_length(s->>'name'), 0) not between 1 and 40
       or (s->>'category') not in ('backlog', 'todo', 'in_progress', 'blocked', 'done') then
      raise exception 'invalid_statuses' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

create trigger workspaces_check_statuses before insert or update of task_statuses on public.workspaces
  for each row execute function public.workspaces_check_statuses();

-- La categoría (tasks.status) siempre sale del estado propio elegido. Si alguien cambia
-- solo la categoría (p. ej. marcar como hecha), se toma el primer estado propio de esa
-- categoría. Corre antes que tasks_before_write (orden alfabético) para que completed_at
-- vea la categoría final.
create or replace function public.tasks_a_sync_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_statuses jsonb;
  v_category text;
begin
  select task_statuses into v_statuses from workspaces where id = new.workspace_id;
  if v_statuses is null or jsonb_array_length(v_statuses) = 0 then
    new.status_id = null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status_id is not distinct from old.status_id then
    select s->>'id' into new.status_id
    from jsonb_array_elements(v_statuses) s
    where s->>'category' = new.status
    limit 1;
  end if;

  if new.status_id is not null then
    select s->>'category' into v_category
    from jsonb_array_elements(v_statuses) s
    where s->>'id' = new.status_id;
    if v_category is null then
      if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
      new.status_id = null; -- el estado fue borrado del espacio: queda solo la categoría
    else
      new.status = v_category;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_a_sync_status before insert or update of status, status_id, workspace_id on public.tasks
  for each row execute function public.tasks_a_sync_status();

-- Si se borra un estado del espacio, sus tareas se quedan solo con la categoría
create or replace function public.workspaces_cleanup_statuses()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update tasks t set status_id = null
  where t.workspace_id = new.id
    and t.status_id is not null
    and not exists (select 1 from jsonb_array_elements(new.task_statuses) s where s->>'id' = t.status_id);
  return new;
end;
$$;

create trigger workspaces_cleanup_statuses after update of task_statuses on public.workspaces
  for each row execute function public.workspaces_cleanup_statuses();
-- ============================================================
-- Veltro v2 — Varios responsables por tarea
--
--   tasks + assignee_ids uuid[]: todos los responsables, en orden.
--   tasks.assignee_id queda como "el primero" y se mantiene solo: quien todavía escriba un
--   único responsable (cerrar una reunión, la API, @persona) sigue funcionando.
--   La lectura por jerarquía y las métricas de la consola miran a todos los responsables.
-- ============================================================

alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';
update public.tasks set assignee_ids = array[assignee_id] where assignee_id is not null and cardinality(assignee_ids) = 0;
create index if not exists tasks_assignee_ids_idx on public.tasks using gin (assignee_ids);

-- Mantiene assignee_ids y assignee_id de acuerdo (sin repetidos ni nulos, en orden) y valida que
-- cada responsable trabaje en el espacio. Corre antes que tasks_before_write (orden alfabético).
create or replace function public.tasks_sync_assignees()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.assignee_ids) = 0 and new.assignee_id is not null then
      new.assignee_ids := array[new.assignee_id];
    end if;
  elsif new.assignee_ids is not distinct from old.assignee_ids and new.assignee_id is distinct from old.assignee_id then
    -- alguien cambió solo el responsable único: reemplaza al primero y los demás se quedan
    new.assignee_ids := array_remove(old.assignee_ids, old.assignee_id);
    if new.assignee_id is not null then
      new.assignee_ids := array_prepend(new.assignee_id, new.assignee_ids);
    end if;
  end if;

  select coalesce(array_agg(x order by first_pos), '{}'::uuid[]) into new.assignee_ids
  from (select x, min(pos) as first_pos from unnest(new.assignee_ids) with ordinality u(x, pos) where x is not null group by x) s;

  if cardinality(new.assignee_ids) > 20 then
    raise exception 'too_many_assignees' using errcode = 'P0001';
  end if;

  -- solo se valida a quien entra (o a todos si la tarea cambia de espacio): quitar a alguien nunca falla
  foreach v_id in array new.assignee_ids loop
    if (tg_op = 'INSERT' or new.workspace_id <> old.workspace_id or not (v_id = any(old.assignee_ids)))
       and public.workspace_role_for(new.workspace_id, v_id) is null then
      raise exception 'assignee_not_in_workspace' using errcode = 'P0001';
    end if;
  end loop;

  new.assignee_id := new.assignee_ids[1];
  return new;
end;
$$;

drop trigger if exists tasks_a_sync_assignees on public.tasks;
create trigger tasks_a_sync_assignees before insert or update on public.tasks
  for each row execute function public.tasks_sync_assignees();

-- Si se borra una persona, sale de las listas de responsables (la FK solo cubría assignee_id)
create or replace function public.cleanup_assignees_on_profile_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.tasks set assignee_ids = array_remove(assignee_ids, old.id) where old.id = any(assignee_ids);
  return old;
end;
$$;

drop trigger if exists profiles_cleanup_assignees on public.profiles;
create trigger profiles_cleanup_assignees before delete on public.profiles
  for each row execute function public.cleanup_assignees_on_profile_delete();

-- Lectura por jerarquía: basta con que uno de los responsables esté en mi rama
drop policy if exists tasks_select_hierarchy on public.tasks;
create policy tasks_select_hierarchy on public.tasks for select to authenticated
  using (exists (
    select 1 from public.my_hierarchy_task_scope() s
    where s.workspace_id = tasks.workspace_id and s.user_id = any(tasks.assignee_ids)
  ));

-- Métricas de la consola por persona: cuenta las tareas donde es uno de los responsables
create or replace function public.usage_on_tasks()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform log_usage('task.created', null, new.workspace_id, new.created_by,
      jsonb_strip_nulls(jsonb_build_object(
        'from_meeting', case when new.meeting_id is not null then true end,
        'from_doc', case when new.doc_id is not null then true end,
        'subtask', case when new.parent_id is not null then true end)));
    return null;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    perform log_usage('task.completed', null, new.workspace_id, null,
      jsonb_build_object('hours', round(extract(epoch from now() - new.created_at) / 3600)));
  end if;
  if cardinality(new.assignee_ids) > 0 and new.assignee_ids is distinct from old.assignee_ids then
    perform log_usage('task.assigned', null, new.workspace_id);
  end if;
  if new.custom is distinct from old.custom then
    perform log_usage('task.custom_field', null, new.workspace_id);
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_usage on public.tasks;
create trigger tasks_usage after insert or update of status, assignee_ids, custom on public.tasks
  for each row execute function public.usage_on_tasks();

create or replace function public.user_load(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with t as (
    select t.* from tasks t
    join workspaces w on w.id = t.workspace_id and w.archived_at is null
    where p_user = any(t.assignee_ids)
  ),
  m as (
    select count(*) as n
    from meetings mt
    join profiles p on p.id = p_user
    where mt.starts_at >= now() and mt.starts_at < now() + interval '7 days'
      and (mt.created_by = p_user or mt.attendees @> jsonb_build_array(jsonb_build_object('email', p.email)))
  ),
  agg as (
    select
      count(*) filter (where status <> 'done') as open,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'blocked') as blocked,
      count(*) filter (where status <> 'done' and due_date < current_date) as overdue,
      count(*) filter (where status <> 'done' and due_date between current_date and current_date + 7) as due_7d,
      count(*) filter (where status <> 'done' and priority in ('urgent', 'high')) as urgent_high,
      coalesce(sum(estimate_hours) filter (where status <> 'done'), 0) as estimate_hours,
      count(*) filter (where status = 'done' and completed_at >= now() - interval '14 days') as done_14d
    from t
  )
  select jsonb_build_object(
    'open', a.open, 'in_progress', a.in_progress, 'blocked', a.blocked, 'overdue', a.overdue,
    'due_7d', a.due_7d, 'urgent_high', a.urgent_high, 'estimate_hours', a.estimate_hours,
    'done_14d', a.done_14d, 'meetings_7d', m.n,
    'score', round(a.open + a.overdue * 2 + a.urgent_high + a.due_7d + a.blocked + m.n * 0.5, 1)
  )
  from agg a, m;
$$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'profile', to_jsonb(p) - 'updated_at',
    'auth', jsonb_build_object(
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until,
      'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)
    ),
    'platform_role', (select role from platform_admins where user_id = p.id),
    'load', user_load(p.id),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'role', am.role, 'plan_id', a.plan_id, 'status', a.status, 'joined_at', am.created_at
      ) order by am.created_at), '[]'::jsonb)
      from account_members am join accounts a on a.id = am.account_id
      where am.user_id = p.id
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x order by x.last_activity desc nulls last), '[]'::jsonb)
      from (
        select w.id, w.name, w.slug, w.key, w.color, w.icon, a.name as account_name,
          public.workspace_role_for(w.id, p.id) as role,
          (select count(*) from tasks t where t.workspace_id = w.id and p.id = any(t.assignee_ids) and t.status <> 'done') as open_tasks,
          (select max(e.occurred_at) from usage_events e where e.workspace_id = w.id and e.user_id = p.id) as last_activity
        from workspaces w join accounts a on a.id = w.account_id
        where w.archived_at is null
          and w.account_id in (select account_id from account_members where user_id = p.id)
          and public.workspace_role_for(w.id, p.id) is not null
      ) x
    ),
    'tasks', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select t.id, w.key || '-' || t.number as ref, t.title, t.status, t.priority, t.due_date, w.name as workspace
        from tasks t join workspaces w on w.id = t.workspace_id
        where p.id = any(t.assignee_ids) and t.status <> 'done'
        order by (t.due_date is null), t.due_date, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end
        limit 12
      ) x
    ),
    'activity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'events', (select count(*) from usage_events e where e.user_id = p.id and e.occurred_at >= d.day and e.occurred_at < d.day + interval '1 day'),
        'minutes', (
          select coalesce(round(sum(extract(epoch from (least(s.last_seen_at, d.day + interval '1 day') - greatest(s.started_at, d.day))) / 60)), 0)
          from user_sessions s
          where s.user_id = p.id and s.last_seen_at >= d.day and s.started_at < d.day + interval '1 day'
        )
      ) order by d.day), '[]'::jsonb)
      from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') d(day)
    ),
    'top_events', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb)
      from (
        select event, count(*) as count from usage_events
        where user_id = p.id and occurred_at >= now() - interval '30 days'
        group by event order by count(*) desc limit 10
      ) x
    ),
    'recent_events', (
      select coalesce(jsonb_agg(x order by x.occurred_at desc), '[]'::jsonb)
      from (
        select e.id, e.event, e.occurred_at, e.props, w.name as workspace
        from usage_events e left join workspaces w on w.id = e.workspace_id
        where e.user_id = p.id
        order by e.occurred_at desc
        limit 40
      ) x
    ),
    'sessions', (
      select coalesce(jsonb_agg(x order by x.last_seen_at desc), '[]'::jsonb)
      from (
        select s.id, s.started_at, s.last_seen_at, s.device, s.browser, s.os, s.country, s.ip,
          round(extract(epoch from s.last_seen_at - s.started_at) / 60) as minutes
        from user_sessions s where s.user_id = p.id
        order by s.last_seen_at desc
        limit 25
      ) x
    ),
    'google', (
      select jsonb_build_object('email', g.google_email, 'connected_at', g.created_at, 'calendars', coalesce(array_length(g.selected_calendar_ids, 1), 0))
      from google_connections g where g.user_id = p.id
    ),
    'api_tokens', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'prefix', t.token_prefix, 'last_used_at', t.last_used_at, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from api_tokens t where t.user_id = p.id
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author', ap.full_name, 'author_id', n.author_id) order by n.created_at desc), '[]'::jsonb)
      from admin_notes n left join profiles ap on ap.id = n.author_id
      where n.subject_type = 'user' and n.subject_id = p.id
    ),
    'audit', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select l.id, l.action, l.summary, l.created_at, ap.full_name as actor
        from admin_audit_log l left join profiles ap on ap.id = l.actor_id
        where l.subject_type = 'user' and l.subject_id = p.id::text
        order by l.created_at desc limit 20
      ) x
    )
  ) into v_out
  from profiles p left join auth.users u on u.id = p.id
  where p.id = p_user;

  return v_out;
end;
$$;

create or replace function public.admin_workload(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  with loads as (
    select p.id, p.full_name, p.email, p.avatar_url, p.last_seen_at, user_load(p.id) as load,
      (select string_agg(a.name, ', ' order by am.created_at) from account_members am join accounts a on a.id = am.account_id where am.user_id = p.id) as accounts
    from profiles p
    where exists (select 1 from tasks t where p.id = any(t.assignee_ids))
       or p.last_seen_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'open', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done'),
      'overdue', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and t.due_date < current_date),
      'unassigned', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and cardinality(t.assignee_ids) = 0),
      'no_due', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status <> 'done' and t.due_date is null),
      'blocked', (select count(*) from tasks t join workspaces w on w.id = t.workspace_id and w.archived_at is null where t.status = 'blocked'),
      'done_7d', (select count(*) from tasks where completed_at >= now() - interval '7 days'),
      'created_7d', (select count(*) from tasks where created_at >= now() - interval '7 days'),
      'people', (select count(*) from loads where (load ->> 'open')::int > 0)
    ),
    'users', (
      select coalesce(jsonb_agg(x order by (x.load ->> 'score')::numeric desc), '[]'::jsonb)
      from (select * from loads order by (load ->> 'score')::numeric desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x
    ),
    'distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', b.label, 'users', (
        select count(*) from loads l where (l.load ->> 'open')::int between b.lo and b.hi
      )) order by b.lo), '[]'::jsonb)
      from (values ('0', 0, 0), ('1-5', 1, 5), ('6-10', 6, 10), ('11-20', 11, 20), ('21+', 21, 1000000)) b(label, lo, hi)
    ),
    'workspaces', (
      select coalesce(jsonb_agg(x order by x.tasks_open desc), '[]'::jsonb)
      from (
        select w.id, w.name, w.key, w.color, w.icon, a.name as account_name,
          count(t.id) filter (where t.status <> 'done') as tasks_open,
          count(t.id) filter (where t.status <> 'done' and t.due_date < current_date) as overdue,
          count(t.id) filter (where t.status <> 'done' and cardinality(t.assignee_ids) = 0) as unassigned,
          count(t.id) filter (where t.status = 'blocked') as blocked,
          (select count(distinct x) from tasks t2, unnest(t2.assignee_ids) x where t2.workspace_id = w.id and t2.status <> 'done') as people
        from workspaces w join accounts a on a.id = w.account_id
        left join tasks t on t.workspace_id = w.id
        where w.archived_at is null
        group by w.id, a.name
        having count(t.id) filter (where t.status <> 'done') > 0
        order by tasks_open desc
        limit 15
      ) x
    )
  ) into v_out;

  return v_out;
end;
$$;
commit;
