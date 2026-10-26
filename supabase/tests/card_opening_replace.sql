-- =============================================================================
-- Saldo actual de una tarjeta en Ajustes (0.32.0): editar reemplaza el único
-- opening vivo (el viejo queda con deleted_at, 0024 no deja cambiarle el
-- monto). La deuda (account_balance) queda en el saldo escrito y el mes no
-- cuenta el opening como gasto. Ayudas con prefijo cor_.
-- =============================================================================
begin;

create function pg_temp.cor_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.cor_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c032-00000000000a', 'authenticated', 'authenticated', 'cor-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c032-00000000000b', 'authenticated', 'authenticated', 'cor-b@test.local', '{}', '{}');

select pg_temp.cor_login('00000000-0000-4000-c032-00000000000a');
insert into public.accounts (id, name, type, currency, credit_limit_minor, payment_day) values
  ('00000000-0000-4000-c032-0000000000a1', 'Banco de Bogotá', 'credit_card', 'COP', 4700000, 21);

-- Crear con saldo 4.167.943.
insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on)
values ('00000000-0000-4000-c032-0000000000a1', 'opening', 'Banco de Bogotá', 4167943, 'COP', current_date);
select pg_temp.cor_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') = 4167943,
  'la deuda es el saldo inicial'
);

-- Un gasto real de 100.000 y luego editar el saldo a 4.500.000:
-- opening nuevo = 4.500.000 − 100.000 = 4.400.000.
insert into public.transactions (
  account_id, kind, category_key, description, amount_minor, currency, occurred_on, paid_by
) values (
  '00000000-0000-4000-c032-0000000000a1', 'expense', 'food', 'Mercado', 100000, 'COP', current_date,
  '00000000-0000-4000-c032-00000000000a'
);
update public.transactions set deleted_at = now()
where account_id = '00000000-0000-4000-c032-0000000000a1' and kind = 'opening' and deleted_at is null;
insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on)
values ('00000000-0000-4000-c032-0000000000a1', 'opening', 'Banco de Bogotá', 4400000, 'COP', current_date);

select pg_temp.cor_expect(
  (select count(*) from public.transactions
   where account_id = '00000000-0000-4000-c032-0000000000a1' and kind = 'opening' and deleted_at is null) = 1,
  'queda un solo opening vivo'
);
select pg_temp.cor_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') = 4500000,
  'la deuda queda en el saldo escrito'
);

-- Un segundo opening vivo choca con el índice único (no se duplica).
do $$
begin
  begin
    insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on)
    values ('00000000-0000-4000-c032-0000000000a1', 'opening', 'x', 1, 'COP', current_date);
  exception when unique_violation then
    return;
  end;
  raise exception 'FALLO: un segundo opening vivo debería fallar';
end $$;

-- El opening no se edita en sitio (0024).
do $$
begin
  begin
    update public.transactions set amount_minor = 1
    where account_id = '00000000-0000-4000-c032-0000000000a1' and kind = 'opening' and deleted_at is null;
  exception when others then
    return;
  end;
  raise exception 'FALLO: cambiar el monto de un opening debería fallar';
end $$;

-- B no ve la tarjeta de A ni su deuda.
select pg_temp.cor_login('00000000-0000-4000-c032-00000000000b');
select pg_temp.cor_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') is null,
  'B no ve la deuda de la tarjeta de A'
);
update public.accounts set credit_limit_minor = 1 where id = '00000000-0000-4000-c032-0000000000a1';
select pg_temp.cor_login('00000000-0000-4000-c032-00000000000a');
select pg_temp.cor_expect(
  (select credit_limit_minor from public.accounts where id = '00000000-0000-4000-c032-0000000000a1') = 4700000,
  'B no cambia el cupo de A'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
delete from auth.users
where id in ('00000000-0000-4000-c032-00000000000a', '00000000-0000-4000-c032-00000000000b');

select 'OK: el saldo actual de la tarjeta reemplaza un único opening' as resultado;

rollback;
