-- =============================================================================
-- 0032_card_payment_expense.sql
-- Pagar una deuda de tarjeta puede contar como gasto del mes.
--
-- Muchas compras viejas de la tarjeta no están registradas como gastos; al
-- pagar la tarjeta el usuario quiere ver ese dinero salir en Gastos/Balance.
-- El pago sigue siendo UNA transferencia banco → tarjeta (0031: el guard
-- debt_payments_card_guard la sigue exigiendo), así cada cuenta baja una sola
-- vez. counts_as_expense = true la marca como gasto: dashboard_totals la suma
-- como kind 'expense' con la categoría de sistema card_payment. Con false es
-- la transferencia neutra de 0.33.0. Telegram no cambia.
-- =============================================================================

insert into public.categories (key, kind, sort) values ('card_payment', 'expense', 75)
on conflict do nothing;

alter table public.transactions
  add column counts_as_expense boolean not null default false;

-- Solo una transferencia puede contar como gasto (la app la marca solo al
-- pagar una deuda de tarjeta; no se exige debt_id porque al borrar la deuda
-- la FK lo deja en null y el gasto debe seguir contado).
alter table public.transactions add constraint transactions_counts_as_expense_shape check (
  not counts_as_expense or kind = 'transfer'
);

comment on column public.transactions.counts_as_expense is
  'Pago de tarjeta (transferencia con debt_id) que cuenta como gasto card_payment en los totales.';

create or replace function public.dashboard_totals(
  p_household_id uuid,
  p_from date,
  p_to date,
  p_display_currency text
)
returns table (
  month date,
  kind text,
  category_key text,
  currency text,
  total_minor bigint,
  tx_count integer,
  converted_minor bigint,
  uncovered_minor bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := p_household_id;
  v_from date := p_from::date;
  v_to date := p_to::date;
  v_display_currency text;
begin
  select c.code into v_display_currency
  from public.currencies c
  where c.code = p_display_currency;

  if v_display_currency is null then
    raise exception 'unknown_display_currency'
      using errcode = '22023';
  end if;

  return query execute format(
    $q$
    with base as (
      select
        t.occurred_on,
        -- Pago de tarjeta como gasto (0032): la transferencia cuenta como
        -- gasto de la categoría card_payment. Una sola fila: el banco y la
        -- tarjeta bajan una vez (account_balance) y el gasto se cuenta una vez.
        case when t.counts_as_expense then 'expense' else t.kind end as kind,
        case when t.counts_as_expense then 'card_payment' else t.category_key end as category_key,
        t.currency,
        t.amount_minor
      from public.transactions t
      where t.occurred_on between %L::date and %L::date
        and t.deleted_at is null
        and (t.kind in ('expense', 'income') or t.counts_as_expense)
        and (
          (%L::uuid is null and t.household_id is null and t.owner_id = (select auth.uid()))
          or (%L::uuid is not null and t.household_id = %L::uuid)
        )
    ),
    display_scale as (
      select (10::numeric) ^ c.exponent as scale
      from public.currencies c
      where c.code = %L
    ),
    -- Combinaciones (moneda de origen, fecha) distintas que hace falta
    -- convertir porque su moneda no es la elegida.
    foreign_days as (
      select distinct b.currency, b.occurred_on
      from base b
      where b.currency <> %L
    ),
    -- "1 unidad de esa moneda, en USD" (1 si ya es USD), vigente esa fecha
    -- o antes; null si no hay ninguna tasa tan vieja (nunca se inventa).
    currency_usd_legs as (
      select
        fd.currency,
        fd.occurred_on,
        case
          when fd.currency = 'USD' then 1::numeric
          else coalesce(
            (
              select er.rate
              from public.exchange_rates er
              where er.base = fd.currency and er.quote = 'USD' and er.as_of <= fd.occurred_on
              order by er.as_of desc
              limit 1
            ),
            (
              select 1 / er.rate
              from public.exchange_rates er
              where er.base = 'USD' and er.quote = fd.currency and er.as_of <= fd.occurred_on
              order by er.as_of desc
              limit 1
            )
          )
        end as usd_per_unit
      from foreign_days fd
    ),
    -- Lo mismo para la moneda elegida, una vez por fecha distinta.
    display_usd_legs as (
      select
        d.occurred_on,
        case
          when %L = 'USD' then 1::numeric
          else coalesce(
            (
              select er.rate
              from public.exchange_rates er
              where er.base = %L and er.quote = 'USD' and er.as_of <= d.occurred_on
              order by er.as_of desc
              limit 1
            ),
            (
              select 1 / er.rate
              from public.exchange_rates er
              where er.base = 'USD' and er.quote = %L and er.as_of <= d.occurred_on
              order by er.as_of desc
              limit 1
            )
          )
        end as usd_per_unit
      from (select distinct occurred_on from foreign_days) d
    ),
    priced as (
      select
        b.occurred_on,
        b.kind,
        b.category_key,
        b.currency,
        b.amount_minor,
        cl.usd_per_unit as currency_usd_per_unit,
        dl.usd_per_unit as display_usd_per_unit,
        fc.exponent as from_exponent
      from base b
      left join currency_usd_legs cl on cl.currency = b.currency and cl.occurred_on = b.occurred_on
      left join display_usd_legs dl on dl.occurred_on = b.occurred_on
      left join public.currencies fc on fc.code = b.currency
    )
    select
      date_trunc('month', p.occurred_on)::date as month,
      p.kind,
      p.category_key,
      p.currency,
      sum(p.amount_minor)::bigint as total_minor,
      count(*)::integer as tx_count,
      sum(
        case
          when p.currency = %L then p.amount_minor
          when p.currency_usd_per_unit is not null and p.display_usd_per_unit is not null then
            round(
              p.amount_minor::numeric
              * (p.currency_usd_per_unit / p.display_usd_per_unit)
              * ds.scale
              / ((10::numeric) ^ p.from_exponent)
            )
          else 0
        end
      )::bigint as converted_minor,
      sum(
        case
          when p.currency <> %L
            and (p.currency_usd_per_unit is null or p.display_usd_per_unit is null)
            then p.amount_minor
          else 0
        end
      )::bigint as uncovered_minor
    from priced p, display_scale ds
    group by 1, 2, 3, 4
    $q$,
    v_from, v_to,
    v_household_id, v_household_id, v_household_id,
    v_display_currency,
    v_display_currency,
    v_display_currency,
    v_display_currency,
    v_display_currency,
    v_display_currency,
    v_display_currency
  );
end;
$$;

revoke execute on function public.dashboard_totals(uuid, date, date, text) from public, anon;
grant execute on function public.dashboard_totals(uuid, date, date, text) to authenticated;
