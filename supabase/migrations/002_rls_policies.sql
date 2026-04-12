-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_company_assignments enable row level security;
alter table public.boards enable row level security;
alter table public.board_groups enable row level security;
alter table public.items enable row level security;
alter table public.column_definitions enable row level security;
alter table public.item_column_values enable row level security;
alter table public.item_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.automations enable row level security;
alter table public.automation_logs enable row level security;
alter table public.board_views enable row level security;

-- Helper: get current user's org_id
create or replace function public.my_org_id()
returns uuid as $$
  select org_id from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper: get current user's role
create or replace function public.my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper: check if user has access to a company
create or replace function public.has_company_access(p_company_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.user_company_assignments
    where user_id = auth.uid() and company_id = p_company_id
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('org_owner', 'org_admin')
    and org_id = (select org_id from public.companies where id = p_company_id)
  );
$$ language sql security definer stable;

-- ORGANIZATIONS
create policy "Users see their own organization" on public.organizations
  for select using (id = public.my_org_id());

create policy "Org owners can update organization" on public.organizations
  for update using (id = public.my_org_id() and public.my_role() = 'org_owner');

-- COMPANIES
create policy "Users see companies in their org" on public.companies
  for select using (org_id = public.my_org_id());

create policy "Org admins can manage companies" on public.companies
  for all using (org_id = public.my_org_id() and public.my_role() in ('org_owner', 'org_admin'));

-- PROFILES
create policy "Users see profiles in their org" on public.profiles
  for select using (org_id = public.my_org_id());

create policy "Users update own profile" on public.profiles
  for update using (id = auth.uid());

-- USER COMPANY ASSIGNMENTS
create policy "Users see own assignments" on public.user_company_assignments
  for select using (
    user_id = auth.uid()
    or public.my_role() in ('org_owner', 'org_admin')
  );

create policy "Admins manage assignments" on public.user_company_assignments
  for all using (public.my_role() in ('org_owner', 'org_admin', 'company_admin'));

-- BOARDS
create policy "Users see boards of their companies" on public.boards
  for select using (public.has_company_access(company_id));

create policy "Company admins and above can manage boards" on public.boards
  for all using (
    public.has_company_access(company_id)
    and public.my_role() in ('org_owner', 'org_admin', 'company_admin')
  );

-- BOARD GROUPS, ITEMS, COLUMNS, VALUES, COMMENTS (inherit board access)
create policy "Board group access" on public.board_groups
  for all using (public.has_company_access((select company_id from public.boards where id = board_id)));

create policy "Item access" on public.items
  for all using (public.has_company_access((select company_id from public.boards where id = board_id)));

create policy "Column access" on public.column_definitions
  for all using (public.has_company_access((select company_id from public.boards where id = board_id)));

create policy "Item value access" on public.item_column_values
  for all using (public.has_company_access((
    select b.company_id from public.boards b
    join public.items i on i.board_id = b.id
    where i.id = item_id
  )));

create policy "Comment access" on public.item_comments
  for select using (public.has_company_access((
    select b.company_id from public.boards b
    join public.items i on i.board_id = b.id
    where i.id = item_id
  )));

create policy "Users create own comments" on public.item_comments
  for insert with check (user_id = auth.uid());

-- NOTIFICATIONS
create policy "Users see own notifications" on public.notifications
  for all using (user_id = auth.uid());

-- BOARD VIEWS
create policy "Users manage own board views" on public.board_views
  for all using (user_id = auth.uid());
