-- =============================================================================
-- Tests de 0007_save_transaction.sql (RPC save_transaction) y del borrado
-- suave con deshacer (deleted_at). A y B en el hogar H; C es ajeno.
-- Todo en una transacción con ROLLBACK. Ayudas con prefijo st_.
-- =============================================================================
begin;

create function pg_temp.st_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.st_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

create function pg_temp.st_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-e000-00000000000a', 'authenticated', 'authenticated', 'st-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-e000-00000000000b', 'authenticated', 'authenticated', 'st-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-e000-00000000000c', 'authenticated', 'authenticated', 'st-c@test.local', '{}', '{}');

-- A crea el hogar y una invitación; B la acepta.
select pg_temp.st_login('00000000-0000-4000-e000-00000000000a');
select set_config('test.st_h', public.create_household('H')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.st_h')::uuid, encode(sha256(convert_to('st-token', 'UTF8')), 'hex'));
insert into public.accounts (id, name, type, currency) values
  ('71000000-0000-4000-8000-000000000001', 'Personal A', 'checking', 'COP'),
  ('71000000-0000-4000-8000-000000000002', 'Ahorros A', 'savings', 'COP');
insert into public.accounts (id, household_id, name, type, currency)
values ('71000000-0000-4000-8000-000000000003', current_setting('test.st_h')::uuid, 'Casa', 'checking', 'COP');

select pg_temp.st_login('00000000-0000-4000-e000-00000000000b');
select public.accept_invite('st-token');

-- 1. A: gasto personal, sin repartos.
select pg_temp.st_login('00000000-0000-4000-e000-00000000000a');
select set_config('test.st_p', public.save_transaction(null, null, '71000000-0000-4000-8000-000000000001',
  'expense', 'food', 'Mercado', null, 86400, 'COP', current_date, '00000000-0000-4000-e000-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.st_expect((select household_id is null and owner_id = '00000000-0000-4000-e000-00000000000a'
  from public.transactions where id = current_setting('test.st_p')::uuid), 'gasto personal creado a nombre de A');
select pg_temp.st_expect((select count(*) = 0 from public.transaction_splits
  where transaction_id = current_setting('test.st_p')::uuid), 'el gasto personal no tiene repartos');

-- 2. A: gasto compartido de 1001 COP → 501 + 500.
select set_config('test.st_s', public.save_transaction(null, current_setting('test.st_h')::uuid,
  '71000000-0000-4000-8000-000000000003', 'expense', 'housing', 'Arriendo', 'Octubre', 1001, 'COP', current_date,
  '00000000-0000-4000-e000-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.st_expect((select array_agg(share_minor order by share_minor desc) = array[501, 500]::bigint[]
  from public.transaction_splits where transaction_id = current_setting('test.st_s')::uuid),
  'reparto equitativo 501 + 500 con el residuo al primer miembro');

-- 3. Editar el monto rehace los repartos.
select public.save_transaction(current_setting('test.st_s')::uuid, current_setting('test.st_h')::uuid,
  '71000000-0000-4000-8000-000000000003', 'expense', 'housing', 'Arriendo', 'Octubre', 2000, 'COP', current_date,
  '00000000-0000-4000-e000-00000000000a', null);
set constraints all immediate;
set constraints all deferred;
select pg_temp.st_expect((select sum(share_minor) = 2000 and count(*) = 2 from public.transaction_splits
  where transaction_id = current_setting('test.st_s')::uuid), 'al editar, los repartos suman el monto nuevo');

-- 4. Transferencia compartida: sin repartos.
select set_config('test.st_t', public.save_transaction(null, current_setting('test.st_h')::uuid,
  '71000000-0000-4000-8000-000000000003', 'transfer', null, 'A ahorros', null, 50000, 'COP', current_date,
  null, '71000000-0000-4000-8000-000000000001')::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.st_expect((select count(*) = 0 from public.transaction_splits
  where transaction_id = current_setting('test.st_t')::uuid), 'la transferencia compartida no tiene repartos');

-- 5. C no puede crear en H ni editar lo de A.
select pg_temp.st_login('00000000-0000-4000-e000-00000000000c');
select pg_temp.st_expect_error(format($q$select public.save_transaction(null, %L, '71000000-0000-4000-8000-000000000003',
  'expense', 'food', 'x', null, 1, 'COP', current_date, null, null)$q$, current_setting('test.st_h')), '42501',
  'C no crea transacciones en H');
select pg_temp.st_expect_error(format($q$select public.save_transaction(%L, null, '71000000-0000-4000-8000-000000000001',
  'expense', 'food', 'x', null, 1, 'COP', current_date, null, null)$q$, current_setting('test.st_p')), 'P0002',
  'C no edita la transacción personal de A');

-- 6. Borrado suave y deshacer.
select pg_temp.st_login('00000000-0000-4000-e000-00000000000b');
update public.transactions set deleted_at = now() where id = current_setting('test.st_s')::uuid;
select pg_temp.st_expect((select deleted_at is not null from public.transactions
  where id = current_setting('test.st_s')::uuid), 'B borra (suave) un gasto compartido');
update public.transactions set deleted_at = null where id = current_setting('test.st_s')::uuid;
select pg_temp.st_expect((select deleted_at is null from public.transactions
  where id = current_setting('test.st_s')::uuid), 'Deshacer restaura el gasto compartido');
update public.transactions set deleted_at = now() where id = current_setting('test.st_p')::uuid;
select pg_temp.st_login('00000000-0000-4000-e000-00000000000a');
select pg_temp.st_expect((select deleted_at is null from public.transactions
  where id = current_setting('test.st_p')::uuid), 'B no puede borrar el gasto personal de A');

select set_config('role', 'postgres', true);
select 'OK: todas las pruebas de save_transaction pasaron' as resultado;

rollback;
