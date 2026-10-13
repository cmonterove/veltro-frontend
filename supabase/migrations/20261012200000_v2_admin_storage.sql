-- ============================================================
-- Veltro v2: consola, almacenamiento de archivos
-- Quién ocupa espacio en el servidor de documentos: cuentas, y dentro de cada cuenta,
-- sus espacios y las personas que suben. Solo lectura; la usa veltro-console (/storage).
-- Hoy cada archivo pertenece a un espacio (attachments.workspace_id), así que la cuenta
-- sale del espacio. Los links no ocupan almacenamiento: se cuentan aparte.
-- ============================================================

create or replace function public.admin_storage(p_account uuid default null, p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 730);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := date_trunc('day', now()) - make_interval(days => 2 * v_days - 1);
  v_out jsonb;
begin
  perform platform_assert();

  -- cada adjunto con la cuenta a la que pertenece (por su espacio); todo lo de abajo sale de acá
  with f0 as materialized (
    select at.id, at.name, at.mime_type, coalesce(at.size_bytes, 0)::bigint as bytes, at.kind, at.created_at, at.uploaded_by, at.workspace_id, w.account_id
    from attachments at join workspaces w on w.id = at.workspace_id
  )
  select jsonb_build_object(
    'days', v_days,
    'totals', (
      select jsonb_build_object(
        'bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file'), 0),
        'files', count(*) filter (where f.kind = 'file'),
        'links', count(*) filter (where f.kind = 'link'),
        'accounts', count(distinct f.account_id) filter (where f.kind = 'file'),
        'workspaces', count(distinct f.workspace_id) filter (where f.kind = 'file'),
        'uploaders', count(distinct f.uploaded_by) filter (where f.kind = 'file'),
        'period_bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_since), 0),
        'period_files', count(*) filter (where f.kind = 'file' and f.created_at >= v_since),
        'prev_bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_prev and f.created_at < v_since), 0)
      )
      from f0 f
    ),
    -- lo que se sube por día en el período (en bytes y archivos)
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'bytes', coalesce(s.bytes, 0), 'files', coalesce(s.files, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_since, date_trunc('day', now()), interval '1 day') as d(day)
      left join (
        select date_trunc('day', f.created_at) as day, sum(f.bytes) as bytes, count(*) as files
        from f0 f
        where f.kind = 'file' and f.created_at >= v_since
        group by 1
      ) s on s.day = d.day
    ),
    'by_type', (
      select coalesce(jsonb_agg(jsonb_build_object('type', x.t, 'files', x.n, 'bytes', x.b) order by x.b desc), '[]'::jsonb)
      from (
        -- el orden importa: los tipos de Office dicen "officedocument" aunque sean hojas o presentaciones
        select case
            when f.mime_type like 'image/%' then 'image'
            when f.mime_type like 'video/%' then 'video'
            when f.mime_type = 'application/pdf' then 'pdf'
            when f.mime_type ~ '(spreadsheet|excel|csv)' then 'sheet'
            when f.mime_type ~ '(presentation|powerpoint)' then 'slides'
            when f.mime_type ~ '(word|document|text/)' then 'doc'
            else 'other' end as t,
          count(*) as n, coalesce(sum(f.bytes), 0) as b
        from f0 f
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by 1
      ) x
    ),
    -- todas las cuentas con archivos, de la que más ocupa a la que menos
    'accounts', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc, x.files desc), '[]'::jsonb)
      from (
        select a.id, a.name, a.plan_id, a.status,
          coalesce(sum(f.bytes) filter (where f.kind = 'file'), 0) as bytes,
          count(*) filter (where f.kind = 'file') as files,
          count(*) filter (where f.kind = 'link') as links,
          count(distinct f.workspace_id) filter (where f.kind = 'file') as workspaces,
          count(distinct f.uploaded_by) filter (where f.kind = 'file') as uploaders,
          coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_since), 0) as period_bytes,
          max(f.created_at) filter (where f.kind = 'file') as last_upload_at,
          coalesce(max(f.bytes) filter (where f.kind = 'file'), 0) as largest_bytes
        from f0 f join accounts a on a.id = f.account_id
        group by a.id
        having count(*) filter (where f.kind = 'file') > 0
        order by 5 desc
        limit 500
      ) x
    ),
    'top_workspaces', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select w.id, w.name, w.icon, w.color, w.archived_at, a.id as account_id, a.name as account_name,
          sum(f.bytes) as bytes, count(*) as files, max(f.created_at) as last_upload_at
        from f0 f join workspaces w on w.id = f.workspace_id join accounts a on a.id = f.account_id
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by w.id, a.id
        order by 8 desc
        limit case when p_account is null then 15 else 200 end
      ) x
    ),
    -- por persona dentro de cada cuenta: quien sube a dos cuentas aparece en las dos
    'top_users', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, a.id as account_id, a.name as account_name,
          sum(f.bytes) as bytes, count(*) as files, count(distinct f.workspace_id) as workspaces, max(f.created_at) as last_upload_at
        from f0 f join accounts a on a.id = f.account_id left join profiles p on p.id = f.uploaded_by
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by p.id, a.id
        order by 7 desc
        limit case when p_account is null then 15 else 200 end
      ) x
    ),
    -- detalle de una cuenta: lo de arriba ya viene filtrado; acá sus datos y sus archivos más pesados
    'account', case when p_account is null then null else (
      select jsonb_build_object(
        'id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status,
        'bytes', coalesce((select sum(f.bytes) from f0 f where f.account_id = a.id and f.kind = 'file'), 0),
        'files', (select count(*) from f0 f where f.account_id = a.id and f.kind = 'file'),
        'links', (select count(*) from f0 f where f.account_id = a.id and f.kind = 'link'),
        'period_bytes', coalesce((select sum(f.bytes) from f0 f where f.account_id = a.id and f.kind = 'file' and f.created_at >= v_since), 0),
        'largest', (
          select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
          from (
            select f.id, f.name, f.mime_type, f.bytes, f.created_at, w.id as workspace_id, w.name as workspace_name,
              p.id as uploader_id, p.full_name as uploader_name
            from f0 f join workspaces w on w.id = f.workspace_id left join profiles p on p.id = f.uploaded_by
            where f.account_id = a.id and f.kind = 'file'
            order by f.bytes desc
            limit 15
          ) x
        )
      )
      from accounts a where a.id = p_account
    ) end
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.admin_storage(uuid, integer) from public, anon;
grant execute on function public.admin_storage(uuid, integer) to authenticated, service_role;
