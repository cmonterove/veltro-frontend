-- ============================================================
-- SPRINT 2: company_groups, invitations, board memberships
-- ============================================================
-- TODO: Ejecutar en Supabase Dashboard → SQL Editor antes de desplegar Sprint 2.

-- Tabla: company_groups (departamentos dentro de una company)
CREATE TABLE IF NOT EXISTS public.company_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#2d8a6a',
  description text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabla: company_group_members (usuarios asignados a un departamento)
CREATE TABLE IF NOT EXISTS public.company_group_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_group_id uuid NOT NULL REFERENCES public.company_groups(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_group_id, user_id)
);

-- Tabla: invitations (invitaciones por email a la org)
CREATE TABLE IF NOT EXISTS public.invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('org_owner', 'admin', 'member', 'guest')),
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by      uuid REFERENCES public.profiles(id),
  accepted_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.company_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Políticas company_groups: miembros de la company pueden leer; admins pueden escribir
CREATE POLICY "company_groups_select" ON public.company_groups
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_insert" ON public.company_groups
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_update" ON public.company_groups
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_groups_delete" ON public.company_groups
  FOR DELETE USING (
    created_by = auth.uid()
  );

-- Políticas invitations: solo admins/owners pueden ver y crear invitaciones de su org
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_company_groups_company_id ON public.company_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_company_group_members_group_id ON public.company_group_members(company_group_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.invitations(organization_id);
