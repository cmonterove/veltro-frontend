-- ============================================================
-- La burbuja de Veltro en otras plataformas (OP, CUBE…): de dónde viene cada tarea y cada solicitud
-- ============================================================
-- `source` = { platform, url?, recordId?, recordTitle? }: la plataforma que la abrió, la página en la que
-- estaba la persona y el registro que veía (p. ej. la OP 3212-12-46139-EA). Solo se escribe al crear;
-- null en lo creado dentro de Veltro.

alter table public.tasks add column if not exists source jsonb;
alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check check (
  source is null or (jsonb_typeof(source) = 'object' and jsonb_typeof(source->'platform') = 'string' and octet_length(source::text) <= 4000)
);

alter table public.dept_requests add column if not exists source jsonb;
alter table public.dept_requests drop constraint if exists dept_requests_source_check;
alter table public.dept_requests add constraint dept_requests_source_check check (
  source is null or (jsonb_typeof(source) = 'object' and jsonb_typeof(source->'platform') = 'string' and octet_length(source::text) <= 4000)
);

-- por plataforma: «lo que llegó desde OP»
create index if not exists tasks_source_platform_idx on public.tasks ((source->>'platform')) where source is not null;
create index if not exists dept_requests_source_platform_idx on public.dept_requests ((source->>'platform')) where source is not null;
