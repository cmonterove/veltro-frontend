-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ORGANIZATIONS (Level 1 — Master Account)
-- ============================================================
create table public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  logo_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COMPANIES (Level 2 — Sub-accounts within an organization)
-- ============================================================
create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, slug)
);

-- ============================================================
-- PROFILES (Level 3 — Users, extend Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  avatar_url text,
  role text not null default 'member' check (role in ('org_owner', 'org_admin', 'company_admin', 'member', 'guest')),
  locale text not null default 'en' check (locale in ('en', 'es', 'pt', 'fr')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- USER ↔ COMPANY ASSIGNMENTS (many-to-many)
-- ============================================================
create table public.user_company_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_in_company text not null default 'member' check (role_in_company in ('company_admin', 'member', 'guest')),
  assigned_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

-- ============================================================
-- BOARDS
-- ============================================================
create table public.boards (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null default '#0073ea',
  icon text,
  description text,
  is_private boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- BOARD GROUPS
-- ============================================================
create table public.board_groups (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  color text not null default '#579bfc',
  position integer not null default 0,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ITEMS (Tasks)
-- ============================================================
create table public.items (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.board_groups(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  parent_item_id uuid references public.items(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- COLUMN DEFINITIONS
-- ============================================================
create table public.column_definitions (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('text','status','person','date','number','timeline','checkbox','tags','dropdown','link','file','rating','formula')),
  title text not null,
  position integer not null default 0,
  settings jsonb not null default '{}',
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ITEM COLUMN VALUES
-- ============================================================
create table public.item_column_values (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.items(id) on delete cascade,
  column_id uuid not null references public.column_definitions(id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  unique(item_id, column_id)
);

-- ============================================================
-- COMMENTS
-- ============================================================
create table public.item_comments (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INVITATIONS
-- ============================================================
create table public.invitations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  company_ids uuid[] not null default '{}',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AUTOMATIONS
-- ============================================================
create table public.automations (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  trigger jsonb not null,
  conditions jsonb not null default '[]',
  actions jsonb not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.automation_logs (
  id uuid primary key default uuid_generate_v4(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  result jsonb not null
);

-- ============================================================
-- BOARD VIEWS (saved views per user/board)
-- ============================================================
create table public.board_views (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('table','kanban','calendar','gantt','gallery','chart')),
  config jsonb not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_updated_at before update on public.organizations for each row execute function public.handle_updated_at();
create trigger companies_updated_at before update on public.companies for each row execute function public.handle_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();
create trigger boards_updated_at before update on public.boards for each row execute function public.handle_updated_at();
create trigger items_updated_at before update on public.items for each row execute function public.handle_updated_at();
create trigger item_column_values_updated_at before update on public.item_column_values for each row execute function public.handle_updated_at();
create trigger item_comments_updated_at before update on public.item_comments for each row execute function public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, org_id, email, full_name, role)
  values (
    new.id,
    (new.raw_user_meta_data->>'org_id')::uuid,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
