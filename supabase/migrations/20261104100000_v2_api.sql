-- ============================================================
-- Veltro v2: lo que necesita la API (veltro-backend) sobre esta base
--
-- Trae aquí la migración api_hardening del backend, fusionada con lo que vino después
-- en este repo (v2_admin redefinió my_workspace_ids y my_editable_workspace_ids con las
-- suspensiones; aplicar la del backend tal cual las borraba):
--   · Tokens de API con alcance (lectura/escritura, espacios, vencimiento). El alcance
--     viaja en el claim `vlt` que pone la API en cada transacción y lo aplica RLS.
--   · Solo el dueño de la cuenta da o quita el rol admin.
--   · Desarchivar un espacio respeta el límite del plan.
--   · Bitácora de la API (audit_logs) e idempotencia de escrituras.
--   · session_ended(): cerrar sesión corta el acceso en el acto.
--   · Storage: solo los tipos de archivo que admite la API.
-- ============================================================

-- ------------------------------------------------------------
-- Tokens de API
-- ------------------------------------------------------------
alter table public.api_tokens
  add column if not exists scopes        text[] not null default '{read,write}',
  add column if not exists workspace_ids uuid[],
  add column if not exists expires_at    timestamptz,
  add column if not exists last_used_ip  inet;

alter table public.api_tokens drop constraint if exists api_tokens_scopes_check;
alter table public.api_tokens
  add constraint api_tokens_scopes_check check (cardinality(scopes) > 0 and scopes <@ array['read', 'write']::text[]);

-- ¿El token de esta petición (si hay) permite este espacio / escribir?
-- Sin claim `vlt` (sesión normal o PostgREST) no restringe nada.
create or replace function public.token_allows(p_workspace uuid, p_write boolean)
returns boolean
language sql stable
as $$
  select case
    when jsonb_typeof(auth.jwt() -> 'vlt') is distinct from 'object' then true
    else
      (jsonb_typeof(auth.jwt() -> 'vlt' -> 'ws') is distinct from 'array'
        or (auth.jwt() -> 'vlt' -> 'ws') ? p_workspace::text)
      and (not p_write or coalesce((auth.jwt() -> 'vlt' ->> 'ro')::boolean, false) = false)
  end;
$$;

-- Como en v2_admin (cuenta activa, persona sin suspender) más el alcance del token
create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select x.id from (
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
      and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null)
  ) x(id)
  where public.token_allows(x.id, false);
$$;

create or replace function public.my_editable_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select x.id from (
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
      and not exists (select 1 from profiles p where p.id = (select auth.uid()) and p.suspended_at is not null)
  ) x(id)
  where public.token_allows(x.id, true);
$$;

-- Rol efectivo de quien llama: un token de solo lectura queda como viewer.
-- workspace_role_for ya mira las suspensiones (v2_admin).
create or replace function public.workspace_role(p_workspace uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when not public.token_allows(p_workspace, false) then null
    when s.r in ('admin', 'editor') and not public.token_allows(p_workspace, true) then 'viewer'
    else s.r
  end
  from (select public.workspace_role_for(p_workspace, (select auth.uid())) as r) s;
$$;

-- Administrar la cuenta nunca se hace con un token de API.
create or replace function public.is_account_admin(p_account uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select jsonb_typeof(auth.jwt() -> 'vlt') is distinct from 'object'
    and exists (
      select 1 from account_members
      where account_id = p_account
        and user_id = (select auth.uid())
        and role in ('owner', 'admin')
    );
$$;

-- ------------------------------------------------------------
-- Solo el dueño da o quita el rol admin (los admins gestionan miembros)
-- ------------------------------------------------------------
create or replace function public.protect_account_admin_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account uuid;
  v_needs_owner boolean := false;
begin
  if v_uid is null then
    -- service_role / migraciones
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_account := new.account_id;
    v_needs_owner := new.role = 'admin';
  elsif tg_op = 'UPDATE' then
    v_account := new.account_id;
    v_needs_owner := new.role is distinct from old.role and (new.role = 'admin' or old.role = 'admin');
  else
    v_account := old.account_id;
    v_needs_owner := old.role = 'admin' and old.user_id <> v_uid;
  end if;

  if v_needs_owner and not exists (select 1 from accounts where id = v_account and owner_id = v_uid) then
    raise exception 'owner_only' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists account_members_protect_admin on public.account_members;
create trigger account_members_protect_admin before insert or update or delete on public.account_members
  for each row execute function public.protect_account_admin_role();

-- ------------------------------------------------------------
-- Desarchivar un espacio cuenta para el límite del plan
-- ------------------------------------------------------------
create or replace function public.enforce_workspace_unarchive_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
  v_count integer;
begin
  if old.archived_at is not null and new.archived_at is null then
    select p.max_workspaces into v_max
    from accounts a join plans p on p.id = a.plan_id
    where a.id = new.account_id;
    if v_max is not null then
      select count(*) into v_count
      from workspaces where account_id = new.account_id and archived_at is null and id <> new.id;
      if v_count >= v_max then
        raise exception 'plan_limit_workspaces' using errcode = 'P0001', hint = v_max::text;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_enforce_unarchive_limit on public.workspaces;
create trigger workspaces_enforce_unarchive_limit before update of archived_at on public.workspaces
  for each row execute function public.enforce_workspace_unarchive_limit();

-- ------------------------------------------------------------
-- Bitácora de la API. La escribe solo la API (service_role); la leen los admins de la
-- cuenta y, para lo de un espacio, quienes tienen acceso a ese espacio.
-- Nunca guarda contraseñas, tokens ni contenido de docs. (La de la consola es admin_audit_log.)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  account_id    uuid references public.accounts(id) on delete cascade,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  actor_id      uuid references public.profiles(id) on delete set null,
  via           text not null default 'session' check (via in ('session', 'api_token', 'system')),
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type   text,
  target_id     text,
  data          jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_account_idx on public.audit_logs(account_id, created_at desc);
create index if not exists audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_account_admin(account_id) or workspace_id in (select public.my_workspace_ids()));

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
revoke all on public.audit_logs from anon;

-- ------------------------------------------------------------
-- Idempotencia: Idempotency-Key en escrituras (reintentos seguros)
-- ------------------------------------------------------------
create table if not exists public.idempotency_keys (
  user_id       uuid not null,
  key           text not null check (char_length(key) between 8 and 120),
  method        text not null,
  path          text not null,
  request_hash  text not null,
  status        integer,
  response      jsonb,
  created_at    timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idempotency_keys_created_idx on public.idempotency_keys(created_at);

alter table public.idempotency_keys enable row level security;
revoke all on public.idempotency_keys from anon, authenticated;

-- ------------------------------------------------------------
-- ¿Se cerró esta sesión? (auth.sessions en Supabase y en el modo local)
-- Si la tabla no está disponible, no bloquea: el token vence solo.
-- ------------------------------------------------------------
create or replace function public.session_ended(p_sid uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return not exists (
    select 1 from auth.sessions s
    where s.id = p_sid and (s.not_after is null or s.not_after > now())
  );
exception when others then
  return false;
end;
$$;

revoke execute on function public.session_ended(uuid) from public, anon, authenticated;
grant execute on function public.session_ended(uuid) to service_role;
revoke execute on function public.token_allows(uuid, boolean) from public, anon;
grant execute on function public.token_allows(uuid, boolean) to authenticated, service_role;

-- ------------------------------------------------------------
-- Índices para búsquedas y vistas de la API
-- ------------------------------------------------------------
create index if not exists tasks_workspace_due_idx on public.tasks(workspace_id, due_date) where status <> 'done';
create index if not exists tasks_workspace_updated_idx on public.tasks(workspace_id, updated_at desc);
create index if not exists meetings_workspace_phase_idx on public.meetings(workspace_id, phase, starts_at);
create index if not exists docs_workspace_source_idx on public.docs(workspace_id, source, updated_at desc);

-- ------------------------------------------------------------
-- Storage: solo tipos de archivo admitidos (mismo listado que la API).
-- Fuera: SVG, HTML, XML, JS y ejecutables.
-- ------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
  'application/rtf', 'application/zip',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg',
  'video/mp4', 'video/webm', 'video/quicktime'
],
file_size_limit = 20971520
where id = 'attachments';
