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
