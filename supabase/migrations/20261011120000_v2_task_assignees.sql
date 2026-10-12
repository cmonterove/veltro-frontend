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
