-- ============================================================
-- Veltro v2: invitaciones, recordatorios, tareas que se repiten e historial de tareas
--
-- account_invitations   invitar por correo (o con un enlace): la persona acepta y entra a la cuenta
--                       con los espacios elegidos. El enlace lleva un token; aquí solo su hash.
-- notifications         + task_due_today / task_overdue (recordatorios de la mañana, hora local de
--                       cada persona) y member_joined (aceptaron tu invitación)
-- tasks.recurrence      { freq, interval, day }: al terminar la tarea nace la siguiente con la fecha
--                       que sigue y la regla pasa a ella
-- task_events           historial de cada tarea: quién cambió qué y cuándo (lo escribe un trigger)
-- ============================================================

-- ============================================================
-- Invitaciones
-- ============================================================

create table public.account_invitations (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  email         text not null check (email = lower(trim(email)) and position('@' in email) > 1 and char_length(email) <= 254),
  full_name     text check (full_name is null or char_length(trim(full_name)) between 1 and 120),
  role          text not null default 'member' check (role in ('admin', 'member')),
  -- [{ id, role }] con los espacios que tendrá al aceptar
  workspaces    jsonb not null default '[]'::jsonb check (jsonb_typeof(workspaces) = 'array'),
  token_hash    text not null unique,
  locale        text not null default 'es' check (locale in ('es', 'en', 'pt', 'fr')),
  invited_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  sent_at       timestamptz,
  send_count    integer not null default 0,
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles(id) on delete set null,
  revoked_at    timestamptz
);

-- una invitación abierta por correo y cuenta (invitar de nuevo la renueva)
create unique index account_invitations_open_idx on public.account_invitations(account_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.account_invitations enable row level security;

create policy account_invitations_select on public.account_invitations for select to authenticated
  using (public.is_account_admin(account_id));
create policy account_invitations_insert on public.account_invitations for insert to authenticated
  with check (public.is_account_admin(account_id) and invited_by = (select auth.uid()));
create policy account_invitations_update on public.account_invitations for update to authenticated
  using (public.is_account_admin(account_id))
  with check (public.is_account_admin(account_id));

revoke all on public.account_invitations from anon, authenticated;
grant select, insert, update on public.account_invitations to authenticated;
grant all on public.account_invitations to service_role;

-- ============================================================
-- Avisos: recordatorios y «aceptaron tu invitación»
-- ============================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined'
));

-- un recordatorio por tarea, persona, tipo y día
create unique index notifications_reminder_idx on public.notifications(user_id, task_id, kind, (data ->> 'date'))
  where kind in ('task_due_today', 'task_overdue');

create index if not exists tasks_open_due_idx on public.tasks(due_date) where status <> 'done' and due_date is not null;

-- Recordatorios de la mañana: desde las 8:00 de cada persona (su zona horaria), una vez por día.
-- «Vence hoy» para lo que vence hoy y «se venció» el día después del vencimiento. Lo llama el
-- trabajo de mantenimiento (cada 5 minutos); repetirlo no duplica.
create or replace function public.task_due_reminders(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  with gente as (
    select p.id as user_id,
      (p_now at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as dia,
      extract(hour from p_now at time zone coalesce(nullif(p.timezone, ''), 'UTC')) as hora
    from profiles p
    where p.suspended_at is null
  ),
  candidatas as (
    select t.id as task_id, t.workspace_id, w.account_id, g.user_id, g.dia,
      case when t.due_date = g.dia then 'task_due_today' else 'task_overdue' end as kind
    from tasks t
    join workspaces w on w.id = t.workspace_id and w.archived_at is null
    join accounts a on a.id = w.account_id and a.status = 'active'
    cross join lateral unnest(t.assignee_ids) as u(id)
    join gente g on g.user_id = u.id and g.hora >= 8
    where t.status <> 'done'
      and t.due_date between (p_now::date - 2) and (p_now::date + 1)
      and (t.due_date = g.dia or t.due_date = g.dia - 1)
      and exists (select 1 from account_members am where am.account_id = w.account_id and am.user_id = g.user_id)
      and public.workspace_role_for(t.workspace_id, g.user_id) is not null
  )
  insert into notifications (account_id, user_id, actor_id, kind, workspace_id, task_id, data)
  select account_id, user_id, null, kind, workspace_id, task_id, jsonb_build_object('date', dia)
  from candidatas
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.task_due_reminders(timestamptz) from public, anon, authenticated;

-- Al aceptar una invitación, quien invitó se entera
create or replace function public.account_invitations_after_accept()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.accepted_at is not null and old.accepted_at is null and new.invited_by is not null and new.accepted_by is not null then
    perform public.notify_people('member_joined', array[new.invited_by], new.accepted_by, new.account_id, null, null, null, null, null);
  end if;
  return null;
end;
$$;

create trigger account_invitations_after_accept after update of accepted_at on public.account_invitations
  for each row execute function public.account_invitations_after_accept();

-- ============================================================
-- Tareas que se repiten
-- ============================================================

alter table public.tasks add column if not exists recurrence jsonb;
alter table public.tasks add constraint tasks_recurrence_check check (
  recurrence is null or (
    jsonb_typeof(recurrence) = 'object'
    and recurrence ->> 'freq' in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')
    -- CASE: el número solo se lee si es un número (AND no asegura el orden)
    and case when coalesce(recurrence ->> 'interval', '1') ~ '^[0-9]{1,2}$'
      then coalesce((recurrence ->> 'interval')::int, 1) between 1 and 99 else false end
    and case when coalesce(recurrence ->> 'day', '1') ~ '^[0-9]{1,2}$'
      then coalesce((recurrence ->> 'day')::int, 1) between 1 and 31 else false end
  )
);

-- La fecha que sigue según la regla. Mensual y anual respetan el día del mes elegido (`day`): el
-- 31 cae el último día en los meses cortos y vuelve al 31 en el siguiente.
create or replace function public.recurrence_next(p_from date, p_rule jsonb)
returns date
language plpgsql immutable set search_path = public
as $$
declare
  v_n integer := coalesce((p_rule ->> 'interval')::int, 1);
  v_day integer := coalesce((p_rule ->> 'day')::int, extract(day from p_from)::int);
  d date;
begin
  case p_rule ->> 'freq'
    when 'daily' then
      return p_from + v_n;
    when 'weekdays' then
      d := p_from + 1;
      while extract(isodow from d) > 5 loop
        d := d + 1;
      end loop;
      return d;
    when 'weekly' then
      return p_from + 7 * v_n;
    when 'monthly', 'yearly' then
      d := (date_trunc('month', p_from) + make_interval(months => case when p_rule ->> 'freq' = 'monthly' then v_n else 12 * v_n end))::date;
      return d + (least(v_day, extract(day from (d + interval '1 month - 1 day'))::int) - 1);
    else
      return null;
  end case;
end;
$$;

-- Quien crea la siguiente de una serie no pasa a ser su autora: se conserva la de la serie
create or replace function public.tasks_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('veltro.recurring', true), '') = '' then
      new.created_by = coalesce((select auth.uid()), new.created_by);
    end if;
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

-- Al terminar una tarea que se repite nace la siguiente (con quienes la tenían, sus campos y la
-- fecha que sigue). La regla pasa a la nueva: reabrir y volver a terminar esta no crea otra.
-- Si se terminó tarde, la siguiente no nace vencida: la fecha avanza hasta hoy o después.
create or replace function public.tasks_recur()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_base date;
  v_next date;
  v_today date := current_date;
begin
  if new.recurrence is null or new.status <> 'done' or old.status = 'done' then
    return null;
  end if;
  v_base := coalesce(new.due_date, v_today);
  v_next := public.recurrence_next(v_base, new.recurrence);
  while v_next is not null and v_next < v_today loop
    v_next := public.recurrence_next(v_next, new.recurrence);
  end loop;
  if v_next is null then
    return null;
  end if;
  perform set_config('veltro.recurring', new.id::text, true);
  insert into tasks (
    workspace_id, title, description, description_text, status, priority, assignee_ids, assignee_id,
    due_date, start_date, estimate_hours, labels, custom, parent_id, meeting_id, recurrence, created_by, position
  ) values (
    new.workspace_id, new.title, new.description, new.description_text, 'todo', new.priority, new.assignee_ids, new.assignee_id,
    v_next,
    case when new.start_date is null or new.due_date is null then null else new.start_date + (v_next - new.due_date) end,
    new.estimate_hours, new.labels, new.custom, new.parent_id, null, new.recurrence, new.created_by,
    coalesce((select max(position) from tasks where workspace_id = new.workspace_id and status = 'todo'), 0) + 1000
  );
  update tasks set recurrence = null where id = new.id;
  perform set_config('veltro.recurring', '', true);
  return null;
end;
$$;

create trigger tasks_recur after update of status on public.tasks
  for each row execute function public.tasks_recur();

-- La siguiente de una serie no avisa «te asignó»: ya era tuya
create or replace function public.tasks_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_account uuid;
  v_new uuid[];
begin
  if v_actor is null or coalesce(current_setting('veltro.recurring', true), '') <> '' then
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

-- ============================================================
-- Historial de tareas
-- ============================================================

create table public.task_events (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  kind          text not null check (kind in (
    'created', 'title', 'status', 'priority', 'assignees', 'due_date', 'start_date',
    'description', 'labels', 'parent', 'recurrence'
  )),
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index task_events_task_idx on public.task_events(task_id, created_at desc);

-- Anota un cambio. Los de una misma persona sobre el mismo dato en pocos minutos se juntan (escribir
-- un título letra por letra, ir y volver de estado): queda el primer «de» y el último «a»; si
-- terminan donde empezaron, el cambio desaparece.
create or replace function public.task_event_add(p_task uuid, p_ws uuid, p_actor uuid, p_kind text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_prev task_events%rowtype;
  v_data jsonb;
begin
  if p_kind in ('title', 'status', 'priority', 'due_date', 'start_date', 'description', 'recurrence') then
    select * into v_prev from task_events
    where task_id = p_task and kind = p_kind and actor_id is not distinct from p_actor
      and created_at > now() - interval '5 minutes'
    order by created_at desc
    limit 1;
    if found then
      v_data := p_data || jsonb_build_object('from', v_prev.data -> 'from', 'fromId', v_prev.data -> 'fromId');
      if p_kind <> 'description' and (v_data -> 'from') is not distinct from (v_data -> 'to')
         and (v_data -> 'fromId') is not distinct from (v_data -> 'toId') then
        delete from task_events where id = v_prev.id;
      else
        update task_events set data = jsonb_strip_nulls(v_data), created_at = now() where id = v_prev.id;
      end if;
      return;
    end if;
  end if;
  insert into task_events (task_id, workspace_id, actor_id, kind, data)
  values (p_task, p_ws, p_actor, p_kind, jsonb_strip_nulls(p_data));
end;
$$;

revoke execute on function public.task_event_add(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.tasks_history()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rec text := coalesce(current_setting('veltro.recurring', true), '');
  v_add uuid[];
  v_del uuid[];
begin
  if tg_op = 'INSERT' then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'created',
      case when v_rec <> '' then jsonb_build_object('recurredFrom', v_rec) else '{}'::jsonb end);
    return null;
  end if;
  -- la regla que pasa a la siguiente de la serie no es un cambio de nadie
  if v_rec <> '' then
    return null;
  end if;
  if new.title is distinct from old.title then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.status is distinct from old.status or new.status_id is distinct from old.status_id then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'status',
      jsonb_build_object('from', old.status, 'to', new.status, 'fromId', old.status_id, 'toId', new.status_id));
  end if;
  if new.priority is distinct from old.priority then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assignee_ids is distinct from old.assignee_ids then
    v_add := array(select unnest(new.assignee_ids) except select unnest(old.assignee_ids));
    v_del := array(select unnest(old.assignee_ids) except select unnest(new.assignee_ids));
    if cardinality(v_add) + cardinality(v_del) > 0 then
      perform public.task_event_add(new.id, new.workspace_id, v_actor, 'assignees', jsonb_build_object('added', to_jsonb(v_add), 'removed', to_jsonb(v_del)));
    end if;
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.start_date is distinct from old.start_date then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'start_date', jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;
  if new.description_text is distinct from old.description_text then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'description', '{}'::jsonb);
  end if;
  if new.labels is distinct from old.labels then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'labels', jsonb_build_object(
      'added', to_jsonb(array(select unnest(new.labels) except select unnest(old.labels))),
      'removed', to_jsonb(array(select unnest(old.labels) except select unnest(new.labels)))));
  end if;
  if new.parent_id is distinct from old.parent_id then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'parent', jsonb_build_object('from', old.parent_id, 'to', new.parent_id));
  end if;
  if new.recurrence is distinct from old.recurrence then
    perform public.task_event_add(new.id, new.workspace_id, v_actor, 'recurrence', jsonb_build_object('from', old.recurrence, 'to', new.recurrence));
  end if;
  return null;
end;
$$;

create trigger tasks_history after insert or update on public.tasks
  for each row execute function public.tasks_history();

alter table public.task_events enable row level security;

-- se ve si se ve la tarea (las reglas de tareas: espacio, organigrama, tokens)
create policy task_events_select on public.task_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

revoke all on public.task_events from anon, authenticated;
grant select on public.task_events to authenticated;
grant all on public.task_events to service_role;
