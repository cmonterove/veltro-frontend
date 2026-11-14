-- ============================================================
-- Veltro v2: seguimiento de tareas y equipos de trabajo
--
-- task_followers   quién sigue una tarea (aunque no sea suya). Quien la crea la sigue sin pedirlo,
--                  salvo que la silencie (muted). Quien sigue se entera de comentarios, cambios de
--                  estado, de fecha y de que se terminó.
-- notifications    + task_status (cambió de estado) y task_due_changed (cambió la fecha de entrega)
-- teams            equipos de trabajo de una cuenta (aparte del organigrama: «Equipo Polar», «Trade»)
-- team_members     quiénes están en cada equipo. Sirven de alcance en Tareas, Pulso y Mesa.
-- ============================================================

-- ============================================================
-- Seguidores
-- ============================================================

create table public.task_followers (
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- true: sin avisos de esta tarea (sirve para que quien la creó deje de seguirla)
  muted       boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_followers_user_idx on public.task_followers(user_id) where not muted;

alter table public.task_followers enable row level security;

-- se ve quién sigue una tarea si se ve la tarea
create policy task_followers_select on public.task_followers for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
-- cada quien se suma o se va (solo de tareas que ve)
create policy task_followers_insert on public.task_followers for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_followers_update on public.task_followers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy task_followers_delete on public.task_followers for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.task_followers from anon, authenticated;
grant select, insert, delete on public.task_followers to authenticated;
grant update (muted) on public.task_followers to authenticated;
grant all on public.task_followers to service_role;

-- Quienes siguen una tarea: los que la siguen a propósito y quien la creó (si no la silenció).
create or replace function public.task_watchers(p_task uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select array(
    select f.user_id from task_followers f where f.task_id = p_task and not f.muted
    union
    select t.created_by from tasks t
    where t.id = p_task and t.created_by is not null
      and not exists (select 1 from task_followers f where f.task_id = p_task and f.user_id = t.created_by and f.muted)
  );
$$;

revoke execute on function public.task_watchers(uuid) from public, anon, authenticated;

-- ============================================================
-- Avisos: cambió el estado, cambió la fecha
-- ============================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined', 'task_status', 'task_due_changed'
));

-- Con datos (data): el estado o la fecha nueva. Los de comentarios, estado y fecha sin leer de una
-- misma tarea se juntan en uno (queda el último y la cuenta).
create or replace function public.notify_people(
  p_kind text, p_users uuid[], p_actor uuid, p_account uuid,
  p_workspace uuid, p_task uuid, p_comment uuid, p_chat uuid, p_message uuid, p_data jsonb
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
  if p_kind in ('task_comment', 'task_status', 'task_due_changed') then
    with prev as (
      delete from notifications n
      where n.kind = p_kind and n.task_id = p_task and n.read_at is null and n.user_id = any(v_users)
      returning n.user_id, coalesce((n.data ->> 'count')::int, 1) as count, n.data -> 'from' as was
    )
    insert into notifications (account_id, user_id, actor_id, kind, workspace_id, task_id, comment_id, data)
    select p_account, u, p_actor, p_kind, p_workspace, p_task, p_comment,
      coalesce(p_data, '{}'::jsonb)
        || jsonb_build_object('count', coalesce((select sum(prev.count) from prev where prev.user_id = u), 0) + 1)
        -- la fecha: se conserva la primera de antes («del 12 al 20»)
        || coalesce((select jsonb_build_object('from', prev.was) from prev where prev.user_id = u and prev.was is not null limit 1), '{}'::jsonb)
    from unnest(v_users) u;
    return;
  end if;
  insert into notifications (account_id, user_id, actor_id, kind, workspace_id, task_id, comment_id, chat_id, message_id, data)
  select p_account, u, p_actor, p_kind, p_workspace, p_task, p_comment, p_chat, p_message, coalesce(p_data, '{}'::jsonb)
  from unnest(v_users) u;
end;
$$;

revoke execute on function public.notify_people(text, uuid[], uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.notify_people(
  p_kind text, p_users uuid[], p_actor uuid, p_account uuid,
  p_workspace uuid, p_task uuid, p_comment uuid, p_chat uuid, p_message uuid
)
returns void
language sql security definer set search_path = public
as $$
  select public.notify_people(p_kind, p_users, p_actor, p_account, p_workspace, p_task, p_comment, p_chat, p_message, '{}'::jsonb);
$$;

-- Tareas: asignada (a quien entra), terminada / cambió de estado (a quien la sigue) y cambió la fecha
-- (a responsables y a quien la sigue). La siguiente de una serie no avisa.
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
    elsif new.status <> 'done' and (new.status is distinct from old.status or new.status_id is distinct from old.status_id) then
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

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update of assignee_ids, status, status_id, due_date on public.tasks
  for each row execute function public.tasks_notify();

-- Comentarios: a responsables y a quien sigue la tarea (a quien mencionaron le basta la mención)
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
    v_others := array(
      select unnest(v_task.assignee_ids || public.task_watchers(v_task.id))
      except
      select unnest(new.mentions)
    );
    perform public.notify_people('task_comment', v_others, new.user_id, v_account, new.workspace_id, new.task_id, new.id, null, null);
  end if;
  return null;
end;
$$;

-- ============================================================
-- Equipos de trabajo
-- ============================================================

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  color       text not null default 'violet'
              check (color in ('violet', 'mandarina', 'ink', 'lavender', 'blue', 'teal', 'green', 'pink', 'red', 'amber')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index teams_account_name_idx on public.teams(account_id, lower(trim(name)));

create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members(user_id);

-- Solo gente de la cuenta del equipo
create or replace function public.team_members_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from teams t join account_members am on am.account_id = t.account_id
    where t.id = new.team_id and am.user_id = new.user_id
  ) then
    raise exception 'member_not_in_account' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger team_members_before_insert before insert on public.team_members
  for each row execute function public.team_members_before_insert();

-- Al salir de la cuenta, sale de sus equipos
create or replace function public.cleanup_team_memberships()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from team_members tm
  using teams t
  where tm.team_id = t.id and t.account_id = old.account_id and tm.user_id = old.user_id;
  return old;
end;
$$;

create trigger account_members_cleanup_teams after delete on public.account_members
  for each row execute function public.cleanup_team_memberships();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- toda la cuenta ve los equipos; los arman los admins
create policy teams_select on public.teams for select to authenticated
  using (public.is_active_account_member(account_id));
create policy teams_insert on public.teams for insert to authenticated
  with check (public.is_account_admin(account_id));
create policy teams_update on public.teams for update to authenticated
  using (public.is_account_admin(account_id))
  with check (public.is_account_admin(account_id));
create policy teams_delete on public.teams for delete to authenticated
  using (public.is_account_admin(account_id));

create policy team_members_select on public.team_members for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (exists (select 1 from public.teams t where t.id = team_id and public.is_account_admin(t.account_id)));
create policy team_members_delete on public.team_members for delete to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and public.is_account_admin(t.account_id)));

revoke all on public.teams, public.team_members from anon, authenticated;
grant select, insert, delete on public.teams to authenticated;
grant update (name, color) on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant all on public.teams, public.team_members to service_role;
