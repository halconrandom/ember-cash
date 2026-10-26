-- =============================================================================
-- Pago de tarjeta como gasto (0032). Prefijo cpe_.
-- =============================================================================
begin;

create function pg_temp.cpe_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.cpe_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.cpe_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.cpe_fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- Gastos del mes (dashboard_totals, security invoker: llamar como el dueño).
create function pg_temp.cpe_expenses() returns bigint language sql stable as $$
  select coalesce((
    select sum(d.total_minor)
    from public.dashboard_totals(
      null,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
      'COP'
    ) d
    where d.kind = 'expense'
  ), 0)::bigint;
$$;


select pg_temp.cpe_postgres();
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c032-00000000000a', 'authenticated', 'authenticated', 'cpe-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c032-00000000000b', 'authenticated', 'authenticated', 'cpe-b@test.local', '{}', '{}');

select pg_temp.cpe_login('00000000-0000-4000-c032-00000000000a');
insert into public.accounts (id, name, type, currency, credit_limit_minor, payment_day) values
  ('00000000-0000-4000-c032-0000000000c1', 'Tarjeta de Credito Clasica', 'credit_card', 'COP', 4700000, 21),
  ('00000000-0000-4000-c032-0000000000a1', 'Banco de Bogotá', 'savings', 'COP', null, null);
insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on) values
  ('00000000-0000-4000-c032-0000000000c1', 'opening', 'Clasica', 4167943, 'COP', current_date),
  ('00000000-0000-4000-c032-0000000000a1', 'opening', 'Banco', 2000000, 'COP', current_date);
insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind, account_id)
values ('00000000-0000-4000-c032-0000000000d1', 'Tarjeta de Credito Clasica', 'COP', 4167943, 0,
  'EA', '00000000-0000-4000-c032-0000000000c1');

-- 1. Solo una transferencia puede contar como gasto.
select pg_temp.cpe_fails(
  $$insert into public.transactions (account_id, kind, category_key, description, amount_minor,
    currency, occurred_on, counts_as_expense)
    values ('00000000-0000-4000-c032-0000000000a1', 'expense', 'other', 'x', 1, 'COP',
      current_date, true)$$,
  'un gasto con counts_as_expense'
);

-- 2. Pago como gasto: una transferencia marcada.
insert into public.transactions (id, account_id, transfer_to_account_id, kind, description,
  amount_minor, currency, occurred_on, debt_id, counts_as_expense)
values ('00000000-0000-4000-c032-0000000000e1', '00000000-0000-4000-c032-0000000000a1',
  '00000000-0000-4000-c032-0000000000c1', 'transfer', 'Clasica', 500000, 'COP', current_date,
  '00000000-0000-4000-c032-0000000000d1', true);
insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor, transaction_id)
values ('00000000-0000-4000-c032-0000000000d1', current_date, 500000, 500000,
  '00000000-0000-4000-c032-0000000000e1');
select pg_temp.cpe_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') = 1500000,
  'el banco baja una vez'
);
select pg_temp.cpe_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000c1') = 3667943,
  'la tarjeta baja una vez'
);
select pg_temp.cpe_expect(pg_temp.cpe_expenses() = 500000, 'entra a Gastos del mes');
select pg_temp.cpe_expect(
  exists (
    select 1 from public.dashboard_totals(null, date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date, 'COP') d
    where d.kind = 'expense' and d.category_key = 'card_payment' and d.total_minor = 500000
  ),
  'en la categoría Pago de tarjeta'
);

-- 3. Pago como transferencia neutra: no entra a gastos.
insert into public.transactions (id, account_id, transfer_to_account_id, kind, description,
  amount_minor, currency, occurred_on, debt_id)
values ('00000000-0000-4000-c032-0000000000e2', '00000000-0000-4000-c032-0000000000a1',
  '00000000-0000-4000-c032-0000000000c1', 'transfer', 'Clasica', 100000, 'COP', current_date,
  '00000000-0000-4000-c032-0000000000d1');
insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor, transaction_id)
values ('00000000-0000-4000-c032-0000000000d1', current_date, 100000, 100000,
  '00000000-0000-4000-c032-0000000000e2');
select pg_temp.cpe_expect(pg_temp.cpe_expenses() = 500000, 'la transferencia neutra no es gasto');
select pg_temp.cpe_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') = 1400000,
  'la transferencia neutra baja el banco'
);

-- 4. Aislamiento: B no ve el gasto de A en sus totales ni la transacción.
select pg_temp.cpe_login('00000000-0000-4000-c032-00000000000b');
select pg_temp.cpe_expect(pg_temp.cpe_expenses() = 0, 'B no ve el pago de A en sus gastos');
select pg_temp.cpe_expect(
  not exists (select 1 from public.transactions where id = '00000000-0000-4000-c032-0000000000e1'),
  'B no ve la transacción de A'
);
select pg_temp.cpe_login('00000000-0000-4000-c032-00000000000a');

-- 5. Borrar el pago (la transacción y el pago, como deletePayment) revierte todo.
delete from public.debt_payments where transaction_id = '00000000-0000-4000-c032-0000000000e1';
delete from public.transactions where id = '00000000-0000-4000-c032-0000000000e1';
select pg_temp.cpe_expect(pg_temp.cpe_expenses() = 0, 'borrar el pago lo saca de gastos');
select pg_temp.cpe_expect(
  public.account_balance('00000000-0000-4000-c032-0000000000a1') = 1900000
    and public.account_balance('00000000-0000-4000-c032-0000000000c1') = 4067943,
  'borrar el pago devuelve el banco y la tarjeta'
);

-- 6. Borrar la deuda no rompe el gasto marcado (debt_id queda en null).
update public.transactions set counts_as_expense = true
where id = '00000000-0000-4000-c032-0000000000e2';
delete from public.debts where id = '00000000-0000-4000-c032-0000000000d1';
select pg_temp.cpe_expect(pg_temp.cpe_expenses() = 100000, 'el gasto sigue sin la deuda');

select pg_temp.cpe_postgres();
delete from auth.users
where id in ('00000000-0000-4000-c032-00000000000a', '00000000-0000-4000-c032-00000000000b');

select 'OK: el pago de tarjeta como gasto baja cada cuenta una vez y entra a Gastos' as resultado;

rollback;
