-- =============================================================================
-- 0021_dashboard_display_currency.sql
-- Fase E3: dashboard_totals (0012) devuelve los totales ya convertidos a la
-- moneda de visualización del perfil (p_display_currency), con la tasa de
-- exchange_rates vigente en la fecha de CADA movimiento (no la de hoy): se
-- calcula por fila antes de agrupar, porque dos filas del mismo mes pueden
-- tener fechas (y por tanto tasas) distintas.
--
-- Reemplaza la función de 0012 (firma distinta: agrega p_display_currency).
-- Sigue agregando en la base; el cliente solo recibe una fila por
-- combinación de mes/tipo/categoría/moneda de origen, nunca transacciones.
--
-- Columnas nuevas:
--   total_minor      suma en la moneda de ORIGEN (como antes; alimenta el
--                     desglose por moneda del sheet de MoneyAmount "total").
--   converted_minor   total_minor convertido a p_display_currency. Si la fila
--                     ya está en esa moneda, es igual a total_minor. Las filas
--                     sin tasa para su fecha (o sin ninguna tasa para el par)
--                     no entran en esta suma.
--   uncovered_minor   la parte de total_minor (en la moneda de origen) que no
--                     se pudo convertir: nunca se inventa una tasa. 0 si la
--                     moneda ya es la elegida o si todas las filas tuvieron
--                     tasa. La UI la muestra aparte ("Tasa no disponible").
--
-- Redondeo: igual que convert() de lib/money/convert.ts (round() de Postgres
-- en numeric redondea las mitades lejos de cero, igual que divRound).
--
-- Por qué PL/pgSQL con EXECUTE de SQL dinámico (y no, como 0012, un simple
-- LANGUAGE SQL): con parámetros, Postgres no puede saber de antemano cuántas
-- filas y de qué moneda va a filtrar p_from/p_to/p_display_currency, así que
-- una función LANGUAGE SQL (que no se puede "inlinear" por tener CTIs) queda
-- con un plan genérico una sola vez y lo reutiliza siempre: con el dataset
-- sintético de 200.000 filas de 0012 ese plan genérico elegía recorrer la
-- tasa fila por fila y tardaba minutos. El EXECUTE de SQL armado con los
-- valores ya puestos (format %L, sin riesgo de inyección: son literales
-- tipados) fuerza un plan nuevo en cada llamada, a la medida de ese rango de
-- fechas y esa moneda.
--
-- Esa tasa se busca una sola vez por cada combinación (moneda de origen,
-- fecha) distinta del rango —normalmente unas pocas decenas o cientos, nunca
-- una por fila— y se cruza con las transacciones por igualdad (hash join).
-- Con el mismo dataset de 200.000 filas (y ANALYZE al día, como en
-- producción): ~310-330 ms (antes 37 ms sin convertir monedas). No hizo
-- falta un índice nuevo: exchange_rates_pair_as_of_idx (0003) ya cubre esa
-- búsqueda por (base, quote, as_of desc).
-- =============================================================================

drop function if exists public.dashboard_totals(uuid, date, date);

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
begin
  return query execute format(
    $q$
    with base as (
      select
        t.occurred_on,
        t.kind,
        t.category_key,
        t.currency,
        t.amount_minor
      from public.transactions t
      where t.occurred_on between %L and %L
        and t.deleted_at is null
        and t.kind in ('expense', 'income')
        and (
          (%L::uuid is null and t.household_id is null and t.owner_id = (select auth.uid()))
          or (%L::uuid is not null and t.household_id = %L::uuid)
        )
    ),
    -- Escala (unidades menores por unidad) de la moneda elegida: una sola vez.
    display_scale as (
      select (10::numeric) ^ c.exponent as scale
      from public.currencies c
      where c.code = %L
    ),
    -- Combinaciones (moneda de origen, fecha) distintas que de verdad hace
    -- falta convertir: unas pocas decenas o cientos, nunca una por fila.
    foreign_days as (
      select distinct b.currency, b.occurred_on
      from base b
      where b.currency <> %L
    ),
    -- La tasa vigente de cada combinación, buscada una sola vez cada una.
    day_rates as (
      select
        fd.currency,
        fd.occurred_on,
        (10::numeric) ^ fc.exponent as from_scale,
        direct.rate as direct_rate,
        reverse.rate as reverse_rate
      from foreign_days fd
      join public.currencies fc on fc.code = fd.currency
      -- base = la moneda de origen, quote = la elegida (p. ej. USD/COP con elegida COP).
      left join lateral (
        select er.rate
        from public.exchange_rates er
        where er.base = fd.currency
          and er.quote = %L
          and er.as_of <= fd.occurred_on
        order by er.as_of desc
        limit 1
      ) direct on true
      -- base = la elegida, quote = la de origen (p. ej. EUR/USD con elegida USD).
      left join lateral (
        select er.rate
        from public.exchange_rates er
        where er.base = %L
          and er.quote = fd.currency
          and er.as_of <= fd.occurred_on
        order by er.as_of desc
        limit 1
      ) reverse on true
    ),
    -- Se cruza con las transacciones por igualdad (hash join), no por fila.
    priced as (
      select
        b.occurred_on,
        b.kind,
        b.category_key,
        b.currency,
        b.amount_minor,
        dr.from_scale,
        dr.direct_rate,
        dr.reverse_rate
      from base b
      left join day_rates dr on dr.currency = b.currency and dr.occurred_on = b.occurred_on
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
          when p.direct_rate is not null then
            round(p.amount_minor::numeric * p.direct_rate * ds.scale / p.from_scale)
          when p.reverse_rate is not null then
            round(p.amount_minor::numeric * ds.scale / (p.reverse_rate * p.from_scale))
          else 0
        end
      )::bigint as converted_minor,
      sum(
        case
          when p.currency <> %L and p.direct_rate is null and p.reverse_rate is null
            then p.amount_minor
          else 0
        end
      )::bigint as uncovered_minor
    from priced p, display_scale ds
    group by 1, 2, 3, 4
    $q$,
    p_from, p_to,
    p_household_id, p_household_id, p_household_id,
    p_display_currency,
    p_display_currency,
    p_display_currency,
    p_display_currency,
    p_display_currency,
    p_display_currency
  );
end;
$$;

revoke execute on function public.dashboard_totals(uuid, date, date, text) from public, anon;
grant execute on function public.dashboard_totals(uuid, date, date, text) to authenticated;
