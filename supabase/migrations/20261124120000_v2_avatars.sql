-- ============================================================
-- Veltro v2: foto de perfil subida por la persona
--
-- Hasta ahora la foto salía solo de Google o Apple (profiles.avatar_url al crear la cuenta). Ahora
-- también se puede subir una desde la app. Los bytes van en una tabla propia (como los logos: así
-- ninguna consulta amplia de profiles arrastra la imagen) y profiles.avatar_url apunta a la API:
--   https://<api>/v1/avatars/<key>
-- La clave es al azar (no se puede adivinar) y cambia con cada foto, así la URL se puede guardar
-- para siempre en cachés. La ve quien tenga el link, que solo reciben quienes comparten cuenta
-- con la persona (como las fotos de Google). Nadie toca la tabla con su sesión: solo la API como
-- servicio, después de comprobar que la foto es de quien tiene la sesión.
-- ============================================================

create table if not exists public.avatars (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  key         text not null unique check (key ~ '^[A-Za-z0-9_-]{22,64}$'),
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes       bytea not null check (octet_length(bytes) between 1 and 524288),
  updated_at  timestamptz not null default now()
);

alter table public.avatars enable row level security;
-- sin policies: con la sesión de una persona no se ve ni se escribe nada (solo la API como servicio)
revoke all on public.avatars from anon, authenticated;
grant all on public.avatars to service_role;
