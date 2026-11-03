-- ============================================================
-- Veltro v2: consola, soporte y requerimientos
--
-- La app móvil crea tickets y requerimientos (20261103090000_v2_support.sql). Estas funciones son
-- las que usa el equipo de Veltro para atenderlos desde veltro-console (/support):
--   admin_support_tickets, admin_support_ticket          leer tickets (por defecto, los que van a Veltro)
--   admin_support_reply, admin_support_set_status        responder como «Veltro» y cambiar el estado
--   admin_feature_requests, admin_feature_request        leer los requerimientos de todas las cuentas
--   admin_feature_request_set_status                     mover el estado con un texto para quien lo pidió
--
-- Leen todos los roles de la consola; responden y cambian estados owner, admin y support.
-- Cada escritura queda en admin_audit_log. Solo se atienden los tickets cuyo destino es «veltro»:
-- los demás les llegan al dueño o a los admins de la cuenta, y la consola los muestra sin poder
-- responderlos (la persona vería «Veltro» metido en una conversación que no le escribió a Veltro).
--
-- También redefine admin_badges y admin_overview para sumar los contadores de soporte: mismo cuerpo
-- que en 20261010180000_v2_admin.sql más la parte nueva. Si se cambian allá, hay que cambiarlas acá.
-- ============================================================

-- ------------------------------------------------------------
-- Ayudas internas
-- ------------------------------------------------------------

-- ¿Desde cuándo espera este ticket una respuesta de Veltro? null si no la espera: no va a Veltro,
-- está resuelto o lo último que se escribió es de Veltro. Si Veltro nunca respondió, desde que se creó.
create or replace function public.support_veltro_waiting_since(p_ticket public.support_tickets)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select case
    when p_ticket.destination <> 'veltro' or p_ticket.status = 'resolved' then null
    when v.last_veltro is null then p_ticket.created_at
    else (
      select min(m.created_at) from support_ticket_messages m
      where m.ticket_id = p_ticket.id and m.author_kind = 'member' and m.created_at > v.last_veltro
    )
  end
  from (
    select max(m.created_at) as last_veltro from support_ticket_messages m
    where m.ticket_id = p_ticket.id and m.author_kind = 'veltro'
  ) v;
$$;

-- Palabras con peso de un título (minúsculas, sin tildes, 5 letras o más, sin muletillas).
-- Sirven para encontrar el mismo pedido escrito por distintas cuentas.
create or replace function public.request_title_words(p_title text)
returns text[]
language sql immutable set search_path = public
as $$
  select coalesce(array_agg(distinct w), '{}'::text[])
  from regexp_split_to_table(translate(lower(coalesce(p_title, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+') as w
  where char_length(w) >= 5
    and w <> all (array[
      'desde', 'sobre', 'entre', 'cuando', 'donde', 'poder', 'puedo', 'pueda', 'puedan', 'quiero', 'queremos',
      'necesito', 'necesitamos', 'tener', 'hacer', 'todos', 'todas', 'otras', 'otros', 'mismo', 'misma',
      'nuestro', 'nuestra', 'nuestros', 'nuestras', 'tambien', 'mejor', 'favor', 'veltro'
    ]);
$$;

-- ¿Dos títulos piden lo mismo? Al menos dos palabras en común (o la única que tenga el más corto).
create or replace function public.request_words_match(p_a text[], p_b text[])
returns boolean
language sql immutable set search_path = public
as $$
  select p_a && p_b
    and (select count(*) from unnest(p_a) x where x = any (p_b)) >= least(2, cardinality(p_a), cardinality(p_b));
$$;

-- ------------------------------------------------------------
-- Tickets: lecturas
-- ------------------------------------------------------------

-- p_status: active (sin resolver) | waiting (esperan a Veltro) | open | in_review | answered | resolved | all
-- p_scope:  veltro (los que le llegan a Veltro) | all (también los que atiende la cuenta)
-- p_sort:   recent (último mensaje) | waiting (los que más esperan primero) | created
create or replace function public.admin_support_tickets(
  p_search text default null,
  p_status text default 'active',
  p_scope text default 'veltro',
  p_account uuid default null,
  p_urgent boolean default false,
  p_sort text default 'recent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with base as materialized (
    select t.*, support_veltro_waiting_since(t) as waiting_since
    from support_tickets t
    join accounts a on a.id = t.account_id
    join profiles p on p.id = t.created_by
    where (coalesce(p_scope, 'veltro') = 'all' or t.destination = 'veltro')
      and (p_account is null or t.account_id = p_account)
      and (not coalesce(p_urgent, false) or t.urgent)
      and (v_q is null or t.title ilike '%' || v_q || '%' or t.code ilike v_q or a.name ilike '%' || v_q || '%'
           or p.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%' or t.id::text = v_q)
  ),
  filtered as (
    select * from base b
    where case coalesce(p_status, 'active')
      when 'active' then b.status <> 'resolved'
      when 'waiting' then b.waiting_since is not null
      when 'all' then true
      else b.status = p_status
    end
  ),
  ranked as (
    select f.*, count(*) over () as total,
      row_number() over (order by
        case when p_sort = 'waiting' then f.waiting_since end asc nulls last,
        case when p_sort = 'created' then f.created_at end desc,
        f.last_message_at desc, f.id) as ord
    from filtered f
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    -- para las pestañas: cuántos hay en cada estado con los demás filtros puestos
    'counts', (
      select jsonb_build_object(
        'active', count(*) filter (where b.status <> 'resolved'),
        'waiting', count(*) filter (where b.waiting_since is not null),
        'open', count(*) filter (where b.status = 'open'),
        'in_review', count(*) filter (where b.status = 'in_review'),
        'answered', count(*) filter (where b.status = 'answered'),
        'resolved', count(*) filter (where b.status = 'resolved'),
        'all', count(*),
        'urgent', count(*) filter (where b.urgent and b.status <> 'resolved')
      )
      from base b
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id, 'code', pg.code, 'title', pg.title, 'category', pg.category, 'urgent', pg.urgent,
      'where_text', pg.where_text, 'status', pg.status, 'destination', pg.destination,
      'created_at', pg.created_at, 'last_message_at', pg.last_message_at, 'resolved_at', pg.resolved_at,
      'screenshots', cardinality(pg.screenshots), 'waiting_since', pg.waiting_since,
      'account', jsonb_build_object('id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status),
      'workspace', case when w.id is null then null else jsonb_build_object('id', w.id, 'name', w.name, 'key', w.key, 'color', w.color, 'icon', w.icon) end,
      'created_by', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url,
        'role', (select am.role from account_members am where am.account_id = pg.account_id and am.user_id = pg.created_by)),
      'messages', (select count(*) from support_ticket_messages m where m.ticket_id = pg.id and m.author_kind <> 'system'),
      'last_message', (
        select jsonb_build_object('body', left(m.body, 200), 'author_kind', m.author_kind, 'created_at', m.created_at, 'author_name', ap.full_name)
        from support_ticket_messages m left join profiles ap on ap.id = m.author_id
        where m.ticket_id = pg.id and m.author_kind <> 'system'
        order by m.created_at desc, m.id desc
        limit 1
      )
    ) order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg
  join accounts a on a.id = pg.account_id
  join profiles p on p.id = pg.created_by
  left join workspaces w on w.id = pg.workspace_id;

  return v_out;
end;
$$;

-- Detalle de un ticket con la conversación. Los mensajes de sistema (cambios de estado) traen el
-- estado nuevo en body; `staff` dice si quien lo hizo es del equipo de Veltro.
create or replace function public.admin_support_ticket(p_ticket uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'ticket', to_jsonb(t) || jsonb_build_object('waiting_since', support_veltro_waiting_since(t)),
    'account', jsonb_build_object(
      'id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status, 'support_routing', a.support_routing,
      'owner', jsonb_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email, 'avatar_url', o.avatar_url)
    ),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'key', w.key, 'color', w.color, 'icon', w.icon) from workspaces w where w.id = t.workspace_id),
    'created_by', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url,
      'role', account_role_of(t.account_id, t.created_by)),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'author_kind', m.author_kind, 'body', m.body, 'created_at', m.created_at,
        'author', case when ap.id is null then null else jsonb_build_object(
          'id', ap.id, 'full_name', ap.full_name, 'email', ap.email, 'avatar_url', ap.avatar_url,
          'staff', exists (select 1 from platform_admins pa where pa.user_id = ap.id)
        ) end
      -- el aviso de estado va después del mensaje que lo provocó (comparten la hora de la transacción)
      ) order by m.created_at, (m.author_kind = 'system'), m.id), '[]'::jsonb)
      from support_ticket_messages m left join profiles ap on ap.id = m.author_id
      where m.ticket_id = t.id
    ),
    -- a quién le llega dentro de la cuenta (vacío si va a Veltro)
    'recipients', case when t.destination = 'veltro' then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('id', rp.id, 'full_name', rp.full_name, 'email', rp.email, 'avatar_url', rp.avatar_url, 'role', am.role)
        order by case am.role when 'owner' then 0 when 'admin' then 1 else 2 end, rp.full_name), '[]'::jsonb)
      from account_members am join profiles rp on rp.id = am.user_id
      where am.account_id = t.account_id and support_ticket_recipient(t, am.user_id)
    ) end,
    'related', (
      select coalesce(jsonb_agg(x order by x.last_message_at desc), '[]'::jsonb)
      from (
        select r.id, r.code, r.title, r.status, r.urgent, r.destination, r.last_message_at
        from support_tickets r
        where r.account_id = t.account_id and r.id <> t.id
        order by r.last_message_at desc
        limit 6
      ) x
    ),
    'audit', (
      select coalesce(jsonb_agg(x order by x.created_at desc, x.id desc), '[]'::jsonb)
      from (
        select l.id, l.action, l.summary, l.details, l.created_at, ap.full_name as actor
        from admin_audit_log l left join profiles ap on ap.id = l.actor_id
        where l.subject_type = 'support_ticket' and l.subject_id = t.id::text
        order by l.created_at desc, l.id desc limit 20
      ) x
    )
  ) into v_out
  from support_tickets t
  join accounts a on a.id = t.account_id
  join profiles o on o.id = a.owner_id
  join profiles p on p.id = t.created_by
  where t.id = p_ticket;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Tickets: escrituras
-- ------------------------------------------------------------

-- Responde como Veltro. El trigger de support_ticket_messages deja el ticket «respondido» (salvo que
-- esté resuelto) y marca la hora del último mensaje. La app muestra «Veltro»; la consola, quién fue.
create or replace function public.admin_support_reply(p_ticket uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_t support_tickets;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
  v_status text;
begin
  perform platform_assert(array['admin', 'support']);
  if v_body = '' then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  select * into v_t from support_tickets where id = p_ticket for update;
  if v_t.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_t.destination <> 'veltro' then
    raise exception 'not_for_veltro' using errcode = 'P0001';
  end if;

  insert into support_ticket_messages (ticket_id, author_id, author_kind, body)
  values (p_ticket, (select auth.uid()), 'veltro', v_body)
  returning id into v_id;

  select status into v_status from support_tickets where id = p_ticket;
  perform platform_log('support.replied', 'support_ticket', p_ticket::text, v_t.code || ' · ' || v_t.title,
    jsonb_strip_nulls(jsonb_build_object(
      'account_id', v_t.account_id,
      'from', case when v_status <> v_t.status then v_t.status end,
      'to', case when v_status <> v_t.status then v_status end,
      'excerpt', left(v_body, 160)
    )));
  return v_id;
end;
$$;

-- Cambia el estado. El trigger deja el mensaje de sistema y marca (o borra) resolved_at.
create or replace function public.admin_support_set_status(p_ticket uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_t support_tickets;
begin
  perform platform_assert(array['admin', 'support']);
  if p_status is null or p_status not in ('open', 'in_review', 'answered', 'resolved') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select * into v_t from support_tickets where id = p_ticket for update;
  if v_t.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_t.destination <> 'veltro' then
    raise exception 'not_for_veltro' using errcode = 'P0001';
  end if;
  if v_t.status = p_status then
    return;
  end if;

  update support_tickets set status = p_status where id = p_ticket;
  perform platform_log('support.status_changed', 'support_ticket', p_ticket::text, v_t.code || ' · ' || v_t.title,
    jsonb_build_object('account_id', v_t.account_id, 'from', v_t.status, 'to', p_status));
end;
$$;

-- ------------------------------------------------------------
-- Requerimientos: lecturas
-- ------------------------------------------------------------

-- p_status: open (recibido, en evaluación o planificado) | received | evaluating | planned | done | declined | all
-- p_impact: blocks | saves_time | nice | null (todos)
-- p_sort:   supporters (más apoyos) | recent (pedido) | updated (última actualización) | impact
-- `similar` cuenta cuántas OTRAS cuentas pidieron algo parecido (por las palabras del título).
create or replace function public.admin_feature_requests(
  p_search text default null,
  p_status text default 'open',
  p_impact text default null,
  p_account uuid default null,
  p_sort text default 'supporters',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_out jsonb;
begin
  perform platform_assert();

  with base as materialized (
    select r.*, (select count(*) from feature_request_supporters s where s.request_id = r.id) as supporters
    from feature_requests r
    join accounts a on a.id = r.account_id
    join profiles p on p.id = r.created_by
    where (p_account is null or r.account_id = p_account)
      and (p_impact is null or p_impact = 'all' or r.impact = p_impact)
      and (v_q is null or r.title ilike '%' || v_q || '%' or r.need ilike '%' || v_q || '%' or r.code ilike v_q
           or a.name ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%' or r.id::text = v_q)
  ),
  filtered as (
    select * from base b
    where case coalesce(p_status, 'open')
      when 'open' then b.status in ('received', 'evaluating', 'planned')
      when 'all' then true
      else b.status = p_status
    end
  ),
  ranked as (
    select f.*, count(*) over () as total,
      row_number() over (order by
        case when p_sort = 'recent' then f.created_at end desc,
        case when p_sort = 'updated' then f.updated_at end desc,
        case when p_sort = 'impact' then case f.impact when 'blocks' then 0 when 'saves_time' then 1 else 2 end end asc,
        f.supporters desc, f.created_at desc, f.id) as ord
    from filtered f
  ),
  page as (
    select * from ranked
    where ord > greatest(coalesce(p_offset, 0), 0)
      and ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  ),
  words as materialized (
    select r.id, r.account_id, request_title_words(r.title) as w from feature_requests r
  )
  select jsonb_build_object(
    'total', coalesce((select total from page limit 1), 0),
    'counts', (
      select jsonb_build_object(
        'open', count(*) filter (where b.status in ('received', 'evaluating', 'planned')),
        'received', count(*) filter (where b.status = 'received'),
        'evaluating', count(*) filter (where b.status = 'evaluating'),
        'planned', count(*) filter (where b.status = 'planned'),
        'done', count(*) filter (where b.status = 'done'),
        'declined', count(*) filter (where b.status = 'declined'),
        'all', count(*)
      )
      from base b
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id, 'code', pg.code, 'title', pg.title, 'need', left(pg.need, 220), 'impact', pg.impact, 'status', pg.status,
      'created_at', pg.created_at, 'updated_at', pg.updated_at, 'supporters', pg.supporters,
      'similar', (
        select count(distinct o.account_id) from words o, words me
        where me.id = pg.id and o.account_id <> pg.account_id and request_words_match(me.w, o.w)
      ),
      'account', jsonb_build_object('id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status),
      'workspace', case when w.id is null then null else jsonb_build_object('id', w.id, 'name', w.name, 'key', w.key, 'color', w.color, 'icon', w.icon) end,
      'created_by', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url,
        'role', (select am.role from account_members am where am.account_id = pg.account_id and am.user_id = pg.created_by)),
      'last_update', (
        select jsonb_build_object('status', u.status, 'body', left(u.body, 200), 'author_kind', u.author_kind, 'created_at', u.created_at)
        from feature_request_updates u
        where u.request_id = pg.id
        order by u.created_at desc, u.id desc
        limit 1
      )
    ) order by pg.ord), '[]'::jsonb)
  ) into v_out
  from page pg
  join accounts a on a.id = pg.account_id
  join profiles p on p.id = pg.created_by
  left join workspaces w on w.id = pg.workspace_id;

  return v_out;
end;
$$;

-- Detalle de un requerimiento: el pedido, su historial, quienes lo apoyan y los parecidos de otras cuentas.
create or replace function public.admin_feature_request(p_request uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'request', to_jsonb(r),
    'account', jsonb_build_object('id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status,
      'members', (select count(*) from account_members am where am.account_id = a.id)),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'key', w.key, 'color', w.color, 'icon', w.icon) from workspaces w where w.id = r.workspace_id),
    'created_by', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url,
      'role', account_role_of(r.account_id, r.created_by)),
    'updates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'status', u.status, 'body', u.body, 'author_kind', u.author_kind, 'created_at', u.created_at,
        'author', case when ap.id is null then null else jsonb_build_object(
          'id', ap.id, 'full_name', ap.full_name, 'email', ap.email, 'avatar_url', ap.avatar_url,
          'staff', exists (select 1 from platform_admins pa where pa.user_id = ap.id)
        ) end
      ) order by u.created_at, u.id), '[]'::jsonb)
      from feature_request_updates u left join profiles ap on ap.id = u.author_id
      where u.request_id = r.id
    ),
    'supporters', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sp.id, 'full_name', sp.full_name, 'email', sp.email, 'avatar_url', sp.avatar_url,
        'role', account_role_of(r.account_id, sp.id), 'created_at', s.created_at
      ) order by s.created_at, sp.full_name), '[]'::jsonb)
      from feature_request_supporters s join profiles sp on sp.id = s.user_id
      where s.request_id = r.id
    ),
    'similar', (
      select coalesce(jsonb_agg(x order by x.supporters desc, x.created_at desc), '[]'::jsonb)
      from (
        select o.id, o.code, o.title, o.status, o.impact, o.created_at, o.account_id, oa.name as account_name,
          (select count(*) from feature_request_supporters s where s.request_id = o.id) as supporters
        from feature_requests o join accounts oa on oa.id = o.account_id
        where o.account_id <> r.account_id
          and request_words_match(request_title_words(r.title), request_title_words(o.title))
        order by supporters desc, o.created_at desc
        limit 20
      ) x
    ),
    'audit', (
      select coalesce(jsonb_agg(x order by x.created_at desc, x.id desc), '[]'::jsonb)
      from (
        select l.id, l.action, l.summary, l.details, l.created_at, ap.full_name as actor
        from admin_audit_log l left join profiles ap on ap.id = l.actor_id
        where l.subject_type = 'feature_request' and l.subject_id = r.id::text
        order by l.created_at desc, l.id desc limit 20
      ) x
    )
  ) into v_out
  from feature_requests r
  join accounts a on a.id = r.account_id
  join profiles p on p.id = r.created_by
  where r.id = p_request;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Requerimientos: escrituras
-- ------------------------------------------------------------

-- Publica una actualización de Veltro: el trigger mueve el estado. Sirve también para escribir sin
-- cambiar de estado (con texto). Descartar exige explicarle a quien lo pidió por qué.
create or replace function public.admin_feature_request_set_status(p_request uuid, p_status text, p_body text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_r feature_requests;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  perform platform_assert(array['admin', 'support']);
  if p_status is null or p_status not in ('received', 'evaluating', 'planned', 'done', 'declined') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'body_too_long' using errcode = 'P0001';
  end if;
  select * into v_r from feature_requests where id = p_request for update;
  if v_r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_r.status = p_status and v_body = '' then
    raise exception 'nothing_to_change' using errcode = 'P0001';
  end if;
  if p_status = 'declined' and v_body = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  insert into feature_request_updates (request_id, status, body, author_kind, author_id)
  values (p_request, p_status, v_body, 'veltro', (select auth.uid()))
  returning id into v_id;

  perform platform_log(case when p_status = v_r.status then 'request.commented' else 'request.status_changed' end,
    'feature_request', p_request::text, v_r.code || ' · ' || v_r.title,
    jsonb_strip_nulls(jsonb_build_object(
      'account_id', v_r.account_id,
      'from', case when p_status <> v_r.status then v_r.status end,
      'to', case when p_status <> v_r.status then p_status end,
      'excerpt', nullif(left(v_body, 160), '')
    )));
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Contadores: barra lateral y Resumen (redefinidas, ver arriba)
-- ------------------------------------------------------------

create or replace function public.admin_badges()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform platform_assert();
  return jsonb_build_object(
    'online', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
    'payments_attention', (select count(*) from payments where status in ('failed', 'pending') and created_at >= now() - interval '60 days'),
    'past_due', (select count(*) from subscriptions where status = 'past_due'),
    'suspended', (select count(*) from accounts where status = 'suspended'),
    'support_waiting', (select count(*) from support_tickets t where t.destination = 'veltro' and t.status <> 'resolved' and support_veltro_waiting_since(t) is not null),
    'requests_new', (select count(*) from feature_requests where status = 'received')
  );
end;
$$;

-- Resumen general del periodo (igual que en v2_admin, más 'support')
create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 400);
  v_from timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := v_from - make_interval(days => v_days);
  v_out jsonb;
begin
  perform platform_assert();

  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'to', now()),
    'users', jsonb_build_object(
      'total', (select count(*) from profiles),
      'new', (select count(*) from profiles where created_at >= v_from),
      'new_prev', (select count(*) from profiles where created_at >= v_prev and created_at < v_from),
      'active', (select count(distinct user_id) from user_sessions where last_seen_at >= v_from),
      'active_prev', (select count(distinct user_id) from user_sessions where last_seen_at >= v_prev and started_at < v_from),
      'online', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
      'dau', (select count(distinct user_id) from user_sessions where last_seen_at >= date_trunc('day', now())),
      'wau', (select count(distinct user_id) from user_sessions where last_seen_at >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from user_sessions where last_seen_at >= now() - interval '30 days'),
      'suspended', (select count(*) from profiles where suspended_at is not null)
    ),
    'accounts', jsonb_build_object(
      'total', (select count(*) from accounts),
      'new', (select count(*) from accounts where created_at >= v_from),
      'new_prev', (select count(*) from accounts where created_at >= v_prev and created_at < v_from),
      'paying', (select count(*) from subscriptions where subscription_mrr_cents(status, billing_interval, unit_amount_cents) > 0),
      'trialing', (select count(*) from subscriptions where status = 'trialing'),
      'suspended', (select count(*) from accounts where status = 'suspended')
    ),
    'workspaces', jsonb_build_object(
      'total', (select count(*) from workspaces where archived_at is null),
      'active', (select count(distinct workspace_id) from usage_events where occurred_at >= v_from and workspace_id is not null)
    ),
    'content', jsonb_build_object(
      'tasks', (select count(*) from tasks),
      'tasks_new', (select count(*) from tasks where created_at >= v_from),
      'tasks_done', (select count(*) from tasks where completed_at >= v_from),
      'docs', (select count(*) from docs where archived_at is null),
      'docs_new', (select count(*) from docs where created_at >= v_from),
      'meetings', (select count(*) from meetings),
      'meetings_closed', (select count(*) from meetings where closed_at >= v_from),
      'storage_bytes', (select coalesce(sum(size_bytes), 0) from attachments where kind = 'file')
    ),
    'revenue', jsonb_build_object(
      'currency', coalesce((select currency from plans where price_monthly_cents > 0 order by sort limit 1), 'USD'),
      'mrr_cents', (select coalesce(sum(subscription_mrr_cents(status, billing_interval, unit_amount_cents)), 0) from subscriptions),
      'mrr_prev_cents', (
        select coalesce(sum(case when billing_interval = 'year' then round(unit_amount_cents / 12.0) else unit_amount_cents end), 0)::bigint
        from subscriptions
        where started_at < v_from and (canceled_at is null or canceled_at >= v_from)
          and (trial_ends_at is null or trial_ends_at < v_from)
      ),
      'collected_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_from),
      'collected_prev_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from payments where status in ('paid', 'refunded') and paid_at >= v_prev and paid_at < v_from),
      'failed', (select count(*) from payments where status = 'failed' and created_at >= v_from)
    ),
    'series', (
      with days as (
        select generate_series(v_from, date_trunc('day', now()), interval '1 day') as day
      ),
      su as (select date_trunc('day', created_at) as day, count(*) as n from profiles where created_at >= v_from group by 1),
      ac as (select date_trunc('day', started_at) as day, count(distinct user_id) as n from user_sessions where started_at >= v_from group by 1),
      ev as (select date_trunc('day', occurred_at) as day, count(*) as n from usage_events where occurred_at >= v_from group by 1),
      rv as (
        select date_trunc('day', paid_at) as day, sum(amount_cents - refunded_cents) as n
        from payments where status in ('paid', 'refunded') and paid_at >= v_from group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'signups', coalesce(su.n, 0),
        'active', coalesce(ac.n, 0),
        'events', coalesce(ev.n, 0),
        'revenue_cents', coalesce(rv.n, 0)
      ) order by d.day), '[]'::jsonb)
      from days d
      left join su on su.day = d.day
      left join ac on ac.day = d.day
      left join ev on ev.day = d.day
      left join rv on rv.day = d.day
    ),
    'plans', (
      select coalesce(jsonb_agg(jsonb_build_object('plan_id', p.id, 'name', p.name, 'accounts', x.n, 'mrr_cents', x.mrr) order by p.sort, p.created_at), '[]'::jsonb)
      from plans p
      cross join lateral (
        select count(a.id) as n, coalesce(sum(subscription_mrr_cents(s.status, s.billing_interval, s.unit_amount_cents)), 0) as mrr
        from accounts a left join subscriptions s on s.account_id = a.id
        where a.plan_id = p.id
      ) x
    ),
    'top_features', (
      select coalesce(jsonb_agg(t order by t.count desc), '[]'::jsonb)
      from (
        select event, count(*) as count, count(distinct user_id) as users
        from usage_events
        where occurred_at >= v_from and event not like 'user.%' and event not like 'account.%'
        group by event
        order by count(*) desc
        limit 8
      ) t
    ),
    'recent_signups', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, p.created_at,
          coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
          (select a.name from account_members am join accounts a on a.id = am.account_id where am.user_id = p.id order by am.created_at limit 1) as account_name
        from profiles p left join auth.users u on u.id = p.id
        order by p.created_at desc
        limit 6
      ) t
    ),
    'online_now', (
      select coalesce(jsonb_agg(t order by t.last_seen_at desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, p.last_seen_at,
          (select s.device from user_sessions s where s.user_id = p.id order by s.last_seen_at desc limit 1) as device
        from profiles p
        where p.last_seen_at > now() - interval '5 minutes'
        order by p.last_seen_at desc
        limit 12
      ) t
    ),
    -- soporte: tickets que van a Veltro y requerimientos de todas las cuentas
    'support', (
      select jsonb_build_object(
        'tickets_open', count(*) filter (where t.status <> 'resolved'),
        'tickets_waiting', count(*) filter (where t.status <> 'resolved' and support_veltro_waiting_since(t) is not null),
        'tickets_urgent', count(*) filter (where t.status <> 'resolved' and t.urgent),
        'tickets_new', count(*) filter (where t.created_at >= v_from),
        'tickets_resolved', count(*) filter (where t.resolved_at >= v_from),
        'requests_received', (select count(*) from feature_requests where status = 'received'),
        'requests_open', (select count(*) from feature_requests where status in ('received', 'evaluating', 'planned')),
        'requests_new', (select count(*) from feature_requests where created_at >= v_from)
      )
      from support_tickets t
      where t.destination = 'veltro'
    )
  ) into v_out;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- Privilegios de ejecución
-- ------------------------------------------------------------

-- internas: solo las usan las funciones de arriba
revoke execute on function public.support_veltro_waiting_since(public.support_tickets) from public, anon, authenticated;
revoke execute on function public.request_title_words(text) from public, anon, authenticated;
revoke execute on function public.request_words_match(text[], text[]) from public, anon, authenticated;
grant execute on function public.support_veltro_waiting_since(public.support_tickets) to service_role;
grant execute on function public.request_title_words(text) to service_role;
grant execute on function public.request_words_match(text[], text[]) to service_role;

-- consola: usuarios autenticados (cada función valida el rol)
revoke execute on function public.admin_support_tickets(text, text, text, uuid, boolean, text, integer, integer) from public, anon;
revoke execute on function public.admin_support_ticket(uuid) from public, anon;
revoke execute on function public.admin_support_reply(uuid, text) from public, anon;
revoke execute on function public.admin_support_set_status(uuid, text) from public, anon;
revoke execute on function public.admin_feature_requests(text, text, text, uuid, text, integer, integer) from public, anon;
revoke execute on function public.admin_feature_request(uuid) from public, anon;
revoke execute on function public.admin_feature_request_set_status(uuid, text, text) from public, anon;
revoke execute on function public.admin_badges() from public, anon;
revoke execute on function public.admin_overview(integer) from public, anon;
grant execute on function public.admin_support_tickets(text, text, text, uuid, boolean, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_support_ticket(uuid) to authenticated, service_role;
grant execute on function public.admin_support_reply(uuid, text) to authenticated, service_role;
grant execute on function public.admin_support_set_status(uuid, text) to authenticated, service_role;
grant execute on function public.admin_feature_requests(text, text, text, uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_feature_request(uuid) to authenticated, service_role;
grant execute on function public.admin_feature_request_set_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_badges() to authenticated, service_role;
grant execute on function public.admin_overview(integer) to authenticated, service_role;
