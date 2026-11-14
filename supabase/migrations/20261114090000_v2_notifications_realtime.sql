-- ============================================================
-- Veltro v2: avisos (notificaciones), menciones y tiempo real
--
-- notifications      avisos para una persona: te asignaron una tarea, comentaron o terminaron
--                    una tarea tuya, te mencionaron en un comentario o en Pasillo
-- chat_messages      + mentions (personas mencionadas) y deleted_at (borrado suave)
-- task_comments      + mentions
-- veltro_events      canal de pg_notify: cada cambio que importa en vivo (mensaje nuevo, editado,
--                    leído, aviso nuevo, alguien escribiendo). La API lo escucha y lo reenvía por
--                    SSE solo a quien corresponde. Lleva ids, nunca contenido: el detalle se pide
--                    por la API con los permisos de cada quien.
--
-- Los avisos los crean triggers (no la API): así salen igual si la tarea se edita desde la web,
-- el celular o el asistente. Las escrituras sin persona (semillas, trabajos) no avisan.
-- ============================================================

alter table public.chat_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.task_comments add column if not exists mentions uuid[] not null default '{}';

-- ============================================================
-- Eventos en vivo
-- ============================================================

-- Avisa por pg_notify a esas personas. Si la lista no cabe en el límite de NOTIFY (8000 bytes),
-- va sin ella y con many=true: la API busca a los miembros del chat.
create or replace function public.veltro_emit(p_type text, p_to uuid[], p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_to uuid[] := array(select distinct x from unnest(p_to) x where x is not null);
  v text;
begin
  if cardinality(v_to) = 0 then
    return;
  end if;
  v := (jsonb_build_object('t', p_type, 'to', to_jsonb(v_to)) || coalesce(p_data, '{}'::jsonb))::text;
  if octet_length(v) > 7800 then
    v := (jsonb_build_object('t', p_type, 'many', true) || coalesce(p_data, '{}'::jsonb))::text;
  end if;
  perform pg_notify('veltro_events', v);
end;
$$;

revoke execute on function public.veltro_emit(text, uuid[], jsonb) from public, anon, authenticated;

-- ============================================================
-- Avisos
-- ============================================================

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  kind          text not null check (kind in ('task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention')),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  comment_id    uuid references public.task_comments(id) on delete cascade,
  chat_id       uuid references public.chats(id) on delete cascade,
  message_id    uuid references public.chat_messages(id) on delete cascade,
  -- extras: count (comentarios juntados en un solo aviso)
  data          jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index notifications_inbox_idx on public.notifications(user_id, account_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications(user_id, account_id) where read_at is null;
create index notifications_task_idx on public.notifications(task_id) where task_id is not null;
create index notifications_message_idx on public.notifications(message_id) where message_id is not null;

-- Crea un aviso por persona (sin quien lo provoca, sin repetidos, solo gente de la cuenta y, si es
-- de un espacio, con acceso a él). Los comentarios sin leer de una misma tarea se juntan en uno.
create or replace function public.notify_people(
  p_kind text, p_users uuid[], p_actor uuid, p_account uuid,
  p_workspace uuid, p_task uuid, p_comment uuid, p_chat uuid, p_message uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_users uuid[];
begin
  v_users := array(
    select distinct u from unnest(p_users) u
    where u is not null and u is distinct from p_actor
      and exists (select 1 from account_members am where am.account_id = p_account and am.user_id = u)
      and (p_workspace is null or public.workspace_role_for(p_workspace, u) is not null)
  );
  if cardinality(v_users) = 0 then
    return;
  end if;
  if p_kind = 'task_comment' then
    with prev as (
      delete from notifications n
      where n.kind = 'task_comment' and n.task_id = p_task and n.read_at is null and n.user_id = any(v_users)
      returning n.user_id, coalesce((n.data ->> 'count')::int, 1) as count
    )
    insert into notifications (account_id, user_id, actor_id, kind, workspace_id, task_id, comment_id, data)
    select p_account, u, p_actor, p_kind, p_workspace, p_task, p_comment,
      jsonb_build_object('count', coalesce((select sum(prev.count) from prev where prev.user_id = u), 0) + 1)
    from unnest(v_users) u;
    return;
  end if;
  insert into notifications (account_id, user_id, actor_id, kind, workspace_id, task_id, comment_id, chat_id, message_id)
  select p_account, u, p_actor, p_kind, p_workspace, p_task, p_comment, p_chat, p_message
  from unnest(v_users) u;
end;
$$;

revoke execute on function public.notify_people(text, uuid[], uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.notifications_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.veltro_emit('ntf', array[new.user_id], jsonb_build_object('acct', new.account_id, 'id', new.id));
  elsif tg_op = 'UPDATE' then
    -- mismo contenido para todas las filas: NOTIFY junta los repetidos de una transacción
    perform public.veltro_emit('ntf_sync', array[new.user_id], jsonb_build_object('acct', new.account_id));
  else
    perform public.veltro_emit('ntf_sync', array[old.user_id], jsonb_build_object('acct', old.account_id));
  end if;
  return null;
end;
$$;

create trigger notifications_after_write after insert or update or delete on public.notifications
  for each row execute function public.notifications_after_write();

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
-- marcar como leído (único campo editable, por grant de columna)
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ============================================================
-- Tareas: asignada, terminada
-- ============================================================

create or replace function public.tasks_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_account uuid;
  v_new uuid[];
begin
  if v_actor is null then
    return null;
  end if;
  select account_id into v_account from workspaces where id = new.workspace_id;
  v_new := array(
    select unnest(new.assignee_ids)
    except
    select unnest(case when tg_op = 'UPDATE' then old.assignee_ids else '{}'::uuid[] end)
  );
  if cardinality(v_new) > 0 then
    perform public.notify_people('task_assigned', v_new, v_actor, v_account, new.workspace_id, new.id, null, null, null);
  end if;
  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' and new.created_by is not null then
    perform public.notify_people('task_done', array[new.created_by], v_actor, v_account, new.workspace_id, new.id, null, null, null);
  end if;
  return null;
end;
$$;

create trigger tasks_notify after insert or update of assignee_ids, status on public.tasks
  for each row execute function public.tasks_notify();

-- ============================================================
-- Comentarios: mención y comentario en una tarea mía (responsable o quien la creó)
-- ============================================================

create or replace function public.task_comments_mentions()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.mentions := array(
    select distinct m from unnest(new.mentions) m
    where m is not null and m <> new.user_id
    limit 50
  );
  return new;
end;
$$;

create trigger task_comments_mentions before insert or update of mentions on public.task_comments
  for each row execute function public.task_comments_mentions();

create or replace function public.task_comments_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_account uuid;
  v_mentioned uuid[];
  v_others uuid[];
begin
  select * into v_task from tasks where id = new.task_id;
  if not found then
    return null;
  end if;
  select account_id into v_account from workspaces where id = new.workspace_id;
  v_mentioned := array(
    select unnest(new.mentions)
    except
    select unnest(case when tg_op = 'UPDATE' then old.mentions else '{}'::uuid[] end)
  );
  if cardinality(v_mentioned) > 0 then
    perform public.notify_people('task_mention', v_mentioned, new.user_id, v_account, new.workspace_id, new.task_id, new.id, null, null);
  end if;
  if tg_op = 'INSERT' then
    -- a quien ya mencionaron le basta ese aviso
    v_others := array(
      select unnest(v_task.assignee_ids || case when v_task.created_by is null then '{}'::uuid[] else array[v_task.created_by] end)
      except
      select unnest(new.mentions)
    );
    perform public.notify_people('task_comment', v_others, new.user_id, v_account, new.workspace_id, new.task_id, new.id, null, null);
  end if;
  return null;
end;
$$;

create trigger task_comments_notify after insert or update of mentions on public.task_comments
  for each row execute function public.task_comments_notify();

-- ============================================================
-- Pasillo: menciones, editar, borrar, eventos
-- ============================================================

create or replace function public.chat_messages_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce((select auth.uid()), new.user_id);
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
  else
    if old.deleted_at is not null then
      raise exception 'message_deleted' using errcode = 'P0001';
    end if;
    if old.kind = 'system'
      and (new.body is distinct from old.body or new.mentions is distinct from old.mentions or new.deleted_at is not null) then
      raise exception 'message_not_editable' using errcode = 'P0001';
    end if;
    new.chat_id := old.chat_id;
    new.user_id := old.user_id;
    new.kind := old.kind;
    new.ref_id := old.ref_id;
    new.created_at := old.created_at;
    if new.deleted_at is not null then
      -- borrado suave: queda el lugar en la conversación, sin el contenido
      new.deleted_at := now();
      new.body := '';
      new.mentions := '{}';
      new.meta := case when old.kind = 'meeting' then jsonb_build_object('invite', old.meta -> 'invite') else '{}'::jsonb end;
      new.edited_at := old.edited_at;
      return new;
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  -- solo se menciona a gente del chat (y no a uno mismo)
  if new.kind = 'system' then
    new.mentions := '{}';
  elsif tg_op = 'INSERT' or new.mentions is distinct from old.mentions then
    new.mentions := array(
      select distinct m from unnest(new.mentions) m
      where m is not null and m is distinct from new.user_id
        and exists (select 1 from chat_members cm where cm.chat_id = new.chat_id and cm.user_id = m)
      limit 50
    );
  end if;
  return new;
end;
$$;

create or replace function public.chat_messages_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_to uuid[];
  v_account uuid;
  v_mentioned uuid[];
begin
  select array_agg(user_id) into v_to from chat_members where chat_id = new.chat_id;
  perform public.veltro_emit(
    case when tg_op = 'INSERT' then 'msg' else 'msg_upd' end,
    v_to,
    jsonb_build_object('chat', new.chat_id, 'msg', new.id, 'by', new.user_id, 'kind', new.kind)
  );
  if new.deleted_at is not null then
    delete from notifications where message_id = new.id;
    -- las respuestas que citaban este mensaje dejan de mostrar su texto
    update chat_messages
    set meta = jsonb_set(meta, '{replyTo,body}', '""'::jsonb) || jsonb_build_object('replyDeleted', true)
    where chat_id = new.chat_id and meta -> 'replyTo' ->> 'id' = new.id::text and deleted_at is null;
    return null;
  end if;
  v_mentioned := array(
    select unnest(new.mentions)
    except
    select unnest(case when tg_op = 'UPDATE' then old.mentions else '{}'::uuid[] end)
  );
  if cardinality(v_mentioned) > 0 and new.user_id is not null then
    select account_id into v_account from chats where id = new.chat_id;
    perform public.notify_people('chat_mention', v_mentioned, new.user_id, v_account, null, null, null, new.chat_id, new.id);
  end if;
  return null;
end;
$$;

create trigger chat_messages_after_write after insert or update on public.chat_messages
  for each row execute function public.chat_messages_after_write();

create or replace function public.chat_members_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.last_read_at is distinct from old.last_read_at then
      perform public.veltro_emit('read', array[new.user_id], jsonb_build_object('chat', new.chat_id));
    end if;
  elsif tg_op = 'INSERT' then
    perform public.veltro_emit('chat', array[new.user_id], jsonb_build_object('chat', new.chat_id));
  else
    perform public.veltro_emit('chat', array[old.user_id], jsonb_build_object('chat', old.chat_id));
  end if;
  return null;
end;
$$;

create trigger chat_members_after_write after insert or update or delete on public.chat_members
  for each row execute function public.chat_members_after_write();

-- «Está escribiendo…»: no se guarda nada, solo se avisa a los demás del chat.
create or replace function public.chat_typing(p_chat uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_to uuid[];
begin
  if v_uid is null or not exists (select 1 from public.my_chat_ids() x where x = p_chat) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select array_agg(user_id) into v_to from chat_members where chat_id = p_chat and user_id <> v_uid;
  perform public.veltro_emit('typing', v_to, jsonb_build_object('chat', p_chat, 'by', v_uid));
end;
$$;

revoke execute on function public.chat_typing(uuid) from public, anon;
grant execute on function public.chat_typing(uuid) to authenticated;

-- editar (texto y menciones) y borrar (deleted_at) solo lo propio: la policy ya lo limita al autor
revoke update on public.chat_messages from anon, authenticated;
grant update (body, mentions, deleted_at) on public.chat_messages to authenticated;
