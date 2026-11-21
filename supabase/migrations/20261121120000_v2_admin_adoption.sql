-- ============================================================
-- Consola: lo nuevo de Veltro
-- ============================================================
-- Varias cuentas por persona, invitados a un espacio, color y logo de cada cuenta y espacio,
-- equipos, plantillas, solicitudes entre departamentos, dependencias, tareas que se repiten,
-- seguidores, vistas guardadas, hilos/reacciones/fijados en Pasillo y versiones de adjuntos.
--
-- Solo lectura. No reescriben las funciones de siempre: la consola las pide junto con ellas.
-- Todas validan el rol con platform_assert() (cualquier rol de la plataforma puede ver).

-- ------------------------------------------------------------
-- Identidad de varias cuentas a la vez (las filas de una lista)
-- ------------------------------------------------------------
create or replace function public.admin_account_identity(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return coalesce((
    select jsonb_object_agg(a.id, jsonb_build_object(
      'color', a.color,
      'logo_updated_at', a.logo_updated_at,
      'people', (select count(*) from account_members m where m.account_id = a.id and m.role <> 'guest'),
      'guests', (select count(*) from account_members m where m.account_id = a.id and m.role = 'guest'),
      'teams', (select count(*) from teams t where t.account_id = a.id),
      'departments', (select count(*) from departments d where d.account_id = a.id)
    ))
    from accounts a
    where a.id = any (coalesce(p_ids, '{}'::uuid[]))
  ), '{}'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- Identidad de varios espacios a la vez
-- ------------------------------------------------------------
create or replace function public.admin_workspace_identity(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return coalesce((
    select jsonb_object_agg(w.id, jsonb_build_object(
      'logo_updated_at', w.logo_updated_at,
      'account_color', a.color,
      'guests', (
        select count(*) from workspace_members wm
        join account_members am on am.account_id = w.account_id and am.user_id = wm.user_id and am.role = 'guest'
        where wm.workspace_id = w.id
      ),
      'templates', (select count(*) from templates t where t.workspace_id = w.id)
    ))
    from workspaces w join accounts a on a.id = w.account_id
    where w.id = any (coalesce(p_ids, '{}'::uuid[]))
  ), '{}'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- El logo de una cuenta o un espacio como data URL (la consola lo sirve con caché)
-- ------------------------------------------------------------
create or replace function public.admin_logo(p_kind text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();
  if p_kind not in ('account', 'workspace') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  select jsonb_build_object('mime', l.mime, 'base64', replace(replace(encode(l.bytes, 'base64'), E'\n', ''), E'\r', ''), 'updated_at', l.updated_at)
    into v_out
  from logos l
  where l.owner_kind = p_kind and l.owner_id = p_id;
  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Lo nuevo de una cuenta (detalle)
-- ------------------------------------------------------------
create or replace function public.admin_account_extras(p_account uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();
  if not exists (select 1 from accounts where id = p_account) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'color', a.color,
    'logo_updated_at', a.logo_updated_at,
    'roles', jsonb_build_object(
      'owner', (select count(*) from account_members m where m.account_id = a.id and m.role = 'owner'),
      'admin', (select count(*) from account_members m where m.account_id = a.id and m.role = 'admin'),
      'member', (select count(*) from account_members m where m.account_id = a.id and m.role = 'member'),
      'guest', (select count(*) from account_members m where m.account_id = a.id and m.role = 'guest')
    ),
    -- los invitados, con los espacios a los que entran
    'guests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url, 'joined_at', m.created_at,
        'last_seen_at', p.last_seen_at,
        'workspaces', (
          select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'color', w.color) order by lower(w.name)), '[]'::jsonb)
          from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = p.id and w.account_id = a.id and w.archived_at is null
        )
      ) order by m.created_at desc), '[]'::jsonb)
      from account_members m join profiles p on p.id = m.user_id
      where m.account_id = a.id and m.role = 'guest'
    ),
    -- quienes están en esta y en otras cuentas
    'shared_people', (
      select count(distinct m.user_id) from account_members m
      where m.account_id = a.id
        and exists (select 1 from account_members o where o.user_id = m.user_id and o.account_id <> a.id)
    ),
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color,
        'members', (select count(*) from team_members tm where tm.team_id = t.id)
      ) order by lower(t.name)), '[]'::jsonb)
      from teams t where t.account_id = a.id
    ),
    'departments', (select count(*) from departments d where d.account_id = a.id),
    'templates', jsonb_build_object(
      'task', (select count(*) from templates t where t.account_id = a.id and t.kind = 'task'),
      'agenda', (select count(*) from templates t where t.account_id = a.id and t.kind = 'agenda')
    ),
    'requests', jsonb_build_object(
      'total', (select count(*) from dept_requests r where r.account_id = a.id),
      'open', (select count(*) from dept_requests r where r.account_id = a.id and r.status in ('new', 'in_review', 'in_progress')),
      'last_30d', (select count(*) from dept_requests r where r.account_id = a.id and r.created_at >= now() - interval '30 days'),
      'resolved_30d', (select count(*) from dept_requests r where r.account_id = a.id and r.resolved_at >= now() - interval '30 days')
    ),
    'invites', jsonb_build_object(
      'pending', (select count(*) from account_invitations i where i.account_id = a.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
      'accepted_30d', (select count(*) from account_invitations i where i.account_id = a.id and i.accepted_at >= now() - interval '30 days'),
      'guests_pending', (select count(*) from account_invitations i where i.account_id = a.id and i.role = 'guest' and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
    ),
    'features', jsonb_build_object(
      'dependencies', (select count(*) from task_dependencies d where d.account_id = a.id),
      'recurring', (
        select count(*) from tasks t join workspaces w on w.id = t.workspace_id
        where w.account_id = a.id and t.recurrence is not null and t.status <> 'done'
      ),
      'followers', (
        select count(*) from task_followers f join tasks t on t.id = f.task_id join workspaces w on w.id = t.workspace_id
        where w.account_id = a.id and not f.muted
      ),
      'saved_views', (select count(*) from saved_views s where s.account_id = a.id),
      'threads', (
        select count(distinct m.thread_id) from chat_messages m join chats c on c.id = m.chat_id
        where c.account_id = a.id and m.thread_id is not null
      ),
      'reactions', (
        select count(*) from chat_reactions r join chat_messages m on m.id = r.message_id join chats c on c.id = m.chat_id
        where c.account_id = a.id
      ),
      'pins', (select count(*) from chat_pins p join chats c on c.id = p.chat_id where c.account_id = a.id),
      'versions', (
        select count(*) from attachment_versions v join attachments at on at.id = v.attachment_id
        where at.account_id = a.id
      ),
      'workspace_logos', (select count(*) from workspaces w where w.account_id = a.id and w.archived_at is null and w.logo_updated_at is not null)
    )
  ) into v_out
  from accounts a
  where a.id = p_account;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Adopción: quién usa lo nuevo (y cuánto), en el período
-- ------------------------------------------------------------
create or replace function public.admin_adoption(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_out jsonb;
begin
  perform platform_assert();

  with feat as (
    -- (función, cuenta, cuándo): cada cosa nueva que se creó
    select 'requests'::text as k, r.account_id as acc, r.created_at as at from dept_requests r
    union all select 'templates', t.account_id, t.created_at from templates t
    union all select 'teams', t.account_id, t.created_at from teams t
    union all select 'dependencies', d.account_id, d.created_at from task_dependencies d
    union all select 'recurring', w.account_id, t.created_at from tasks t join workspaces w on w.id = t.workspace_id where t.recurrence is not null
    union all select 'followers', w.account_id, f.created_at
      from task_followers f join tasks t on t.id = f.task_id join workspaces w on w.id = t.workspace_id where not f.muted
    union all select 'saved_views', s.account_id, s.created_at from saved_views s
    union all select 'threads', c.account_id, m.created_at from chat_messages m join chats c on c.id = m.chat_id where m.thread_id is not null
    union all select 'reactions', c.account_id, r.created_at from chat_reactions r join chat_messages m on m.id = r.message_id join chats c on c.id = m.chat_id
    union all select 'pins', c.account_id, p.pinned_at from chat_pins p join chats c on c.id = p.chat_id
    union all select 'versions', at.account_id, v.replaced_at from attachment_versions v join attachments at on at.id = v.attachment_id
    union all select 'guests', m.account_id, m.created_at from account_members m where m.role = 'guest'
    union all select 'invites', i.account_id, i.created_at from account_invitations i
  ),
  agg as (
    select f.k,
      count(distinct f.acc) as accounts,
      count(distinct f.acc) filter (where f.at >= v_since) as accounts_period,
      count(*) as items,
      count(*) filter (where f.at >= v_since) as items_period
    from feat f
    group by f.k
  ),
  weeks as (
    select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as wk
  ),
  grid as (
    select k.k, w.wk, (select count(*) from feat f where f.k = k.k and f.at >= w.wk and f.at < w.wk + interval '7 days') as n
    from (select distinct f.k from feat f) k cross join weeks w
  ),
  series as (
    select g.k, jsonb_agg(g.n order by g.wk) as s from grid g group by g.k
  ),
  -- el ritmo de todas las cuentas: tareas nuevas y cerradas por semana
  rhythm as (
    select w.wk,
      (select count(*) from tasks t where t.created_at >= w.wk and t.created_at < w.wk + interval '7 days') as created,
      (select count(*) from tasks t where t.completed_at >= w.wk and t.completed_at < w.wk + interval '7 days') as closed
    from weeks w
  )
  select jsonb_build_object(
    'days', v_days,
    'accounts_total', (select count(*) from accounts),
    'accounts_active', (select count(distinct e.account_id) from usage_events e where e.occurred_at >= v_since and e.account_id is not null),
    'features', coalesce((
      select jsonb_object_agg(a.k, jsonb_build_object(
        'accounts', a.accounts, 'accounts_period', a.accounts_period,
        'items', a.items, 'items_period', a.items_period,
        'weekly', coalesce((select s.s from series s where s.k = a.k), '[]'::jsonb)
      ))
      from agg a
    ), '{}'::jsonb),
    'identity', jsonb_build_object(
      'accounts_logo', (select count(*) from accounts where logo_updated_at is not null),
      'accounts_color', (select count(*) from accounts where color <> 'plum'),
      'workspaces_logo', (select count(*) from workspaces where logo_updated_at is not null and archived_at is null),
      'workspaces_total', (select count(*) from workspaces where archived_at is null),
      'colors', coalesce((select jsonb_object_agg(c.color, c.n) from (select color, count(*) as n from accounts group by color) c), '{}'::jsonb)
    ),
    'people', jsonb_build_object(
      'total', (select count(*) from profiles),
      -- en más de una cuenta, con cualquier rol (también como invitado)
      'multi_account', (select count(*) from (select user_id from account_members group by user_id having count(*) > 1) x),
      'owners_multi', (select count(*) from (select owner_id from accounts group by owner_id having count(*) > 1) x),
      'guests', (select count(distinct user_id) from account_members where role = 'guest'),
      'guest_accounts', (select count(distinct account_id) from account_members where role = 'guest')
    ),
    'rhythm', coalesce((
      select jsonb_agg(jsonb_build_object('week', r.wk, 'created', r.created, 'closed', r.closed) order by r.wk) from rhythm r
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Permisos: solo con sesión (y platform_assert adentro decide)
-- ------------------------------------------------------------
revoke execute on function public.admin_account_identity(uuid[]) from public, anon;
revoke execute on function public.admin_workspace_identity(uuid[]) from public, anon;
revoke execute on function public.admin_logo(text, uuid) from public, anon;
revoke execute on function public.admin_account_extras(uuid) from public, anon;
revoke execute on function public.admin_adoption(integer) from public, anon;
grant execute on function public.admin_account_identity(uuid[]) to authenticated, service_role;
grant execute on function public.admin_workspace_identity(uuid[]) to authenticated, service_role;
grant execute on function public.admin_logo(text, uuid) to authenticated, service_role;
grant execute on function public.admin_account_extras(uuid) to authenticated, service_role;
grant execute on function public.admin_adoption(integer) to authenticated, service_role;
