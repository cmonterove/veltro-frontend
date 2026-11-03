-- ============================================================
-- Veltro v2: soporte (tickets) y requerimientos (pedidos de función a Veltro)
--
-- Nacen en la app móvil. Un TICKET reporta un problema; a quién le llega depende del rol de
-- quien lo crea, según accounts.support_routing (lo cambia solo el dueño):
--   account_admins → dueño y admins de la cuenta · account_owner → el dueño · veltro → equipo de Veltro (consola)
-- Un REQUERIMIENTO es un pedido de función a Veltro con estados recibido → en evaluación →
-- planificado → hecho (o descartado); los miembros de la cuenta lo apoyan.
--
-- El destino, el código correlativo (VT-0001, RQ-001) y los cambios de estado los calcula la
-- base, no el cliente.
-- ============================================================

-- ---------- cuenta: destino por rol y correlativos ----------

alter table public.accounts
  add column if not exists support_routing jsonb not null
    default '{"member":"account_admins","admin":"veltro","owner":"veltro"}'::jsonb,
  add column if not exists ticket_seq integer not null default 0,
  add column if not exists request_seq integer not null default 0;

-- los correlativos no cuentan como «la cuenta cambió»: updated_at solo se mueve con cambios reales
drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts
  for each row
  when ((to_jsonb(old) - 'ticket_seq' - 'request_seq' - 'updated_at') is distinct from (to_jsonb(new) - 'ticket_seq' - 'request_seq' - 'updated_at'))
  execute function public.set_updated_at();

alter table public.accounts drop constraint if exists accounts_support_routing_valid;
alter table public.accounts add constraint accounts_support_routing_valid check (
  support_routing ?& array['member', 'admin', 'owner']
  and support_routing->>'member' in ('account_admins', 'account_owner', 'veltro')
  and support_routing->>'admin' in ('account_admins', 'account_owner', 'veltro')
  and support_routing->>'owner' in ('account_admins', 'account_owner', 'veltro')
  -- el dueño no se escribe a sí mismo
  and support_routing->>'owner' <> 'account_owner'
);

-- ---------- tickets ----------

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  workspace_id    uuid references public.workspaces(id) on delete set null,
  code            text not null,
  title           text not null check (char_length(trim(title)) between 4 and 120),
  category        text not null default 'other' check (category in ('error', 'access', 'data', 'calendar', 'other')),
  urgent          boolean not null default false,
  where_text      text check (where_text is null or char_length(where_text) <= 80),
  screenshots     text[] not null default '{}' check (cardinality(screenshots) <= 3),
  status          text not null default 'open' check (status in ('open', 'in_review', 'answered', 'resolved')),
  destination     text not null check (destination in ('account_admins', 'account_owner', 'veltro')),
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (account_id, code)
);
create index support_tickets_account_idx on public.support_tickets (account_id, last_message_at desc);
create index support_tickets_creator_idx on public.support_tickets (created_by, last_message_at desc);
create index support_tickets_veltro_idx on public.support_tickets (status, last_message_at desc) where destination = 'veltro';

-- author_kind: member (alguien de la cuenta), veltro (equipo de Veltro; la app muestra «Veltro», no
-- el nombre de la persona) o system (cambio de estado; body = el estado nuevo, la app lo traduce).
create table public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  author_kind text not null default 'member' check (author_kind in ('member', 'veltro', 'system')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

create table public.support_ticket_reads (
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- ---------- requerimientos ----------

create table public.feature_requests (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  code         text not null,
  title        text not null check (char_length(trim(title)) between 4 and 120),
  need         text not null check (char_length(trim(need)) between 10 and 2000),
  why          text check (why is null or char_length(why) <= 600),
  impact       text not null default 'nice' check (impact in ('blocks', 'saves_time', 'nice')),
  status       text not null default 'received' check (status in ('received', 'evaluating', 'planned', 'done', 'declined')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (account_id, code)
);
create index feature_requests_account_idx on public.feature_requests (account_id, updated_at desc);
create index feature_requests_status_idx on public.feature_requests (status, updated_at desc);

-- cada cambio de estado deja una actualización con su texto (por defecto, de Veltro)
create table public.feature_request_updates (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.feature_requests(id) on delete cascade,
  status      text not null check (status in ('received', 'evaluating', 'planned', 'done', 'declined')),
  body        text not null default '' check (char_length(body) <= 2000),
  author_kind text not null default 'veltro' check (author_kind in ('veltro', 'member')),
  author_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index feature_request_updates_request_idx on public.feature_request_updates (request_id, created_at);

create table public.feature_request_supporters (
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table public.feature_request_reads (
  request_id   uuid not null references public.feature_requests(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- ---------- reglas ----------

create or replace function public.account_role_of(p_account uuid, p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from account_members where account_id = p_account and user_id = p_user;
$$;

-- ¿A esta persona le llegan los tickets con ese destino? (veltro → nadie de la cuenta)
create or replace function public.support_ticket_recipient(p_ticket public.support_tickets, p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case p_ticket.destination
    when 'account_owner' then exists (select 1 from accounts a where a.id = p_ticket.account_id and a.owner_id = p_user)
    when 'account_admins' then public.account_role_of(p_ticket.account_id, p_user) in ('owner', 'admin')
    else false
  end;
$$;

create or replace function public.support_tickets_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
  v_seq  integer;
  v_routing jsonb;
begin
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  v_role := public.account_role_of(new.account_id, new.created_by);
  if v_role is null then
    raise exception 'not_account_member' using errcode = '42501';
  end if;
  update accounts set ticket_seq = ticket_seq + 1
    where id = new.account_id
    returning ticket_seq, support_routing into v_seq, v_routing;
  new.code := 'VT-' || lpad(v_seq::text, 4, '0');
  -- el destino lo decide la base, según el rol de quien lo crea
  new.destination := coalesce(v_routing->>v_role, 'veltro');
  new.status := 'open';
  new.created_at := now();
  new.updated_at := now();
  new.last_message_at := now();
  new.resolved_at := null;
  return new;
end;
$$;

create trigger support_tickets_before_insert before insert on public.support_tickets
  for each row execute function public.support_tickets_before_insert();

-- Lo que escribió quien lo creó no cambia. Al cambiar el estado queda un mensaje de sistema;
-- resolver marca resolved_at. Qué estado puede poner cada quien desde la app lo decide la política
-- support_tickets_update (más abajo).
create or replace function public.support_tickets_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  new.id := old.id;
  new.account_id := old.account_id;
  new.code := old.code;
  new.destination := old.destination;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.title := old.title;
  new.category := old.category;
  new.urgent := old.urgent;
  new.where_text := old.where_text;
  new.screenshots := old.screenshots;
  new.workspace_id := old.workspace_id;
  if new.status is distinct from old.status then
    new.resolved_at := case when new.status = 'resolved' then now() else null end;
    -- clock_timestamp: el aviso queda después del mensaje que lo provocó (misma transacción)
    insert into support_ticket_messages (ticket_id, author_id, author_kind, body, created_at)
      values (new.id, v_uid, 'system', new.status, clock_timestamp());
    new.last_message_at := clock_timestamp();
  else
    new.last_message_at := greatest(old.last_message_at, new.last_message_at);
    new.resolved_at := old.resolved_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger support_tickets_before_update before update on public.support_tickets
  for each row execute function public.support_tickets_before_update();

-- Responder mueve el estado: si responde quien lo recibe (o Veltro) queda «respondido»; si
-- vuelve a escribir quien lo creó sobre un ticket respondido, queda «en revisión».
create or replace function public.support_ticket_messages_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  t public.support_tickets;
begin
  if new.author_kind = 'system' then
    return new;
  end if;
  select * into t from support_tickets where id = new.ticket_id;
  update support_tickets
    set last_message_at = new.created_at,
        status = case
          when t.status = 'resolved' then t.status
          when new.author_kind = 'veltro' or new.author_id is distinct from t.created_by then 'answered'
          when t.status = 'answered' then 'in_review'
          else t.status
        end
    where id = new.ticket_id;
  -- quien escribe ya leyó hasta aquí
  if new.author_id is not null then
    insert into support_ticket_reads (ticket_id, user_id, last_read_at) values (new.ticket_id, new.author_id, new.created_at)
      on conflict (ticket_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;
  return new;
end;
$$;

create trigger support_ticket_messages_after_insert after insert on public.support_ticket_messages
  for each row execute function public.support_ticket_messages_after_insert();

create or replace function public.feature_requests_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_seq integer;
begin
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  if public.account_role_of(new.account_id, new.created_by) is null then
    raise exception 'not_account_member' using errcode = '42501';
  end if;
  update accounts set request_seq = request_seq + 1 where id = new.account_id returning request_seq into v_seq;
  new.code := 'RQ-' || lpad(v_seq::text, 3, '0');
  new.status := 'received';
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger feature_requests_before_insert before insert on public.feature_requests
  for each row execute function public.feature_requests_before_insert();

-- quien lo pide ya lo apoya, y queda la primera actualización (recibido)
create or replace function public.feature_requests_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into feature_request_supporters (request_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  insert into feature_request_updates (request_id, status, body, author_kind) values (new.id, 'received', '', 'veltro');
  insert into feature_request_reads (request_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  return new;
end;
$$;

create trigger feature_requests_after_insert after insert on public.feature_requests
  for each row execute function public.feature_requests_after_insert();

-- una actualización nueva mueve el estado del requerimiento
create or replace function public.feature_request_updates_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update feature_requests set status = new.status, updated_at = new.created_at where id = new.request_id;
  return new;
end;
$$;

create trigger feature_request_updates_after_insert after insert on public.feature_request_updates
  for each row execute function public.feature_request_updates_after_insert();

-- Destino por rol: solo el dueño de la cuenta.
create or replace function public.set_support_routing(p_account uuid, p_routing jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from accounts where id = p_account and owner_id = (select auth.uid())) then
    raise exception 'only_owner' using errcode = '42501';
  end if;
  update accounts set support_routing = p_routing where id = p_account;
  return p_routing;
end;
$$;

-- ---------- RLS ----------

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_reads enable row level security;
alter table public.feature_requests enable row level security;
alter table public.feature_request_updates enable row level security;
alter table public.feature_request_supporters enable row level security;
alter table public.feature_request_reads enable row level security;

-- Un ticket lo ven quien lo creó y quienes lo reciben dentro de la cuenta.
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (created_by = (select auth.uid()) or public.support_ticket_recipient(support_tickets, (select auth.uid())));
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_account_member(account_id));
-- Desde la app: quien lo creó solo puede resolverlo o reabrirlo; quienes lo reciben pueden además
-- tomarlo (en revisión). «Respondido» lo pone la base al responder (el trigger de mensajes corre como
-- dueño de la tabla y no pasa por esta política), igual que las funciones admin_* de la consola.
create policy support_tickets_update on public.support_tickets for update to authenticated
  using (created_by = (select auth.uid()) or public.support_ticket_recipient(support_tickets, (select auth.uid())))
  with check (
    (created_by = (select auth.uid()) and status in ('open', 'resolved'))
    or (public.support_ticket_recipient(support_tickets, (select auth.uid())) and status in ('open', 'in_review', 'resolved'))
  );

create policy support_ticket_messages_select on public.support_ticket_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id));
create policy support_ticket_messages_insert on public.support_ticket_messages for insert to authenticated
  with check (
    author_kind = 'member' and author_id = (select auth.uid())
    and exists (select 1 from support_tickets t where t.id = ticket_id)
  );

create policy support_ticket_reads_all on public.support_ticket_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Los requerimientos los ve toda la cuenta; el estado solo lo cambia Veltro (consola).
create policy feature_requests_select on public.feature_requests for select to authenticated
  using (public.is_account_member(account_id));
create policy feature_requests_insert on public.feature_requests for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_account_member(account_id));

create policy feature_request_updates_select on public.feature_request_updates for select to authenticated
  using (exists (select 1 from feature_requests r where r.id = request_id));

create policy feature_request_supporters_select on public.feature_request_supporters for select to authenticated
  using (exists (select 1 from feature_requests r where r.id = request_id));
create policy feature_request_supporters_insert on public.feature_request_supporters for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from feature_requests r where r.id = request_id));
create policy feature_request_supporters_delete on public.feature_request_supporters for delete to authenticated
  using (user_id = (select auth.uid()));

create policy feature_request_reads_all on public.feature_request_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
grant select, insert, update, delete on public.support_ticket_reads to authenticated;
grant select, insert on public.feature_requests to authenticated;
grant select on public.feature_request_updates to authenticated;
grant select, insert, delete on public.feature_request_supporters to authenticated;
grant select, insert, update, delete on public.feature_request_reads to authenticated;
grant execute on function public.set_support_routing(uuid, jsonb) to authenticated;
