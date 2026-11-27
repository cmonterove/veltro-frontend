-- ============================================================
-- Correo de empresas con Exchange propio (p. ej. Promoting, Exchange 2010) para avisar por correo
-- ============================================================
-- provider 'exchange': se conecta con usuario y clave (EWS + NTLM, no hay OAuth). La API guarda en
-- refresh_token, cifrados, el servidor, el usuario y la clave; `email` es la dirección que da el
-- servidor (que no siempre es el usuario con el que se entra). scopes = {ews, <id del servidor>}.

alter table public.mail_accounts drop constraint if exists mail_accounts_provider_check;
alter table public.mail_accounts add constraint mail_accounts_provider_check
  check (provider in ('google', 'microsoft', 'exchange'));
