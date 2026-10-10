-- ============================================================
-- Veltro v2 — Storage: adjuntos de docs y tareas
-- Bucket privado. Ruta: {workspace_id}/{uuid}-{archivo}
-- El editor resuelve URLs firmadas al mostrar cada archivo.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520)
on conflict (id) do nothing;

create or replace function public.storage_workspace_id(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end;
$$;

create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_workspace_ids())
  );

create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_editable_workspace_ids())
  );

create policy attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.storage_workspace_id(name) in (select public.my_editable_workspace_ids())
  );
