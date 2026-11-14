-- ============================================================
-- Veltro v2: dependencias entre tareas
--
-- task_dependencies  «PRO-8 está bloqueada por PRO-5». Dentro de una misma cuenta (la que bloquea
--                    puede ser de otro espacio). Sin ciclos: si PRO-5 espera a PRO-8, PRO-8 no puede
--                    esperar a PRO-5.
-- Liberar            cuando se termina la última que la bloqueaba, la tarea queda libre: si estaba
--                    «Bloqueada» pasa a «Por hacer», y sus responsables y quienes la siguen reciben
--                    el aviso task_unblocked.
-- Historial          quedan anotados el «bloqueada por» que se agrega o se quita, y la liberación.
-- ============================================================

create table public.task_dependencies (
  task_id     uuid not null references public.tasks(id) on delete cascade,
  blocked_by  uuid not null references public.tasks(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (task_id, blocked_by),
  constraint task_dependencies_not_self check (task_id <> blocked_by)
);

create index task_dependencies_blocker_idx on public.task_dependencies(blocked_by);

-- La cuenta y el autor los pone la base; las dos tareas tienen que ser de la misma cuenta y sin ciclos.
create or replace function public.task_dependencies_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_account uuid;
  v_other uuid;
begin
  select w.account_id into v_account from tasks t join workspaces w on w.id = t.workspace_id where t.id = new.task_id;
  select w.account_id into v_other from tasks t join workspaces w on w.id = t.workspace_id where t.id = new.blocked_by;
  if v_account is null or v_other is null then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_account <> v_other then
    raise exception 'dependency_other_account' using errcode = 'P0001';
  end if;
  -- ¿la que bloquea ya espera (directa o indirectamente) a esta?
  if exists (
    with recursive arriba(id) as (
      select new.blocked_by
      union
      select d.blocked_by from task_dependencies d join arriba a on d.task_id = a.id
    )
    select 1 from arriba where id = new.task_id
  ) then
    raise exception 'dependency_cycle' using errcode = 'P0001';
  end if;
  new.account_id = v_account;
  new.created_by = coalesce((select auth.uid()), new.created_by);
  new.created_at = now();
  return new;
end;
$$;

create trigger task_dependencies_before_insert before insert on public.task_dependencies
  for each row execute function public.task_dependencies_before_insert();

alter table public.task_dependencies enable row level security;

-- se ve si se ve alguna de las dos (la API muestra solo lo que se puede abrir)
create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id) or exists (select 1 from public.tasks t where t.id = blocked_by));
-- la agrega quien puede editar la tarea que queda bloqueada, con una que bloquea que pueda ver
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.workspace_id in (select public.my_editable_workspace_ids()))
    and exists (select 1 from public.tasks t where t.id = blocked_by)
  );
-- la quita quien puede editar cualquiera de las dos
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_id and t.workspace_id in (select public.my_editable_workspace_ids()))
    or exists (select 1 from public.tasks t where t.id = blocked_by and t.workspace_id in (select public.my_editable_workspace_ids()))
  );

revoke all on public.task_dependencies from anon, authenticated;
grant select, insert, delete on public.task_dependencies to authenticated;
grant all on public.task_dependencies to service_role;

-- ============================================================
-- Avisos e historial
-- ============================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined', 'task_status', 'task_due_changed',
  'task_unblocked'
));

alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events add constraint task_events_kind_check check (kind in (
  'created', 'title', 'status', 'priority', 'assignees', 'due_date', 'start_date',
  'description', 'labels', 'parent', 'recurrence', 'blocked_by'
));

-- «Bloqueada por» agregada o quitada, en el historial de la tarea bloqueada
create or replace function public.task_dependencies_history()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row task_dependencies%rowtype;
  v_ws uuid;
begin
  v_row := case when tg_op = 'INSERT' then new else old end;
  select workspace_id into v_ws from tasks where id = v_row.task_id;
  if v_ws is null then
    return null; -- la tarea se está borrando
  end if;
  perform public.task_event_add(v_row.task_id, v_ws, (select auth.uid()), 'blocked_by',
    case when tg_op = 'INSERT' then jsonb_build_object('added', v_row.blocked_by) else jsonb_build_object('removed', v_row.blocked_by) end);
  return null;
end;
$$;

create trigger task_dependencies_history after insert or delete on public.task_dependencies
  for each row execute function public.task_dependencies_history();

-- Al terminar una tarea, las que esperaban solo por ella quedan libres.
create or replace function public.tasks_release_dependents()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_account uuid;
  v_ref text;
  v_dep tasks%rowtype;
begin
  if new.status <> 'done' or old.status = 'done' then
    return null;
  end if;
  select w.account_id, w.key || '-' || new.number into v_account, v_ref from workspaces w where w.id = new.workspace_id;
  for v_dep in
    select t.* from task_dependencies d join tasks t on t.id = d.task_id
    where d.blocked_by = new.id and t.status <> 'done'
      and not exists (
        select 1 from task_dependencies d2 join tasks b on b.id = d2.blocked_by
        where d2.task_id = d.task_id and b.status <> 'done'
      )
  loop
    if v_dep.status = 'blocked' then
      -- el cambio lo hace la base: tasks_notify no avisa «cambió de estado» (ya va el aviso de liberada)
      perform set_config('veltro.unblocking', new.id::text, true);
      update tasks set status = 'todo' where id = v_dep.id;
      perform set_config('veltro.unblocking', '', true);
    end if;
    perform public.notify_people('task_unblocked', v_dep.assignee_ids || public.task_watchers(v_dep.id), v_actor, v_account,
      v_dep.workspace_id, v_dep.id, null, null, null,
      jsonb_build_object('by', new.id, 'byRef', v_ref, 'byTitle', new.title, 'moved', v_dep.status = 'blocked'));
  end loop;
  return null;
end;
$$;

-- después de tasks_notify (los AFTER corren por nombre): primero «terminada», después «liberada»
create trigger tasks_release_dependents after update of status, status_id on public.tasks
  for each row execute function public.tasks_release_dependents();

-- tasks_notify: igual que antes, pero sin «cambió de estado» cuando el cambio es la liberación
create or replace function public.tasks_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_account uuid;
  v_new uuid[];
  v_watch uuid[];
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
  if tg_op = 'UPDATE' then
    v_watch := public.task_watchers(new.id);
    if new.status = 'done' and old.status is distinct from 'done' then
      perform public.notify_people('task_done', v_watch, v_actor, v_account, new.workspace_id, new.id, null, null, null);
    elsif new.status <> 'done' and (new.status is distinct from old.status or new.status_id is distinct from old.status_id)
      and coalesce(current_setting('veltro.unblocking', true), '') = '' then
      perform public.notify_people('task_status', v_watch, v_actor, v_account, new.workspace_id, new.id, null, null, null,
        jsonb_build_object('to', new.status, 'toId', new.status_id));
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.notify_people('task_due_changed', new.assignee_ids || v_watch, v_actor, v_account, new.workspace_id, new.id, null, null, null,
        jsonb_build_object('from', old.due_date, 'to', new.due_date));
    end if;
  end if;
  return null;
end;
$$;

-- tasks_history: el estado que cambia por la liberación queda anotado con la tarea que la liberó
create or replace function public.tasks_history()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rec text := coalesce(current_setting('veltro.recurring', true), '');
  v_unblock text := coalesce(current_setting('veltro.unblocking', true), '');
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
    if v_unblock <> '' then
      -- no se junta con otros cambios de estado de la misma persona: es otro hecho
      insert into task_events (task_id, workspace_id, actor_id, kind, data)
      values (new.id, new.workspace_id, v_actor, 'status', jsonb_strip_nulls(jsonb_build_object(
        'from', old.status, 'to', new.status, 'fromId', old.status_id, 'toId', new.status_id, 'unblockedBy', v_unblock)));
    else
      perform public.task_event_add(new.id, new.workspace_id, v_actor, 'status',
        jsonb_build_object('from', old.status, 'to', new.status, 'fromId', old.status_id, 'toId', new.status_id));
    end if;
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
