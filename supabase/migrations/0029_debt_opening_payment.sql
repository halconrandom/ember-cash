-- =============================================================================
-- 0029_debt_opening_payment.sql
-- Pago inicial de una deuda que ya se venía pagando.
--
-- El formulario de Deudas pide el principal original y, opcional, el saldo
-- actual. La diferencia (principal − pagos reales − saldo actual) se guarda
-- como UN pago con is_opening = true:
--   * capital puro (interés 0), fecha = started_on de la deuda;
--   * sin transacción vinculada: no es un gasto de ningún mes ni toca el
--     saldo de ninguna cuenta (como el saldo inicial de 0024);
--   * no salda vencimientos (recurring_occurrences): solo recordPayment y
--     /abono lo hacen, y este pago no pasa por ahí;
--   * una sola fila por deuda; editar la reemplaza, nunca la duplica.
-- El saldo sigue saliendo de sumar principal_minor de todos los pagos, así
-- que la app, el payoff y el bot de Telegram (0028) lo ven sin cambios.
-- =============================================================================

alter table public.debt_payments
  add column is_opening boolean not null default false;

alter table public.debt_payments
  add constraint debt_payments_opening_shape
  check (not is_opening or (transaction_id is null and interest_minor = 0));

comment on column public.debt_payments.is_opening is
  'Pago inicial (lo ya pagado antes de registrar la deuda). Sin transacción ni interés; uno por deuda.';

create unique index debt_payments_one_opening_idx
  on public.debt_payments (debt_id)
  where is_opening;

-- El principal nunca puede quedar por debajo de lo ya pagado (saldo < 0).
create function public.guard_debt_principal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.original_principal_minor < coalesce((
    select sum(p.principal_minor) from public.debt_payments p where p.debt_id = new.id
  ), 0) then
    raise exception 'principal_below_paid' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_debt_principal() from public, anon;
grant execute on function public.guard_debt_principal() to authenticated;

create trigger debts_guard_principal
  before update of original_principal_minor on public.debts
  for each row execute function public.guard_debt_principal();

-- Fija el principal y el pago inicial de una deuda en un solo paso.
-- p_balance_minor: saldo actual contando el pago inicial y los pagos reales.
--   null = sin pago inicial (borra el que hubiera).
-- Devuelve 'ok', 'not_found', 'balance_too_high' (saldo > principal − pagos
-- reales) o 'principal_below_paid'. security invoker: RLS decide.
create function public.set_debt_opening(
  p_debt_id uuid,
  p_principal_minor bigint,
  p_balance_minor bigint
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_started date;
  v_real bigint;
  v_opening bigint;
begin
  select d.started_on into v_started
  from public.debts d
  where d.id = p_debt_id and d.deleted_at is null
  for update;
  if not found then
    return 'not_found';
  end if;

  if p_principal_minor is null or p_principal_minor <= 0
    or (p_balance_minor is not null and p_balance_minor < 0) then
    return 'balance_too_high';
  end if;

  select coalesce(sum(p.principal_minor), 0) into v_real
  from public.debt_payments p
  where p.debt_id = p_debt_id and not p.is_opening;

  if v_real > p_principal_minor then
    return 'principal_below_paid';
  end if;

  v_opening := case
    when p_balance_minor is null then 0
    else p_principal_minor - v_real - p_balance_minor
  end;
  if v_opening < 0 then
    return 'balance_too_high';
  end if;

  if v_opening = 0 then
    delete from public.debt_payments where debt_id = p_debt_id and is_opening;
  else
    insert into public.debt_payments (
      debt_id, paid_on, amount_minor, interest_minor, principal_minor, transaction_id, is_opening
    ) values (
      p_debt_id, v_started, v_opening, 0, v_opening, null, true
    )
    on conflict (debt_id) where is_opening do update
      set amount_minor = excluded.amount_minor,
          principal_minor = excluded.principal_minor,
          interest_minor = 0,
          paid_on = excluded.paid_on;
  end if;

  update public.debts set original_principal_minor = p_principal_minor
  where id = p_debt_id and original_principal_minor is distinct from p_principal_minor;

  return 'ok';
end;
$$;

revoke all on function public.set_debt_opening(uuid, bigint, bigint) from public, anon;
grant execute on function public.set_debt_opening(uuid, bigint, bigint) to authenticated;
