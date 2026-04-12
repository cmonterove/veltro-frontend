-- RLS: company_groups, user_group_memberships, board_members, boards (can_access_board)

alter table public.company_groups      enable row level security;
alter table public.user_group_memberships enable row level security;
alter table public.board_members       enable row level security;

create policy "See groups of own companies"
  on public.company_groups for select
  using (
    exists (
      select 1 from public.user_company_assignments uca
      where uca.company_id = company_groups.company_id
        and uca.user_id = auth.uid()
    )
    or public.my_role() in ('org_owner', 'org_admin')
  );

create policy "Admins manage company groups"
  on public.company_groups for all
  using (
    public.my_role() in ('org_owner', 'org_admin')
    or exists (
      select 1 from public.user_company_assignments uca
      where uca.company_id = company_groups.company_id
        and uca.user_id = auth.uid()
        and uca.role_in_company = 'company_admin'
    )
  );

create policy "See own group memberships"
  on public.user_group_memberships for select
  using (
    user_id = auth.uid()
    or public.my_role() in ('org_owner', 'org_admin')
    or exists (
      select 1 from public.user_company_assignments uca
      join public.company_groups cg on cg.company_id = uca.company_id
      where cg.id = user_group_memberships.group_id
        and uca.user_id = auth.uid()
        and uca.role_in_company = 'company_admin'
    )
  );

create policy "Admins manage group memberships"
  on public.user_group_memberships for all
  using (
    public.my_role() in ('org_owner', 'org_admin')
    or exists (
      select 1 from public.user_company_assignments uca
      join public.company_groups cg on cg.company_id = uca.company_id
      where cg.id = user_group_memberships.group_id
        and uca.user_id = auth.uid()
        and uca.role_in_company = 'company_admin'
    )
  );

create policy "See board members if can access board"
  on public.board_members for select
  using (public.can_access_board(board_id));

create policy "Board owner or admin can manage members"
  on public.board_members for all
  using (
    public.my_role() in ('org_owner', 'org_admin')
    or exists (
      select 1 from public.boards b
      where b.id = board_members.board_id
        and b.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.board_members bm
      where bm.board_id = board_members.board_id
        and bm.user_id = auth.uid()
        and bm.role = 'admin'
    )
  );

drop policy if exists "Users see boards of their companies" on public.boards;
drop policy if exists "Company admins and above can manage boards" on public.boards;

create policy "Board access via can_access_board"
  on public.boards for select
  using (public.can_access_board(id));

create policy "Board owner can update board"
  on public.boards for update
  using (
    owner_id = auth.uid()
    or public.my_role() in ('org_owner', 'org_admin')
    or exists (
      select 1 from public.board_members bm
      where bm.board_id = boards.id
        and bm.user_id = auth.uid()
        and bm.role = 'admin'
    )
  );

create policy "Company members can create boards"
  on public.boards for insert
  with check (
    exists (
      select 1 from public.user_company_assignments uca
      where uca.company_id = boards.company_id
        and uca.user_id = auth.uid()
    )
  );

create policy "Board owner can delete board"
  on public.boards for delete
  using (
    owner_id = auth.uid()
    or public.my_role() in ('org_owner', 'org_admin')
  );

drop policy if exists "Board group access"      on public.board_groups;
drop policy if exists "Item access"             on public.items;
drop policy if exists "Column access"           on public.column_definitions;
drop policy if exists "Item value access"       on public.item_column_values;
drop policy if exists "Comment access"          on public.item_comments;
drop policy if exists "Users create own comments" on public.item_comments;

create policy "Board group access"
  on public.board_groups for all
  using (public.can_access_board(board_id));

create policy "Item access"
  on public.items for all
  using (public.can_access_board(board_id));

create policy "Column access"
  on public.column_definitions for all
  using (public.can_access_board(board_id));

create policy "Item value access"
  on public.item_column_values for all
  using (
    exists (
      select 1 from public.items i
      where i.id = item_column_values.item_id
        and public.can_access_board(i.board_id)
    )
  );

create policy "Comment access"
  on public.item_comments for select
  using (
    exists (
      select 1 from public.items i
      where i.id = item_comments.item_id
        and public.can_access_board(i.board_id)
    )
  );

create policy "Users create own comments"
  on public.item_comments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.items i
      where i.id = item_comments.item_id
        and public.can_access_board(i.board_id)
    )
  );
