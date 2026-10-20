-- =============================================================================
-- 0022_dashboard_totals_guard.sql
-- Revisión de dashboard_totals (0021). La consulta dinámica no cambia de
-- resultado para una moneda del catálogo y un rango de fechas válido: sigue
-- siendo el mismo SELECT, con un plan nuevo por llamada (format + EXECUTE).
--
-- Lo que se cierra aquí, antes de armar ese SQL:
--   * p_display_currency se busca en public.currencies. Si no está, se
--     rechaza con 22023 y el EXECUTE no corre. A format() no llega el texto
--     del llamador: llega el code leído del catálogo.
--   * p_from y p_to se castean a date y ese valor (no el argumento crudo) es
--     el que se interpola. En el SQL el literal vuelve a castearse (::date),
--     así que solo puede ser una fecha.
--   * p_household_id ya es uuid; se copia a una variable uuid antes de
--     interpolar. El usuario no es un parámetro: sigue siendo auth.uid().
--
-- Cada valor entra a la consulta con format() y %L (literal citado). No hay
-- concatenación. Sigue siendo security invoker (aplica RLS) con search_path
-- vacío; las tablas van calificadas.
-- =============================================================================

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
  -- Tipos fijados antes de interpolar. Un uuid o una fecha imposibles no
  -- llegan aquí: el cast de la llamada ya falló. El ::date deja explícito
  -- que format() recibe una fecha, no texto del llamador.
  v_household_id uuid := p_household_id;
  v_from date := p_from::date;
  v_to date := p_to::date;
  -- Código del catálogo. Null si el llamador mandó algo que no existe
  -- (incluido un literal con comillas o comentarios de SQL).
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
        t.kind,
        t.category_key,
        t.currency,
        t.amount_minor
      from public.transactions t
      where t.occurred_on between %L::date and %L::date
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
    v_from, v_to,
    v_household_id, v_household_id, v_household_id,
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
