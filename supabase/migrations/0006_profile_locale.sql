-- =============================================================================
-- 0006_profile_locale.sql
-- Idioma de la interfaz en el perfil: 'es' (por defecto) o 'en'.
-- (El número 0005 ya lo usa 0005_transfer_splits.sql.)
-- =============================================================================
alter table public.profiles
  add column locale text not null default 'es' check (locale in ('es', 'en'));

comment on column public.profiles.locale is 'Idioma de la interfaz: es (por defecto) o en.';

-- En 0001 el update de profiles se concedió columna por columna: se suma locale.
grant update (locale) on public.profiles to authenticated;
