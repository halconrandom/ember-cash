-- =============================================================================
-- local-bootstrap.sql
-- Esquema mínimo que imita lo que Supabase trae de fábrica, para correr las
-- migraciones tal cual en un Postgres LOCAL de pruebas (scripts/db-tests.mjs).
-- Nunca se aplica al proyecto real.
--
-- Lo que usan las migraciones y los tests de Supabase:
-- - Roles anon, authenticated y service_role (sin login). service_role se
--   salta RLS, como en Supabase. postgres existe porque los tests hacen
--   set role postgres para preparar datos sin RLS.
-- - Esquema auth con auth.users (solo las columnas que usan el trigger
--   handle_new_user y los tests) y auth.uid(), que lee el "sub" del JWT de
--   request.jwt.claim.sub o de request.jwt.claims, igual que en Supabase.
-- - Permisos por defecto de Supabase en public: anon, authenticated y
--   service_role reciben todo sobre lo que crean las migraciones; cada
--   migración luego quita lo que no corresponde (revoke) y RLS filtra filas.
-- No hace falta ninguna extensión: gen_random_uuid() y sha256() son de Postgres.
-- Es idempotente: se puede correr más de una vez.
-- =============================================================================

-- Roles (son del servidor, no de la base: pueden existir de una corrida anterior).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- En Supabase, postgres es el dueño de las tablas y se salta RLS. En local
  -- basta con que exista y pueda hacer de todo (solo lo usan los tests).
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres nologin superuser;
  end if;
end $$;

-- Esquema auth.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Igual que la de Supabase: primero el claim suelto, luego el JSON completo.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Permisos por defecto de Supabase en public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
