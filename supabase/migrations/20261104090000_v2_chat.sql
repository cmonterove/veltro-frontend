-- ============================================================
-- Veltro v2: Pasillo (chats del equipo)
--
-- chats          conversación directa o grupo dentro de una cuenta
-- chat_members   quién está en cada chat y hasta dónde leyó
-- chat_messages  mensajes y tarjetas (tarea, archivo, doc, invitación) y avisos de sistema
--
-- La web escribe directo, sin RPC: crea el chat, se agrega con los demás y después escribe.
-- Las políticas siguen ese orden. Las respuestas a invitaciones van por chat_rsvp(), porque
-- se guardan en el mensaje de otra persona.
-- ============================================================

create table public.chats (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  kind             text not null check (kind in ('direct', 'group')),
  name             text,
  created_by       uuid references public.profiles(id) on delete set null,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- un directo se muestra con el nombre de la otra persona
  check ((kind = 'group' and char_length(trim(name)) between 1 and 80) or (kind = 'direct' and name is null))
);

create index chats_account_recent_idx on public.chats(account_id, last_message_at desc);

create trigger chats_updated_at before update on public.chats
  for each row execute function public.set_updated_at();

create table public.chat_members (
  chat_id       uuid not null references public.chats(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  last_read_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index chat_members_user_idx on public.chat_members(user_id);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null default 'text' check (kind in ('text', 'task', 'file', 'doc', 'meeting', 'system')),
  body        text not null default '' check (char_length(body) <= 4000),
  -- lo compartido (tarea, adjunto o doc); sin FK porque apunta a tablas distintas
  ref_id      uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  check (kind not in ('task', 'file', 'doc') or ref_id is not null),
  check (kind <> 'meeting' or meta ? 'invite')
);

create index chat_messages_chat_time_idx on public.chat_messages(chat_id, created_at desc);

-- ============================================================
-- Permisos (SECURITY DEFINER para evitar recursión en RLS)
-- ============================================================

-- Miembro de la cuenta, con la cuenta activa y la persona sin suspender
create or replace function public.is_active_account_member(p_account uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from account_members am
    join accounts a on a.id = am.account_id and a.status = 'active'
    join profiles p on p.id = am.user_id and p.suspended_at is null
    where am.account_id = p_account and am.user_id = (select auth.uid())
  );
$$;

-- Los chats donde estoy (de cuentas activas y sin estar suspendido)
create or replace function public.my_chat_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.chat_id
  from chat_members m
  join chats c on c.id = m.chat_id
  join accounts a on a.id = c.account_id and a.status = 'active'
  join profiles p on p.id = m.user_id and p.suspended_at is null
  where m.user_id = (select auth.uid());
$$;

-- Quién puede sumar gente a un chat: quien lo creó, mientras está vacío (el alta inicial),
-- o cualquier miembro de un grupo. STABLE a propósito: en el insert de varias filas, todas
-- ven el chat todavía vacío.
create or replace function public.can_add_chat_members(p_chat uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from chats c
    where c.id = p_chat
      and public.is_active_account_member(c.account_id)
      and (
        (c.created_by = (select auth.uid()) and not exists (select 1 from chat_members m where m.chat_id = c.id))
        or (c.kind = 'group' and exists (select 1 from chat_members m where m.chat_id = c.id and m.user_id = (select auth.uid())))
      )
  );
$$;

-- ============================================================
-- Triggers
-- ============================================================

create or replace function public.chats_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.last_message_at := null;
    new.created_at := now();
  else
    new.account_id := old.account_id;
    new.kind := old.kind;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger chats_before_write before insert or update on public.chats
  for each row execute function public.chats_before_write();

-- Solo personas de la cuenta del chat; un directo tiene dos personas
create or replace function public.chat_members_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_chat chats%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.chat_id := old.chat_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.created_at := old.created_at;
    return new;
  end if;
  select * into v_chat from chats where id = new.chat_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from account_members where account_id = v_chat.account_id and user_id = new.user_id) then
    raise exception 'member_not_in_account' using errcode = 'P0001';
  end if;
  if v_chat.kind = 'direct' and (select count(*) from chat_members where chat_id = new.chat_id) >= 2 then
    raise exception 'chat_direct_full' using errcode = 'P0001';
  end if;
  new.last_read_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger chat_members_before_write before insert or update on public.chat_members
  for each row execute function public.chat_members_before_write();

-- Al salir de la cuenta, sale de sus chats
create or replace function public.cleanup_chat_memberships()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from chat_members cm
  using chats c
  where cm.chat_id = c.id
    and c.account_id = old.account_id
    and cm.user_id = old.user_id;
  return old;
end;
$$;

create trigger account_members_cleanup_chats after delete on public.account_members
  for each row execute function public.cleanup_chat_memberships();

create or replace function public.chat_messages_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce((select auth.uid()), new.user_id);
    new.created_at := now();
    new.edited_at := null;
  else
    new.chat_id := old.chat_id;
    new.user_id := old.user_id;
    new.kind := old.kind;
    new.ref_id := old.ref_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger chat_messages_before_write before insert or update on public.chat_messages
  for each row execute function public.chat_messages_before_write();

-- El chat sube en la lista y quien escribe ya leyó hasta aquí
create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update chats set last_message_at = new.created_at where id = new.chat_id;
  if new.user_id is not null then
    update chat_members set last_read_at = new.created_at
    where chat_id = new.chat_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger chat_messages_after_insert after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();

-- ============================================================
-- RLS
-- ============================================================

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- quien crea el chat lo ve aunque todavía no haya miembros (el insert devuelve la fila)
create policy chats_select on public.chats for select to authenticated
  using (
    id in (select public.my_chat_ids())
    or (created_by = (select auth.uid()) and public.is_active_account_member(account_id))
  );
create policy chats_insert on public.chats for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_active_account_member(account_id));
-- renombrar un grupo (único campo editable, por grant de columna)
create policy chats_update on public.chats for update to authenticated
  using (kind = 'group' and id in (select public.my_chat_ids()))
  with check (kind = 'group' and id in (select public.my_chat_ids()));

create policy chat_members_select on public.chat_members for select to authenticated
  using (chat_id in (select public.my_chat_ids()));
create policy chat_members_insert on public.chat_members for insert to authenticated
  with check (
    public.can_add_chat_members(chat_id)
    and (role = 'member' or user_id = (select auth.uid()))
  );
-- marcar como leído (único campo editable)
create policy chat_members_update on public.chat_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- salir del chat
create policy chat_members_delete on public.chat_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy chat_messages_select on public.chat_messages for select to authenticated
  using (chat_id in (select public.my_chat_ids()));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and chat_id in (select public.my_chat_ids()));
create policy chat_messages_update on public.chat_messages for update to authenticated
  using (user_id = (select auth.uid()) and chat_id in (select public.my_chat_ids()))
  with check (user_id = (select auth.uid()) and chat_id in (select public.my_chat_ids()));
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()) and chat_id in (select public.my_chat_ids()));

revoke update on public.chats from anon, authenticated;
grant update (name) on public.chats to authenticated;
revoke update on public.chat_members from anon, authenticated;
grant update (last_read_at) on public.chat_members to authenticated;
revoke update on public.chat_messages from anon, authenticated;
grant update (body) on public.chat_messages to authenticated;
revoke all on public.chats, public.chat_members, public.chat_messages from anon;

-- ============================================================
-- Respuesta a una invitación de reunión: se guarda en meta.invite.rsvp del mensaje
-- ============================================================

create or replace function public.chat_rsvp(p_message uuid, p_answer text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_answer is null or p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_answer' using errcode = 'P0001';
  end if;
  update chat_messages
  set meta = jsonb_set(meta, '{invite,rsvp}', coalesce(meta #> '{invite,rsvp}', '{}'::jsonb) || jsonb_build_object(v_uid::text, p_answer))
  where id = p_message
    and kind = 'meeting'
    and chat_id in (select public.my_chat_ids());
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.chat_rsvp(uuid, text) from public, anon;
grant execute on function public.chat_rsvp(uuid, text) to authenticated;

-- ============================================================
-- Tiempo real (Realtime respeta RLS). Fuera de Supabase la publicación no existe.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chats, public.chat_members, public.chat_messages;
  end if;
end;
$$;
