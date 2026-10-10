-- ============================================================
-- Veltro — RESET v1 → v2
-- Borra TODO el esquema public de la v1 (organizations, companies,
-- boards, items, column_definitions, ...) y lo deja limpio para v2.
-- Los usuarios de auth.users se conservan; la migración v2 les
-- crea su perfil y pasan por el onboarding.
--
-- Ejecutar UNA sola vez, antes de supabase/migrations/*.sql
-- ============================================================

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
