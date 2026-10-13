-- ============================================================
-- Veltro v2: la lectura por jerarquía respeta las suspensiones
-- my_visible_members() alimenta las políticas tasks_select_hierarchy y workspaces_select_hierarchy.
-- No miraba si la cuenta o la persona estaban suspendidas, así que alguien de una cuenta suspendida
-- seguía viendo sus tareas y las de su equipo. Ahora, igual que workspace_role_for y my_workspace_ids:
-- solo cuentas activas y nada para una persona suspendida.
-- ============================================================

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
  ),
  visible as (
    select t.account_id, t.user_id from tree t
    union
    select h.account_id, h.user_id from headed h
    union
    select am.account_id, am.user_id
    from account_members am
    join account_members mine on mine.account_id = am.account_id
    where mine.user_id = (select uid from me) and mine.role in ('owner', 'admin')
  )
  select v.account_id, v.user_id
  from visible v
  join accounts a on a.id = v.account_id and a.status = 'active'
  where not exists (select 1 from profiles p where p.id = (select uid from me) and p.suspended_at is not null);
$$;
