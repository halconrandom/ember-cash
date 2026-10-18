-- =============================================================================
-- B-07: household_has_member y transaction_has_former_member no revelan ids
-- de otro hogar. Dos hogares (A+B y C). Corre en Postgres local (pnpm test:rls).
-- =============================================================================
begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-4000-b070-00000000000a', 'authenticated', 'authenticated',
   'b07-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-b070-00000000000b', 'authenticated', 'authenticated',
   'b07-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-b070-00000000000c', 'authenticated', 'authenticated',
   'b07-c@test.local', '{}', '{}');

-- Hogar 1: A administra, B entra.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000a","role":"authenticated"}', true);
select set_config('test.b07_h1', public.create_household('Hogar uno')::text, true);
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-b070-0000000000a1', current_setting('test.b07_h1')::uuid,
  'Caja', 'checking', 'COP');
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.b07_h1')::uuid,
  encode(sha256(convert_to('b07-token-b', 'UTF8')), 'hex'));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000b","role":"authenticated"}', true);
select public.accept_invite('b07-token-b');

-- Gasto compartido. El reparto de B queda de un ex miembro al quitar la fila.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000a","role":"authenticated"}', true);
select set_config('test.b07_tx', public.save_transaction(
  null, current_setting('test.b07_h1')::uuid,
  '00000000-0000-4000-b070-0000000000a1', 'expense', 'food', 'Mercado', null,
  1000, 'COP', current_date,
  '00000000-0000-4000-b070-00000000000a', null)::text, true);

-- Hogar 2, solo de C. No comparte nada con el hogar 1.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000c","role":"authenticated"}', true);
select set_config('test.b07_h2', public.create_household('Hogar dos')::text, true);

-- Quitar a B sin pasar por la RPC: el saldo no importa para el oráculo.
reset role;
delete from public.household_members
where household_id = current_setting('test.b07_h1')::uuid
  and user_id = '00000000-0000-4000-b070-00000000000b';

do $$
declare
  fn record;
begin
  for fn in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('household_has_member', 'transaction_has_former_member')
  loop
    if not fn.prosecdef then
      raise exception 'FALLO: % no es security definer', fn.proname;
    end if;
    if not exists (
      select 1 from unnest(fn.proconfig) cfg where cfg like 'search_path=%'
    ) then
      raise exception 'FALLO: % no tiene search_path fijo', fn.proname;
    end if;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000a","role":"authenticated"}', true);

do $$
declare
  h1 uuid := current_setting('test.b07_h1')::uuid;
  h2 uuid := current_setting('test.b07_h2')::uuid;
  tx uuid := current_setting('test.b07_tx')::uuid;
  missing_h uuid := '00000000-0000-4000-b070-00000000eeee';
  missing_t uuid := '00000000-0000-4000-b070-00000000ffff';
  a uuid := '00000000-0000-4000-b070-00000000000a';
  c uuid := '00000000-0000-4000-b070-00000000000c';
begin
  -- A sí ve su hogar y el bloqueo real (B ya no es miembro).
  if public.household_has_member(h1, a) is distinct from true then
    raise exception 'FALLO: A no ve su propia membresía';
  end if;
  if public.transaction_has_former_member(tx) is distinct from true then
    raise exception 'FALLO: A no ve el ex miembro de su transacción';
  end if;
  -- El otro hogar no es suyo: false, igual que un id que no existe.
  if public.household_has_member(h2, c) is distinct from false
     or public.household_has_member(h2, c) is distinct from public.household_has_member(missing_h, c) then
    raise exception 'FALLO: A distingue el hogar de C de uno inexistente';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b070-00000000000c","role":"authenticated"}', true);

do $$
declare
  h1 uuid := current_setting('test.b07_h1')::uuid;
  tx uuid := current_setting('test.b07_tx')::uuid;
  missing_h uuid := '00000000-0000-4000-b070-00000000eeee';
  missing_t uuid := '00000000-0000-4000-b070-00000000ffff';
  a uuid := '00000000-0000-4000-b070-00000000000a';
  nobody uuid := '00000000-0000-4000-b070-0000000000ff';
begin
  -- C no es del hogar 1. Miembro real, miembro inventado e id de hogar
  -- inventado responden lo mismo.
  if public.household_has_member(h1, a) is distinct from false
     or public.household_has_member(h1, nobody) is distinct from false
     or public.household_has_member(missing_h, a) is distinct from false then
    raise exception 'FALLO: C distingue membresías del hogar de A';
  end if;
  -- La transacción bloqueada y un id que no existe responden lo mismo.
  if public.transaction_has_former_member(tx) is distinct from false
     or public.transaction_has_former_member(missing_t) is distinct from false
     or public.transaction_has_former_member(tx)
        is distinct from public.transaction_has_former_member(missing_t) then
    raise exception 'FALLO: C distingue la transacción de A de una inexistente';
  end if;
  -- Su propio hogar sí responde.
  if public.household_has_member(current_setting('test.b07_h2')::uuid,
       '00000000-0000-4000-b070-00000000000c') is distinct from true then
    raise exception 'FALLO: C no ve su propia membresía';
  end if;
end $$;

reset role;

select 'OK: las funciones definer no revelan ids de otro hogar' as resultado;

rollback;
