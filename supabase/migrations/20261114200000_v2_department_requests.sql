-- ============================================================
-- Veltro v2: solicitudes entre departamentos
--
-- Ventas le pide algo a Tecnología: la solicitud va a un DEPARTAMENTO de la cuenta. Ese
-- departamento la recibe en su bandeja, le pone un responsable, responde, la convierte en tareas
-- de un espacio (su control interno) y puede derivarla a otro departamento. Quien la pidió ve en
-- qué va: estado, conversación y el avance de las tareas que salieron de ella (aunque no tenga
-- acceso a ese espacio). Cuando se terminan todas sus tareas queda «entregada» y quien la pidió la
-- confirma (resuelta) o la reabre.
--
-- dept_requests        la solicitud (SOL-0001), con su departamento, responsable y estado
-- dept_request_events  la conversación y lo que pasó (cambios de estado, responsable, derivada,
--                      tareas creadas, tareas terminadas)
-- dept_request_reads   hasta dónde leyó cada quien
-- tasks.request_id     la tarea salió de esta solicitud
-- notifications        + request_id y los avisos request_new, request_message, request_status
--
-- Estados: new → in_review → in_progress → delivered → resolved (o declined).
-- Del lado del departamento: sus miembros, su jefe y los admins de la cuenta.
-- ============================================================

alter table public.accounts add column if not exists dept_request_seq integer not null default 0;

-- el correlativo nuevo tampoco cuenta como «la cuenta cambió»
drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts
  for each row
  when ((to_jsonb(old) - 'ticket_seq' - 'request_seq' - 'dept_request_seq' - 'updated_at')
        is distinct from (to_jsonb(new) - 'ticket_seq' - 'request_seq' - 'dept_request_seq' - 'updated_at'))
  execute function public.set_updated_at();

create table public.dept_requests (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  -- si se borra el departamento, la solicitud queda para los admins (sin departamento)
  department_id     uuid references public.departments(id) on delete set null,
  code              text not null,
  title             text not null check (char_length(trim(title)) between 4 and 120),
  body              text not null default '' check (char_length(body) <= 4000),
  kind              text not null default 'request' check (kind in ('request', 'problem', 'question', 'access', 'data')),
  urgent            boolean not null default false,
  -- «lo necesito para»
  due_date          date,
  status            text not null default 'new' check (status in ('new', 'in_review', 'in_progress', 'delivered', 'resolved', 'declined')),
  assignee_id       uuid references public.profiles(id) on delete set null,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  resolved_at       timestamptz,
  unique (account_id, code)
);

create index dept_requests_department_idx on public.dept_requests(department_id, last_activity_at desc);
create index dept_requests_creator_idx on public.dept_requests(created_by, last_activity_at desc);
create index dept_requests_account_idx on public.dept_requests(account_id, last_activity_at desc);

create table public.dept_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.dept_requests(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('message', 'status', 'assigned', 'forwarded', 'task_created', 'tasks_done')),
  body        text not null default '' check (char_length(body) <= 4000),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint dept_request_events_message_body check (kind <> 'message' or char_length(trim(body)) >= 1)
);

create index dept_request_events_request_idx on public.dept_request_events(request_id, created_at);

create table public.dept_request_reads (
  request_id    uuid not null references public.dept_requests(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.tasks add column if not exists request_id uuid references public.dept_requests(id) on delete set null;
create index if not exists tasks_request_idx on public.tasks(request_id) where request_id is not null;

-- ============================================================
-- Quién es quién
-- ============================================================

-- ¿Esta persona es del departamento? (su jefe o alguien con ese departamento en la cuenta)
create or replace function public.in_department(p_dept uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_dept is not null and (
    exists (select 1 from departments d where d.id = p_dept and d.head_id = p_user)
    or exists (select 1 from account_members m where m.department_id = p_dept and m.user_id = p_user)
  );
$$;

-- Qué papel tiene una persona en una solicitud: 'department' (la atiende: su departamento o un
-- admin de la cuenta), 'requester' (la pidió) o null (no la ve).
create or replace function public.dept_request_role(p_request uuid, p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.in_department(r.department_id, p_user)
      or exists (select 1 from account_members m where m.account_id = r.account_id and m.user_id = p_user and m.role in ('owner', 'admin'))
      then 'department'
    when r.created_by = p_user then 'requester'
  end
  from dept_requests r where r.id = p_request;
$$;

-- Quienes la atienden: el responsable o, si no hay, el jefe del departamento (o los admins si el
-- departamento no tiene jefe o ya no existe).
create or replace function public.dept_request_handlers(p_request uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select case
    when r.assignee_id is not null then array[r.assignee_id]
    when d.head_id is not null then array[d.head_id]
    else array(select m.user_id from account_members m where m.account_id = r.account_id and m.role in ('owner', 'admin'))
  end
  from dept_requests r left join departments d on d.id = r.department_id
  where r.id = p_request;
$$;

revoke execute on function public.dept_request_handlers(uuid) from public, anon, authenticated;

-- ============================================================
-- Avisos
-- ============================================================

alter table public.notifications add column if not exists request_id uuid references public.dept_requests(id) on delete cascade;
create index if not exists notifications_request_idx on public.notifications(request_id) where request_id is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined', 'task_status', 'task_due_changed',
  'task_unblocked', 'request_new', 'request_message', 'request_status'
));

-- Avisa de una solicitud (sin quien lo provoca, solo gente de la cuenta). Los mensajes y cambios
-- sin leer de una misma solicitud se juntan en uno (queda el último y la cuenta).
create or replace function public.notify_request(p_kind text, p_users uuid[], p_actor uuid, p_request uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_account uuid;
  v_users uuid[];
begin
  select account_id into v_account from dept_requests where id = p_request;
  v_users := array(
    select distinct u from unnest(p_users) u
    where u is not null and u is distinct from p_actor
      and exists (select 1 from account_members am where am.account_id = v_account and am.user_id = u)
  );
  if cardinality(v_users) = 0 then
    return;
  end if;
  with prev as (
    delete from notifications n
    where n.kind = p_kind and n.request_id = p_request and n.read_at is null and n.user_id = any(v_users)
      and p_kind in ('request_message', 'request_status')
    returning n.user_id, coalesce((n.data ->> 'count')::int, 1) as count
  )
  insert into notifications (account_id, user_id, actor_id, kind, request_id, data)
  select v_account, u, p_actor, p_kind, p_request,
    coalesce(p_data, '{}'::jsonb) || jsonb_build_object('count', coalesce((select sum(prev.count) from prev where prev.user_id = u), 0) + 1)
  from unnest(v_users) u;
end;
$$;

revoke execute on function public.notify_request(text, uuid[], uuid, uuid, jsonb) from public, anon, authenticated;

-- ============================================================
-- Reglas
-- ============================================================

create or replace function public.dept_requests_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_seq integer;
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  if public.account_role_of(new.account_id, new.created_by) is null then
    raise exception 'not_account_member' using errcode = '42501';
  end if;
  if new.department_id is null or not exists (select 1 from departments where id = new.department_id and account_id = new.account_id) then
    raise exception 'department_other_account' using errcode = 'P0001';
  end if;
  update accounts set dept_request_seq = dept_request_seq + 1 where id = new.account_id returning dept_request_seq into v_seq;
  new.code := 'SOL-' || lpad(v_seq::text, 4, '0');
  new.status := 'new';
  new.assignee_id := null;
  new.created_at := now();
  new.updated_at := now();
  new.last_activity_at := now();
  new.resolved_at := null;
  return new;
end;
$$;

create trigger dept_requests_before_insert before insert on public.dept_requests
  for each row execute function public.dept_requests_before_insert();

-- Quien la pidió la ve leída y el departamento recibe el aviso.
create or replace function public.dept_requests_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into dept_request_reads (request_id, user_id, last_read_at) values (new.id, new.created_by, now())
    on conflict (request_id, user_id) do update set last_read_at = excluded.last_read_at;
  perform public.notify_request('request_new', public.dept_request_handlers(new.id), new.created_by, new.id,
    jsonb_build_object('department', new.department_id));
  return null;
end;
$$;

create trigger dept_requests_after_insert after insert on public.dept_requests
  for each row execute function public.dept_requests_after_insert();

-- Qué puede cambiar cada quien, y lo que queda anotado.
--   departamento: estado, responsable (alguien del departamento o un admin), derivarla (otro
--                 departamento: vuelve a «nueva» y sin responsable), fecha y urgencia
--   quien la pidió: el texto mientras está «nueva»; confirmar (resuelta) o reabrir
-- La base también la mueve (veltro.request_auto): tareas creadas o terminadas.
create or replace function public.dept_requests_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_auto boolean := coalesce(current_setting('veltro.request_auto', true), '') <> '';
  v_role text;
begin
  new.id := old.id;
  new.account_id := old.account_id;
  new.code := old.code;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if v_uid is not null and not v_auto then
    v_role := public.dept_request_role(old.id, v_uid);
    if v_role is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_role = 'requester' then
      if new.department_id is distinct from old.department_id or new.assignee_id is distinct from old.assignee_id then
        raise exception 'forbidden' using errcode = '42501';
      end if;
      if (new.title, new.body, new.kind, new.urgent, new.due_date) is distinct from (old.title, old.body, old.kind, old.urgent, old.due_date)
         and old.status <> 'new' then
        raise exception 'request_locked' using errcode = 'P0001';
      end if;
      -- confirmar o reabrir; nada más
      if new.status is distinct from old.status
         and not (new.status = 'resolved' and old.status <> 'declined')
         and not (new.status = 'in_review' and old.status in ('delivered', 'resolved', 'declined')) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    else
      -- derivar: otro departamento de la cuenta; vuelve a empezar allí
      if new.department_id is distinct from old.department_id then
        if new.department_id is null or not exists (select 1 from departments where id = new.department_id and account_id = old.account_id) then
          raise exception 'department_other_account' using errcode = 'P0001';
        end if;
        new.assignee_id := null;
        new.status := 'new';
      end if;
      if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
         and not public.in_department(new.department_id, new.assignee_id)
         and not exists (select 1 from account_members m where m.account_id = old.account_id and m.user_id = new.assignee_id and m.role in ('owner', 'admin')) then
        raise exception 'assignee_not_in_department' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if new.status is distinct from old.status then
    new.resolved_at := case when new.status in ('resolved', 'declined') then now() else null end;
  else
    new.resolved_at := old.resolved_at;
  end if;
  new.updated_at := now();
  new.last_activity_at := clock_timestamp();
  return new;
end;
$$;

create trigger dept_requests_before_update before update on public.dept_requests
  for each row execute function public.dept_requests_before_update();

create or replace function public.dept_requests_after_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_auto boolean := coalesce(current_setting('veltro.request_auto', true), '') <> '';
begin
  if new.department_id is distinct from old.department_id then
    insert into dept_request_events (request_id, author_id, kind, data, created_at)
    values (new.id, v_uid, 'forwarded', jsonb_build_object('from', old.department_id, 'to', new.department_id), clock_timestamp());
    perform public.notify_request('request_new', public.dept_request_handlers(new.id), v_uid, new.id,
      jsonb_build_object('department', new.department_id, 'forwarded', true));
    perform public.notify_request('request_status', array[new.created_by], v_uid, new.id,
      jsonb_build_object('to', 'forwarded', 'department', new.department_id));
  elsif new.status is distinct from old.status and not v_auto then
    -- tomarla (responsable + en revisión) queda como una sola línea: «la tomó»
    if not (old.status = 'new' and new.status = 'in_review' and new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null) then
      insert into dept_request_events (request_id, author_id, kind, body, data, created_at)
      values (new.id, v_uid, 'status', new.status, jsonb_build_object('from', old.status, 'to', new.status), clock_timestamp());
    end if;
    -- a la otra parte: si cambia el departamento, a quien la pidió; si la confirma o reabre quien la pidió, a quienes la atienden
    if v_uid is not distinct from new.created_by then
      perform public.notify_request('request_status', public.dept_request_handlers(new.id), v_uid, new.id, jsonb_build_object('to', new.status, 'side', 'requester'));
    else
      perform public.notify_request('request_status', array[new.created_by], v_uid, new.id, jsonb_build_object('to', new.status));
    end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.department_id is not distinct from old.department_id and new.assignee_id is not null then
    insert into dept_request_events (request_id, author_id, kind, data, created_at)
    values (new.id, v_uid, 'assigned', jsonb_build_object('to', new.assignee_id), clock_timestamp());
    perform public.notify_request('request_new', array[new.assignee_id], v_uid, new.id, jsonb_build_object('assigned', true));
  end if;
  perform public.veltro_emit('req', array[new.created_by] || public.dept_request_handlers(new.id), jsonb_build_object('id', new.id));
  return null;
end;
$$;

create trigger dept_requests_after_update after update on public.dept_requests
  for each row execute function public.dept_requests_after_update();

-- Un mensaje: la solicitud se mueve (el departamento contesta una nueva → en revisión; quien la
-- pidió escribe sobre una entregada → en revisión), avisa a la otra parte y queda leído para quien escribe.
create or replace function public.dept_request_events_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r dept_requests%rowtype;
  v_role text;
begin
  if new.kind <> 'message' then
    return null;
  end if;
  select * into r from dept_requests where id = new.request_id;
  -- quien la pidió escribe como solicitante aunque sea admin (salvo que sea del propio departamento)
  v_role := case when new.author_id = r.created_by and not public.in_department(r.department_id, new.author_id) then 'requester'
                 else public.dept_request_role(r.id, new.author_id) end;
  perform set_config('veltro.request_auto', 'message', true);
  update dept_requests set
    status = case
      when v_role = 'department' and r.status = 'new' then 'in_review'
      when v_role = 'requester' and r.status = 'delivered' then 'in_review'
      else r.status
    end
  where id = r.id;
  perform set_config('veltro.request_auto', '', true);
  if v_role = 'requester' then
    perform public.notify_request('request_message', public.dept_request_handlers(r.id), new.author_id, r.id, jsonb_build_object('event', new.id));
  else
    perform public.notify_request('request_message', array[r.created_by], new.author_id, r.id, jsonb_build_object('event', new.id));
  end if;
  if new.author_id is not null then
    insert into dept_request_reads (request_id, user_id, last_read_at) values (r.id, new.author_id, new.created_at)
      on conflict (request_id, user_id) do update set last_read_at = greatest(dept_request_reads.last_read_at, excluded.last_read_at);
  end if;
  return null;
end;
$$;

create trigger dept_request_events_after_insert after insert on public.dept_request_events
  for each row execute function public.dept_request_events_after_insert();

-- ============================================================
-- Tareas que salen de una solicitud
-- ============================================================

-- La tarea con request_id: solo quien atiende la solicitud la vincula, y queda anotada; la
-- solicitud pasa a «en curso». Al terminarse la última abierta, queda «entregada» y se avisa a
-- quien la pidió; si se reabre una, vuelve a «en curso».
create or replace function public.tasks_request_link()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r dept_requests%rowtype;
  v_ref text;
  v_open integer;
begin
  if tg_op = 'UPDATE' and new.request_id is not distinct from old.request_id and new.status is not distinct from old.status then
    return null;
  end if;
  if new.request_id is null then
    return null;
  end if;
  select * into r from dept_requests where id = new.request_id;
  if not found then
    return null;
  end if;
  select w.key || '-' || new.number into v_ref from workspaces w where w.id = new.workspace_id;

  if tg_op = 'INSERT' or new.request_id is distinct from old.request_id then
    if v_uid is not null and public.dept_request_role(r.id, v_uid) is distinct from 'department' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (select account_id from workspaces where id = new.workspace_id) <> r.account_id then
      raise exception 'request_other_account' using errcode = 'P0001';
    end if;
    insert into dept_request_events (request_id, author_id, kind, data, created_at)
    values (r.id, v_uid, 'task_created', jsonb_build_object('task', new.id, 'ref', v_ref, 'title', new.title), clock_timestamp());
    if r.status in ('new', 'in_review', 'delivered') then
      perform set_config('veltro.request_auto', 'task', true);
      update dept_requests set status = 'in_progress' where id = r.id;
      perform set_config('veltro.request_auto', '', true);
      perform public.notify_request('request_status', array[r.created_by], v_uid, r.id, jsonb_build_object('to', 'in_progress', 'ref', v_ref));
    end if;
    perform public.veltro_emit('req', array[r.created_by] || public.dept_request_handlers(r.id), jsonb_build_object('id', r.id));
    return null;
  end if;

  -- cambió el estado de una tarea vinculada
  select count(*) into v_open from tasks where request_id = r.id and status <> 'done';
  if v_open = 0 and r.status = 'in_progress' then
    perform set_config('veltro.request_auto', 'task', true);
    update dept_requests set status = 'delivered' where id = r.id;
    perform set_config('veltro.request_auto', '', true);
    insert into dept_request_events (request_id, author_id, kind, data, created_at)
    values (r.id, v_uid, 'tasks_done', jsonb_build_object('task', new.id, 'ref', v_ref), clock_timestamp());
    perform public.notify_request('request_status', array[r.created_by], v_uid, r.id, jsonb_build_object('to', 'delivered'));
  elsif v_open > 0 and r.status = 'delivered' then
    perform set_config('veltro.request_auto', 'task', true);
    update dept_requests set status = 'in_progress' where id = r.id;
    perform set_config('veltro.request_auto', '', true);
  end if;
  perform public.veltro_emit('req', array[r.created_by] || public.dept_request_handlers(r.id), jsonb_build_object('id', r.id));
  return null;
end;
$$;

create trigger tasks_request_link after insert or update of request_id, status on public.tasks
  for each row execute function public.tasks_request_link();

-- Lo que quien pidió puede ver de las tareas de su solicitud (aunque no tenga acceso al espacio):
-- título, estado, responsables, fecha y el espacio.
create or replace function public.dept_request_tasks(p_request uuid)
returns table (id uuid, ref text, title text, status text, assignee_ids uuid[], due_date date, completed_at timestamptz,
  workspace_id uuid, workspace_name text, workspace_color text, can_open boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, w.key || '-' || t.number, t.title, t.status, t.assignee_ids, t.due_date, t.completed_at,
    w.id, w.name, w.color, public.workspace_role_for(w.id, (select auth.uid())) is not null
  from tasks t join workspaces w on w.id = t.workspace_id
  where t.request_id = p_request
    and public.dept_request_role(p_request, (select auth.uid())) is not null
  order by t.created_at;
$$;

revoke execute on function public.dept_request_tasks(uuid) from public, anon;
grant execute on function public.dept_request_tasks(uuid) to authenticated;

-- Derivar a otro departamento (con una nota opcional para quien la recibe). Quien la deriva puede
-- dejar de verla (si no es admin), por eso lo hace la base.
create or replace function public.dept_request_forward(p_request uuid, p_department uuid, p_note text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if public.dept_request_role(p_request, v_uid) is distinct from 'department' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into dept_request_events (request_id, author_id, kind, body) values (p_request, v_uid, 'message', left(trim(p_note), 4000));
  end if;
  update dept_requests set department_id = p_department where id = p_request;
  -- ¿la sigue viendo?
  return public.dept_request_role(p_request, v_uid) is not null;
end;
$$;

revoke execute on function public.dept_request_forward(uuid, uuid, text) from public, anon;
grant execute on function public.dept_request_forward(uuid, uuid, text) to authenticated;

-- ============================================================
-- Permisos
-- ============================================================

alter table public.dept_requests enable row level security;
alter table public.dept_request_events enable row level security;
alter table public.dept_request_reads enable row level security;

-- con las columnas de la fila (no por id: al insertar, la fila nueva todavía no se ve desde una función)
create policy dept_requests_select on public.dept_requests for select to authenticated
  using (created_by = (select auth.uid()) or public.in_department(department_id, (select auth.uid())) or public.is_account_admin(account_id));
create policy dept_requests_insert on public.dept_requests for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_account_member(account_id));
-- qué cambia cada quien lo revisa dept_requests_before_update (derivar deja la fila en otro departamento)
create policy dept_requests_update on public.dept_requests for update to authenticated
  using (created_by = (select auth.uid()) or public.in_department(department_id, (select auth.uid())) or public.is_account_admin(account_id))
  with check (public.is_account_member(account_id));

create policy dept_request_events_select on public.dept_request_events for select to authenticated
  using (public.dept_request_role(request_id, (select auth.uid())) is not null);
-- a mano solo se escriben mensajes; lo demás lo anota la base
create policy dept_request_events_insert on public.dept_request_events for insert to authenticated
  with check (kind = 'message' and author_id = (select auth.uid()) and public.dept_request_role(request_id, (select auth.uid())) is not null);

create policy dept_request_reads_all on public.dept_request_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.dept_request_role(request_id, (select auth.uid())) is not null);

revoke all on public.dept_requests, public.dept_request_events, public.dept_request_reads from anon, authenticated;
grant select, insert on public.dept_requests to authenticated;
grant update (title, body, kind, urgent, due_date, status, assignee_id) on public.dept_requests to authenticated;
grant select, insert on public.dept_request_events to authenticated;
grant select, insert, update, delete on public.dept_request_reads to authenticated;
grant all on public.dept_requests, public.dept_request_events, public.dept_request_reads to service_role;
