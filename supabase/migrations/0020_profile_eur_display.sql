-- =============================================================================
-- 0020_profile_eur_display.sql
-- Fase E2: profiles.display_currency admite EUR (hasta ahora el CHECK de
-- 0001_auth_households.sql solo dejaba COP/USD). Sin esto, elegir EUR en el
-- selector de moneda guardaría sin error en la app pero fallaría al llegar a
-- la base.
-- =============================================================================
alter table public.profiles
  drop constraint profiles_display_currency_check;

alter table public.profiles
  add constraint profiles_display_currency_check check (display_currency in ('COP', 'USD', 'EUR'));
