-- =============================================================================
-- 0031_card_debts.sql
-- Una tarjeta de crédito con saldo deudor aparece como deuda en Deudas.
--
-- debts.account_id enlaza una deuda con su tarjeta (personal, del mismo
-- dueño; a lo sumo una deuda por tarjeta). La fuente de verdad del saldo es
-- la cuenta (account_balance, 0024): la app muestra como saldo de la deuda la
-- deuda de la tarjeta, y original_principal_minor se resincroniza a
-- saldo + pagado (lib/debts/card.ts). Así el saldo se cuenta una sola vez:
-- las sumas de Deudas usan el saldo de la deuda y ninguna pantalla suma
-- saldos de cuentas.
--
-- Pagar una deuda enlazada = transferencia de otra cuenta a la tarjeta
-- (reduce la deuda de la tarjeta y no es gasto ni ingreso). El trigger
-- debt_payments_card_guard exige esa transferencia en cada pago de una deuda
-- enlazada, así ningún camino (p. ej. /abono de Telegram, que crea un gasto)
-- registra un pago que no baje la tarjeta. telegram_list_debts deja fuera
-- las enlazadas.
--
-- Backfill: cada tarjeta personal con deuda > 0 y sin deuda enlazada recibe
-- una, con tasa 0 y mínimo 0 (no se inventan tasas) y el día de pago de la
-- tarjeta.
-- =============================================================================

alter table public.debts
  add column account_id uuid references public.accounts (id) on delete set null;

create unique index debts_one_per_account_idx
  on public.debts (account_id)
  where account_id is not null;

comment on column public.debts.account_id is
  'Tarjeta de crédito enlazada: el saldo de la deuda es la deuda de la tarjeta.';

-- La tarjeta tiene que ser una tarjeta personal del mismo dueño.
create function public.guard_debt_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
    and not exists (
      select 1 from public.accounts a
      where a.id = new.account_id
        and a.owner_id = new.owner_id
        and a.household_id is null
        and a.type = 'credit_card'
    ) then
    raise exception 'debt_account_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_debt_account() from public, anon;
grant execute on function public.guard_debt_account() to authenticated;

create trigger debts_guard_account
  before insert or update of account_id on public.debts
  for each row execute function public.guard_debt_account();

-- Un pago de una deuda enlazada tiene que ser una transferencia a su tarjeta.
create function public.guard_card_debt_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account uuid;
begin
  select d.account_id into v_account from public.debts d where d.id = new.debt_id;
  if v_account is null then
    return new;
  end if;
  if new.is_opening or new.transaction_id is null or not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id
      and t.kind = 'transfer'
      and t.transfer_to_account_id = v_account
      and t.deleted_at is null
  ) then
    raise exception 'card_debt_payment_needs_transfer' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_card_debt_payment() from public, anon;
grant execute on function public.guard_card_debt_payment() to authenticated;

-- Solo al insertar: si luego se borra la transferencia, la FK deja
-- transaction_id en null (on delete set null) y eso no debe fallar.
create trigger debt_payments_card_guard
  before insert on public.debt_payments
  for each row execute function public.guard_card_debt_payment();

-- /abono: sin las deudas enlazadas a una tarjeta (se pagan desde la app).
create or replace function public.telegram_list_debts(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_items jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  with open as (
    select
      d.id, d.name, d.currency,
      greatest(
        d.original_principal_minor - coalesce((
          select sum(p.principal_minor) from public.debt_payments p where p.debt_id = d.id
        ), 0),
        0
      ) as balance_minor
    from public.debts d
    where d.owner_id = v_uid and d.deleted_at is null and d.closed_at is null
      and d.account_id is null
    order by d.name
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'debt_id', open.id,
    'name', open.name,
    'currency', open.currency,
    'balance_minor', open.balance_minor::text
  ) order by open.name), '[]'::jsonb)
  into v_items
  from open;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.telegram_list_debts(bigint) from public, anon, authenticated;
grant execute on function public.telegram_list_debts(bigint) to service_role;

-- Backfill (como postgres: account_balance ve todas las filas).
insert into public.debts (
  owner_id, name, icon_key, currency, original_principal_minor, apr_bps, apr_kind,
  min_payment_minor, due_day, started_on, account_id
)
select a.owner_id, a.name, 'credit-card', a.currency, b.debt, 0, 'EA', 0, a.payment_day,
  current_date, a.id
from public.accounts a
cross join lateral (select public.account_balance(a.id) as debt) b
where a.type = 'credit_card'
  and a.household_id is null
  and a.archived_at is null
  and b.debt > 0
  and not exists (select 1 from public.debts d where d.account_id = a.id);
