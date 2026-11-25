-- ============================================================
-- Más en vivo (tareas, comentarios, docs y solicitudes) y el menú en el perfil
-- ============================================================
-- Hasta ahora iban en vivo el Pasillo, los avisos y los cambios de una solicitud. Ahora también:
--   task   una tarea se creó, cambió o se borró      → quien la puede ver vuelve a pedir sus listas
--   cmt    un comentario de una tarea                → quien tiene la tarea abierta lo ve llegar
--   doc    un doc se creó, cambió (también al escribirlo) o se archivó
--   req    + una solicitud nueva y sus archivos, y ahora a todos los que la ven (su departamento y
--          los admins, no solo a quien la pidió y quien la atiende)
-- Como siempre, los eventos llevan ids y no contenido. Solo avisan los cambios que hace una persona:
-- las escrituras sin persona (semillas, trabajos) no.
--
-- nav_prefs: el menú que arma cada persona (el orden y qué pasa a «Más»). Antes quedaba solo en el
-- navegador; ahora la sigue a cualquier computadora.

-- ============================================================
-- A quién le interesa lo de un espacio
-- ============================================================

-- Quien puede ver lo de un espacio: dueños y admins de la cuenta, quienes están en el espacio y
-- quienes lideran gente (jefes de departamento y a quienes alguien reporta: ven las tareas de los
-- suyos en espacios donde no están). Los demás no reciben nada de ese espacio.
create or replace function public.ws_event_people(p_workspace uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(distinct x.u), '{}') from (
    select am.user_id as u
    from workspaces w join account_members am on am.account_id = w.account_id
    where w.id = p_workspace and am.role in ('owner', 'admin')
    union
    select wm.user_id from workspace_members wm where wm.workspace_id = p_workspace
    union
    select d.head_id from workspaces w join departments d on d.account_id = w.account_id
    where w.id = p_workspace and d.head_id is not null
    union
    select am.reports_to from workspaces w join account_members am on am.account_id = w.account_id
    where w.id = p_workspace and am.reports_to is not null
  ) x;
$$;

revoke execute on function public.ws_event_people(uuid) from public, anon, authenticated;

-- veltro_emit con la lista en tandas de 150 (cada aviso cabe en el límite de NOTIFY): un espacio
-- grande no cae en el «many» que solo saben resolver los chats.
create or replace function public.veltro_emit_chunked(p_type text, p_to uuid[], p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_to uuid[] := array(select distinct x from unnest(p_to) x where x is not null);
  i integer := 1;
begin
  while i <= coalesce(cardinality(v_to), 0) loop
    perform public.veltro_emit(p_type, v_to[i:i + 149], p_data);
    i := i + 150;
  end loop;
end;
$$;

revoke execute on function public.veltro_emit_chunked(text, uuid[], jsonb) from public, anon, authenticated;

-- ============================================================
-- Tareas
-- ============================================================

create or replace function public.tasks_live()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.veltro_emit_chunked('task', public.ws_event_people(old.workspace_id),
      jsonb_build_object('id', old.id, 'ws', old.workspace_id, 'by', v_uid));
    return null;
  end if;
  perform public.veltro_emit_chunked('task', public.ws_event_people(new.workspace_id),
    jsonb_build_object('id', new.id, 'ws', new.workspace_id, 'by', v_uid));
  -- pasó a otro espacio: el de antes también se entera
  if tg_op = 'UPDATE' and old.workspace_id is distinct from new.workspace_id then
    perform public.veltro_emit_chunked('task', public.ws_event_people(old.workspace_id),
      jsonb_build_object('id', new.id, 'ws', old.workspace_id, 'by', v_uid));
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_live on public.tasks;
create trigger tasks_live after insert or update or delete on public.tasks
  for each row execute function public.tasks_live();

-- ============================================================
-- Comentarios de una tarea
-- ============================================================

create or replace function public.task_comments_live()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.veltro_emit_chunked('cmt', public.ws_event_people(old.workspace_id),
      jsonb_build_object('task', old.task_id, 'ws', old.workspace_id, 'by', v_uid));
  else
    perform public.veltro_emit_chunked('cmt', public.ws_event_people(new.workspace_id),
      jsonb_build_object('task', new.task_id, 'ws', new.workspace_id, 'by', v_uid));
  end if;
  return null;
end;
$$;

drop trigger if exists task_comments_live on public.task_comments;
create trigger task_comments_live after insert or update or delete on public.task_comments
  for each row execute function public.task_comments_live();

-- ============================================================
-- Docs
-- ============================================================

create or replace function public.docs_live()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.veltro_emit_chunked('doc', public.ws_event_people(old.workspace_id),
      jsonb_build_object('id', old.id, 'ws', old.workspace_id, 'by', v_uid));
  else
    perform public.veltro_emit_chunked('doc', public.ws_event_people(new.workspace_id),
      jsonb_build_object('id', new.id, 'ws', new.workspace_id, 'by', v_uid));
  end if;
  return null;
end;
$$;

drop trigger if exists docs_live on public.docs;
create trigger docs_live after insert or update or delete on public.docs
  for each row execute function public.docs_live();

-- ============================================================
-- Solicitudes: todo lo que cambia, para todos los que la ven
-- ============================================================

-- Quien ve una solicitud en sus bandejas: quien la pidió, quien la atiende, su departamento (con su jefe)
-- y los dueños y admins de la cuenta. Los avisos de la campana siguen yendo solo a quien le toca
-- (dept_request_handlers); esto es para que las listas se pongan al día en vivo.
create or replace function public.dept_request_audience(p_request uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select array(
    select r.created_by from dept_requests r where r.id = p_request and r.created_by is not null
    union
    select r.assignee_id from dept_requests r where r.id = p_request and r.assignee_id is not null
    union
    select d.head_id from dept_requests r join departments d on d.id = r.department_id
    where r.id = p_request and d.head_id is not null
    union
    select m.user_id from dept_requests r join account_members m on m.account_id = r.account_id
    where r.id = p_request and (m.role in ('owner', 'admin') or m.department_id = r.department_id)
  );
$$;

revoke execute on function public.dept_request_audience(uuid) from public, anon, authenticated;

-- Una solicitud nueva o que cambió (estado, responsable, departamento, un mensaje: también la toca).
create or replace function public.dept_requests_live()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.veltro_emit_chunked('req', public.dept_request_audience(new.id), jsonb_build_object('id', new.id));
  return null;
end;
$$;

drop trigger if exists dept_requests_live on public.dept_requests;
create trigger dept_requests_live after insert or update on public.dept_requests
  for each row execute function public.dept_requests_live();

-- Los archivos de una solicitud (se suben aparte del mensaje).
create or replace function public.dept_request_files_live()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_req uuid;
begin
  if tg_op = 'DELETE' then
    v_req := old.request_id;
  else
    v_req := new.request_id;
  end if;
  -- la solicitud ya no está (se borró con sus archivos): no hay a quién avisar
  if not exists (select 1 from dept_requests where id = v_req) then
    return null;
  end if;
  perform public.veltro_emit_chunked('req', public.dept_request_audience(v_req), jsonb_build_object('id', v_req));
  return null;
end;
$$;

drop trigger if exists dept_request_files_live on public.dept_request_files;
create trigger dept_request_files_live after insert or delete on public.dept_request_files
  for each row execute function public.dept_request_files_live();

-- ============================================================
-- El menú de cada persona, en su perfil
-- ============================================================

alter table public.profiles add column if not exists nav_prefs jsonb;
alter table public.profiles drop constraint if exists profiles_nav_prefs_check;
alter table public.profiles add constraint profiles_nav_prefs_check check (
  nav_prefs is null or (jsonb_typeof(nav_prefs) = 'object' and octet_length(nav_prefs::text) <= 4000)
);

-- cada persona lo guarda en su propio perfil (la política de update de profiles ya la limita a sí misma)
grant update (nav_prefs) on public.profiles to authenticated;
