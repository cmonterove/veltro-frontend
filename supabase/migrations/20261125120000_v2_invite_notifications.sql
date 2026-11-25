-- ============================================================
-- Veltro v2: avisos de invitaciones y de espacios
--
-- notifications + account_invited   te invitaron a una cuenta. Le llega a quien ya tiene usuario con
--                                   ese correo, aunque todavía no sea de la cuenta: sale en la campana
--                                   de cualquier cuenta suya (y en la bienvenida si no tiene ninguna).
--                                   Lo que se muestra (cuenta, quién invita, rol, espacios, vencimiento
--                                   e invitationId) va en data: la cuenta y la invitación no las puede
--                                   leer todavía.
--               + workspace_added   te sumaron a un espacio (sale con notify_people, como los demás).
-- Los crea la API junto con el correo; el push sale solo, como el de cualquier aviso.
-- ============================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_assigned', 'task_comment', 'task_mention', 'task_done', 'chat_mention',
  'task_due_today', 'task_overdue', 'member_joined', 'task_status', 'task_due_changed',
  'task_unblocked', 'request_new', 'request_message', 'request_status', 'chat_thread',
  'account_invited', 'workspace_added'
));

-- el aviso de una invitación se busca por ella (al renovarla, anularla o aceptarla se quita)
create index if not exists notifications_invitation_idx on public.notifications ((data ->> 'invitationId'))
  where kind = 'account_invited';
