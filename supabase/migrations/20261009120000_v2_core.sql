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
