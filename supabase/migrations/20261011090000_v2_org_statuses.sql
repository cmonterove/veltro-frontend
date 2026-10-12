-- ============================================================
-- Veltro v2 — Organigrama y estados de tareas por espacio
--
-- 1) Organigrama de la cuenta: departamentos (con jefe), cargo y "reporta a" por persona.
--    Cada persona ve sus tareas y las de todos los que están debajo de ella (directos e
--    indirectos, y los integrantes de los departamentos que encabeza), incluso en espacios
--    donde no es miembro, en SOLO LECTURA. Owner y admins de la cuenta ven todo.
-- 2) Estados propios por espacio: cada estado cae en una categoría fija
--    (backlog, todo, in_progress, blocked, done) que sigue viviendo en tasks.status,
--    así Hoy, Mesa, vencimientos y contadores funcionan igual en cualquier espacio.
-- ============================================================

-- ------------------------------------------------------------
-- DEPARTAMENTOS
-- ------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  head_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index departments_account_idx on public.departments(account_id);

create trigger departments_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- CARGO, DEPARTAMENTO Y "REPORTA A" EN LA MEMBRESÍA DE LA CUENTA
-- ------------------------------------------------------------
alter table public.account_members
  add column title         text check (title is null or char_length(title) <= 80),
  add column department_id uuid references public.departments(id) on delete set null,
  add column reports_to    uuid references public.profiles(id) on delete set null;

create index account_members_reports_to_idx on public.account_members(account_id, reports_to);
create index account_members_department_idx on public.account_members(department_id);

-- Coherencia: departamento y jefe de la misma cuenta, sin ciclos en la cadena de mando
create or replace function public.account_members_check_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cursor uuid;
  v_depth  integer := 0;
begin
  if new.department_id is not null and not exists (
    select 1 from departments where id = new.department_id and account_id = new.account_id
  ) then
    raise exception 'department_other_account' using errcode = 'P0001';
  end if;

  if new.reports_to is not null then
    if new.reports_to = new.user_id then
      raise exception 'reports_to_self' using errcode = 'P0001';
    end if;
    if not exists (select 1 from account_members where account_id = new.account_id and user_id = new.reports_to) then
      raise exception 'reports_to_not_member' using errcode = 'P0001';
    end if;
    -- subir por la cadena: si llegamos a la propia persona, sería un ciclo
    v_cursor := new.reports_to;
    while v_cursor is not null and v_depth < 64 loop
      if v_cursor = new.user_id then
        raise exception 'reports_to_cycle' using errcode = 'P0001';
      end if;
      select reports_to into v_cursor from account_members where account_id = new.account_id and user_id = v_cursor;
      v_depth := v_depth + 1;
    end loop;
  end if;

  return new;
end;
$$;

create trigger account_members_check_org before insert or update of department_id, reports_to on public.account_members
  for each row execute function public.account_members_check_org();

-- El jefe de un departamento debe pertenecer a la cuenta
create or replace function public.departments_check_head()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.head_id is not null and not exists (
    select 1 from account_members where account_id = new.account_id and user_id = new.head_id
  ) then
    raise exception 'head_not_member' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.account_id = old.account_id;
  end if;
  return new;
end;
$$;

create trigger departments_check_head before insert or update on public.departments
  for each row execute function public.departments_check_head();

-- Al salir de la cuenta, nadie queda reportándole ni encabezando sus departamentos
create or replace function public.cleanup_org_on_leave()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update account_members set reports_to = null where account_id = old.account_id and reports_to = old.user_id;
  update departments set head_id = null where account_id = old.account_id and head_id = old.user_id;
  return old;
end;
$$;

create trigger account_members_cleanup_org after delete on public.account_members
  for each row execute function public.cleanup_org_on_leave();

-- ------------------------------------------------------------
-- VISIBILIDAD POR JERARQUÍA
-- ------------------------------------------------------------

-- Personas que el usuario actual "ve" en cada cuenta: él mismo, quienes le reportan
-- (directa o indirectamente) y los integrantes de los departamentos que encabeza. Integrante
-- es quien tiene ese departamento o, si no tiene ninguno, lo hereda de su jefe; la rama de
-- alguien del departamento que es de otra área no entra (poner al gerente general en un
-- departamento no le abre toda la empresa a su jefe). Owner/admin: toda la cuenta.
create or replace function public.my_visible_members()
returns table (account_id uuid, user_id uuid)
language sql stable security definer set search_path = public
as $$
  with recursive
  me as (select (select auth.uid()) as uid),
  -- mi rama: yo y quienes me reportan, directo o indirecto
  tree as (
    select am.account_id, am.user_id
    from account_members am where am.user_id = (select uid from me)
    union
    select am.account_id, am.user_id
    from account_members am
    join tree t on am.account_id = t.account_id and am.reports_to = t.user_id
  ),
  -- departamento efectivo: el propio o, si no tiene, el del primer jefe hacia arriba que tenga uno
  -- (sube solo mientras no haya departamento; los ciclos los impide account_members_check_org)
  eff as (
    select am.account_id, am.user_id, am.department_id as dept, am.reports_to, 0 as depth
    from account_members am
    union all
    select e.account_id, e.user_id, boss.department_id, boss.reports_to, e.depth + 1
    from eff e
    join account_members boss on boss.account_id = e.account_id and boss.user_id = e.reports_to
    where e.dept is null and e.depth < 50
  ),
  -- integrantes de los departamentos que encabezo (sin arrastrar la rama de alguien de otra área)
  headed as (
    select e.account_id, e.user_id
    from departments d
    join eff e on e.account_id = d.account_id and e.dept = d.id
    where d.head_id = (select uid from me)
  )
  select t.account_id, t.user_id from tree t
  union
  select h.account_id, h.user_id from headed h
  union
  select am.account_id, am.user_id
  from account_members am
  join account_members mine on mine.account_id = am.account_id
  where mine.user_id = (select uid from me) and mine.role in ('owner', 'admin');
$$;

-- Pares (espacio, persona) cuyas tareas el usuario puede leer por jerarquía
create or replace function public.my_hierarchy_task_scope()
returns table (workspace_id uuid, user_id uuid)
language sql stable security definer set search_path = public
as $$
  select w.id, v.user_id
  from public.my_visible_members() v
  join workspaces w on w.account_id = v.account_id
  where w.archived_at is null;
$$;

-- Espacios donde trabaja alguien de mi equipo (para mostrar nombre y color de sus tareas)
create or replace function public.my_hierarchy_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct wm.workspace_id
  from workspace_members wm
  join workspaces w on w.id = wm.workspace_id
  join public.my_visible_members() v on v.account_id = w.account_id and v.user_id = wm.user_id
  where v.user_id <> (select auth.uid()) and w.archived_at is null;
$$;

-- Lectura extra por jerarquía (las políticas se suman con OR; escribir sigue exigiendo ser editor del espacio)
create policy tasks_select_hierarchy on public.tasks for select to authenticated
  using ((workspace_id, assignee_id) in (select s.workspace_id, s.user_id from public.my_hierarchy_task_scope() s));

create policy workspaces_select_hierarchy on public.workspaces for select to authenticated
  using (id in (select public.my_hierarchy_workspace_ids()));

-- departments: lectura para toda la cuenta, gestión para admins
alter table public.departments enable row level security;

create policy departments_select on public.departments for select to authenticated
  using (public.is_account_member(account_id));
create policy departments_insert on public.departments for insert to authenticated
  with check (public.is_account_admin(account_id));
create policy departments_update on public.departments for update to authenticated
  using (public.is_account_admin(account_id)) with check (public.is_account_admin(account_id));
create policy departments_delete on public.departments for delete to authenticated
  using (public.is_account_admin(account_id));

grant select, insert, update, delete on public.departments to authenticated;

-- account_members: los admins editan el organigrama (rol sigue protegido por protect_account_owner)
grant update (title, department_id, reports_to) on public.account_members to authenticated;

-- ------------------------------------------------------------
-- ESTADOS DE TAREAS POR ESPACIO
-- ------------------------------------------------------------
-- task_statuses: [{ "id": "s_review", "name": "En revisión cliente", "category": "in_progress" }, ...]
-- Vacío = los 5 estados estándar.
alter table public.workspaces add column task_statuses jsonb not null default '[]'::jsonb;
alter table public.tasks add column status_id text check (status_id is null or char_length(status_id) <= 40);

grant update (task_statuses) on public.workspaces to authenticated;

create or replace function public.workspaces_check_statuses()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s jsonb;
begin
  if jsonb_typeof(new.task_statuses) <> 'array' or jsonb_array_length(new.task_statuses) > 30 then
    raise exception 'invalid_statuses' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(new.task_statuses) loop
    if jsonb_typeof(s) <> 'object'
       or coalesce(char_length(s->>'id'), 0) not between 1 and 40
       or coalesce(char_length(s->>'name'), 0) not between 1 and 40
       or (s->>'category') not in ('backlog', 'todo', 'in_progress', 'blocked', 'done') then
      raise exception 'invalid_statuses' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

create trigger workspaces_check_statuses before insert or update of task_statuses on public.workspaces
  for each row execute function public.workspaces_check_statuses();

-- La categoría (tasks.status) siempre sale del estado propio elegido. Si alguien cambia
-- solo la categoría (p. ej. marcar como hecha), se toma el primer estado propio de esa
-- categoría. Corre antes que tasks_before_write (orden alfabético) para que completed_at
-- vea la categoría final.
create or replace function public.tasks_a_sync_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_statuses jsonb;
  v_category text;
begin
  select task_statuses into v_statuses from workspaces where id = new.workspace_id;
  if v_statuses is null or jsonb_array_length(v_statuses) = 0 then
    new.status_id = null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status_id is not distinct from old.status_id then
    select s->>'id' into new.status_id
    from jsonb_array_elements(v_statuses) s
    where s->>'category' = new.status
    limit 1;
  end if;

  if new.status_id is not null then
    select s->>'category' into v_category
    from jsonb_array_elements(v_statuses) s
    where s->>'id' = new.status_id;
    if v_category is null then
      if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
        raise exception 'invalid_status' using errcode = '22023';
      end if;
      new.status_id = null; -- el estado fue borrado del espacio: queda solo la categoría
    else
      new.status = v_category;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_a_sync_status before insert or update of status, status_id, workspace_id on public.tasks
  for each row execute function public.tasks_a_sync_status();

-- Si se borra un estado del espacio, sus tareas se quedan solo con la categoría
create or replace function public.workspaces_cleanup_statuses()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update tasks t set status_id = null
  where t.workspace_id = new.id
    and t.status_id is not null
    and not exists (select 1 from jsonb_array_elements(new.task_statuses) s where s->>'id' = t.status_id);
  return new;
end;
$$;

create trigger workspaces_cleanup_statuses after update of task_statuses on public.workspaces
  for each row execute function public.workspaces_cleanup_statuses();
