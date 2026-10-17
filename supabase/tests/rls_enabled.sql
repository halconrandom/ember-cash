-- =============================================================================
-- Comprueba que TODAS las tablas de public tienen RLS activo.
--
-- No inserta datos. Sirve contra el proyecto enlazado, de desarrollo o de
-- producción:
--   pnpm exec supabase db query --linked -f supabase/tests/rls_enabled.sql
-- También corre con `pnpm test:rls`. Si alguna tabla no tiene RLS, el script
-- termina con FALLO y código 1.
-- =============================================================================
begin;

do $$
declare
  missing text;
  total integer;
begin
  select count(*) into total
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r';

  if total = 0 then
    raise exception 'FALLO: no hay tablas en public';
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'FALLO: tablas sin RLS: %', missing;
  end if;

  if exists (
    select 1 from pg_roles
    where rolname in ('anon', 'authenticated')
      and rolbypassrls
  ) then
    raise exception 'FALLO: anon o authenticated tiene BYPASSRLS';
  end if;
end $$;

select 'OK: RLS activo en todas las tablas de public' as resultado;

rollback;
