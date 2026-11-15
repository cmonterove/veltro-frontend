-- ============================================================
-- Veltro v2: Pasillo con hilos, reacciones y mensajes fijados
--
-- chat_messages.thread_id  respuesta dentro del hilo de un mensaje (el mensaje raíz). Las
--                          respuestas no salen en la conversación principal; el raíz muestra
--                          cuántas tiene. Se responde a un raíz, no a otra respuesta.
-- chat_reactions           una reacción (emoji) de una persona a un mensaje; una por emoji.
-- chat_pins                mensajes fijados del chat (cualquiera del chat fija y desfija).
--
-- Reacciones y fijados avisan en vivo como un cambio del mensaje (msg_upd); la respuesta en un
-- hilo avisa (chat_thread) a quien escribió el raíz y a quienes ya respondieron.
-- ============================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined', 'task_status', 'task_due_changed',
  'task_unblocked', 'request_new', 'request_message', 'request_status', 'chat_thread'
));

alter table public.chat_messages add column if not exists thread_id uuid references public.chat_messages(id) on delete cascade;
create index if not exists chat_messages_thread_idx on public.chat_messages(thread_id, created_at) where thread_id is not null;

-- el hilo es de un mensaje del mismo chat, que no es respuesta ni aviso, y no se cambia después
create or replace function public.chat_messages_thread_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.thread_id := old.thread_id;
    return new;
  end if;
  if new.thread_id is not null and not exists (
    select 1 from chat_messages r
    where r.id = new.thread_id and r.chat_id = new.chat_id and r.thread_id is null and r.kind <> 'system' and r.deleted_at is null
  ) then
    raise exception 'thread_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chat_messages_thread_check before insert or update on public.chat_messages
  for each row execute function public.chat_messages_thread_check();

-- Responder en un hilo: el raíz cambia (cuenta de respuestas) y avisa a quien lo escribió y a
-- quienes ya respondieron, salvo que ya los mencione.
create or replace function public.chat_messages_thread_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_root chat_messages%rowtype;
  v_to uuid[];
  v_account uuid;
begin
  if new.thread_id is null then
    return null;
  end if;
  select * into v_root from chat_messages where id = new.thread_id;
  select array_agg(user_id) into v_to from chat_members where chat_id = new.chat_id;
  perform public.veltro_emit('msg_upd', v_to, jsonb_build_object('chat', new.chat_id, 'msg', v_root.id, 'by', new.user_id, 'kind', 'thread'));
  select account_id into v_account from chats where id = new.chat_id;
  perform public.notify_people('chat_thread',
    array(
      select distinct u from (
        select v_root.user_id as u
        union select m.user_id from chat_messages m where m.thread_id = new.thread_id and m.id <> new.id and m.deleted_at is null
      ) x
      where u is not null and u is distinct from new.user_id and not (u = any(new.mentions))
        and exists (select 1 from chat_members cm where cm.chat_id = new.chat_id and cm.user_id = u)
    ),
    new.user_id, v_account, null, null, null, new.chat_id, new.id, jsonb_build_object('root', new.thread_id));
  return null;
end;
$$;

create trigger chat_messages_thread_after_insert after insert on public.chat_messages
  for each row execute function public.chat_messages_thread_after_insert();

-- ============================================================
-- Reacciones
-- ============================================================

create table public.chat_reactions (
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index chat_reactions_message_idx on public.chat_reactions(message_id, created_at);

alter table public.chat_reactions enable row level security;

create policy chat_reactions_select on public.chat_reactions for select to authenticated
  using (exists (select 1 from public.chat_messages m where m.id = message_id and m.chat_id in (select public.my_chat_ids())));
create policy chat_reactions_insert on public.chat_reactions for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.chat_messages m where m.id = message_id and m.chat_id in (select public.my_chat_ids()) and m.deleted_at is null and m.kind <> 'system'));
create policy chat_reactions_delete on public.chat_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.chat_reactions from anon, authenticated;
grant select, insert, delete on public.chat_reactions to authenticated;
grant all on public.chat_reactions to service_role;

-- ============================================================
-- Fijados
-- ============================================================

create table public.chat_pins (
  chat_id     uuid not null references public.chats(id) on delete cascade,
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  pinned_by   uuid references public.profiles(id) on delete set null,
  pinned_at   timestamptz not null default now(),
  primary key (chat_id, message_id)
);

create or replace function public.chat_pins_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from chat_messages m where m.id = new.message_id and m.chat_id = new.chat_id and m.deleted_at is null and m.kind <> 'system') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  new.pinned_by := coalesce((select auth.uid()), new.pinned_by);
  new.pinned_at := now();
  return new;
end;
$$;

create trigger chat_pins_before_insert before insert on public.chat_pins
  for each row execute function public.chat_pins_before_insert();

alter table public.chat_pins enable row level security;

create policy chat_pins_select on public.chat_pins for select to authenticated
  using (chat_id in (select public.my_chat_ids()));
create policy chat_pins_insert on public.chat_pins for insert to authenticated
  with check (chat_id in (select public.my_chat_ids()));
create policy chat_pins_delete on public.chat_pins for delete to authenticated
  using (chat_id in (select public.my_chat_ids()));

revoke all on public.chat_pins from anon, authenticated;
grant select, insert, delete on public.chat_pins to authenticated;
grant all on public.chat_pins to service_role;

-- un mensaje borrado deja de estar fijado
create or replace function public.chat_messages_unpin_deleted()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from chat_pins where message_id = new.id;
    delete from chat_reactions where message_id = new.id;
  end if;
  return null;
end;
$$;

create trigger chat_messages_unpin_deleted after update of deleted_at on public.chat_messages
  for each row execute function public.chat_messages_unpin_deleted();

-- Reacciones y fijados: en vivo, como un cambio del mensaje
create or replace function public.chat_message_touch()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_msg uuid;
  v_chat uuid;
  v_to uuid[];
begin
  if tg_op = 'DELETE' then
    v_msg := old.message_id;
  else
    v_msg := new.message_id;
  end if;
  select chat_id into v_chat from chat_messages where id = v_msg;
  if v_chat is null then
    return null;
  end if;
  select array_agg(user_id) into v_to from chat_members where chat_id = v_chat;
  perform public.veltro_emit('msg_upd', v_to, jsonb_build_object('chat', v_chat, 'msg', v_msg, 'by', (select auth.uid()), 'kind', tg_table_name));
  return null;
end;
$$;

create trigger chat_reactions_touch after insert or delete on public.chat_reactions
  for each row execute function public.chat_message_touch();
create trigger chat_pins_touch after insert or delete on public.chat_pins
  for each row execute function public.chat_message_touch();
