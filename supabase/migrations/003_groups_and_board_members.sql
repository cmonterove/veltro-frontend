-- ============================================================
-- COMPANY GROUPS (departments inside a company)
-- e.g. Sales, Tech, HR, Marketing
-- ============================================================
create table public.company_groups (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default '#2d8a6a',
  icon        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(company_id, name)
);

-- ============================================================
-- USER ↔ COMPANY GROUP MEMBERSHIPS (many-to-many)
-- A user can belong to multiple groups within a company
-- ============================================================
create table public.user_group_memberships (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  group_id   uuid not null references public.company_groups(id) on delete cascade,
  added_by   uuid references public.profiles(id),
  added_at   timestamptz not null default now(),
  primary key (user_id, group_id)
);

-- ============================================================
-- UPDATE BOARDS: add ownership + visibility
-- ============================================================

alter table public.boards
  add column if not exists owner_id uuid references public.profiles(id);

update public.boards set owner_id = created_by where owner_id is null;

alter table public.boards
  alter column owner_id set not null;

alter table public.boards
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'company', 'groups'));

update public.boards set visibility = 'company' where is_private = false;

comment on column public.boards.is_private is 'DEPRECATED — use visibility instead';

-- ============================================================
-- BOARD MEMBERS
-- ============================================================
create table public.board_members (
  id          uuid primary key default uuid_generate_v4(),
  board_id    uuid not null references public.boards(id) on delete cascade,

  user_id     uuid references public.profiles(id) on delete cascade,
  group_id    uuid references public.company_groups(id) on delete cascade,

  role        text not null default 'member'
              check (role in ('admin', 'member', 'viewer')),

  invited_by  uuid references public.profiles(id),
  invited_at  timestamptz not null default now(),

  constraint board_member_target_check check (
    (user_id is not null and group_id is null) or
    (user_id is null and group_id is not null)
  ),

  constraint board_member_user_unique  unique (board_id, user_id),
  constraint board_member_group_unique unique (board_id, group_id)
);

create index idx_board_members_board   on public.board_members(board_id);
create index idx_board_members_user    on public.board_members(user_id);
create index idx_board_members_group   on public.board_members(group_id);
create index idx_user_group_user       on public.user_group_memberships(user_id);
create index idx_user_group_group      on public.user_group_memberships(group_id);
create index idx_company_groups_co     on public.company_groups(company_id);

create trigger company_groups_updated_at
  before update on public.company_groups
  for each row execute function public.handle_updated_at();

-- ============================================================
-- HELPER: can_access_board
-- ============================================================
create or replace function public.can_access_board(p_board_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.boards b on b.id = p_board_id
    join public.companies c on c.id = b.company_id
    where p.id = auth.uid()
      and p.org_id = c.org_id
      and p.role in ('org_owner', 'org_admin')

    union all

    select 1
    from public.boards b
    join public.user_company_assignments uca on uca.company_id = b.company_id
    where b.id = p_board_id
      and b.visibility = 'company'
      and uca.user_id = auth.uid()

    union all

    select 1
    from public.boards b
    where b.id = p_board_id
      and b.owner_id = auth.uid()

    union all

    select 1
    from public.board_members bm
    where bm.board_id = p_board_id
      and bm.user_id = auth.uid()

    union all

    select 1
    from public.board_members bm
    join public.user_group_memberships ugm on ugm.group_id = bm.group_id
    where bm.board_id = p_board_id
      and ugm.user_id = auth.uid()
  );
$$;
