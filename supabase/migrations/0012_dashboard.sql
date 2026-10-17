-- =============================================================================
-- 0012_dashboard.sql
-- Agregados del dashboard (fase 11): sumas de ingresos y gastos por mes,
-- tipo, categoría y moneda, calculadas en la base. El cliente recibe pocas
-- filas (una por combinación), nunca las transacciones.
--
-- SECURITY INVOKER: RLS aplica. Scope igual que el resto de la app:
-- p_household_id nulo = personal (household_id nulo y del usuario); si no,
-- las transacciones de ese hogar. Sin borradas ni transferencias.
-- =============================================================================

create or replace function public.dashboard_totals(
  p_household_id uuid,
  p_from date,
  p_to date
)
returns table (
  month date,
  kind text,
  category_key text,
  currency text,
  total_minor bigint,
  tx_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', t.occurred_on)::date as month,
    t.kind,
    t.category_key,
    t.currency,
    sum(t.amount_minor)::bigint as total_minor,
    count(*)::integer as tx_count
  from public.transactions t
  where t.occurred_on between p_from and p_to
    and t.deleted_at is null
    and t.kind in ('expense', 'income')
    and (
      (p_household_id is null and t.household_id is null and t.owner_id = (select auth.uid()))
      or (p_household_id is not null and t.household_id = p_household_id)
    )
  group by 1, 2, 3, 4;
$$;

revoke execute on function public.dashboard_totals(uuid, date, date) from public, anon;
grant execute on function public.dashboard_totals(uuid, date, date) to authenticated;
