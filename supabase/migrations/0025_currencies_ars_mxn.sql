-- =============================================================================
-- 0025_currencies_ars_mxn.sql
-- Fase E4: agrega ARS (peso argentino) y MXN (peso mexicano) al catálogo y
-- generaliza lo que dependía de la lista fija COP/USD/EUR.
--
-- 1. currencies: ARS y MXN, 2 decimales cada una (igual que USD/EUR). COP
--    sigue con 0.
-- 2. profiles.display_currency: el CHECK de 0020 se amplía a las 5 monedas.
-- 3. profiles.enabled_currencies text[]: qué monedas usa cada quien (para
--    mostrar solo esas en los selectores, fases después de esta). Default
--    {COP,USD,EUR} (las 3 que ya existían, para no cambiarle nada a nadie
--    con esta migración). Dos validaciones:
--      - cada código debe existir en currencies: no puede ser un CHECK (no
--        se permiten subconsultas en un CHECK), así que es un trigger
--        BEFORE INSERT/UPDATE, security definer (currencies ya es de
--        lectura pública para authenticated, pero el trigger no depende de
--        que la sesión que guarda tenga ese permiso) con search_path vacío,
--        igual que validate_transaction_splits (0004).
--      - display_currency debe estar entre las habilitadas: sí es un CHECK
--        normal (compara dos columnas de la misma fila, sin subconsulta).
--    RLS: ninguna nueva. profiles ya tiene "editar el propio" (0001), por
--    fila; esta columna queda cubierta igual que display_currency o theme.
-- 4. dashboard_totals (0022): ya validaba la moneda contra el catálogo (no
--    una lista fija); lo que sí dependía de 3 monedas fijas era cómo buscaba
--    la tasa de cada fila (un par directo u otro directo al revés). Entre 5
--    monedas no alcanza con guardar todos los cruces (lib/money/convert.ts
--    ya no lo hace: ver 0025 del lado de la app). Esta versión busca, para
--    cada combinación (moneda de origen, fecha) y para la moneda elegida,
--    su tasa contra USD vigente esa fecha (1 si la moneda ya es USD) y
--    convierte triangulando: origen → USD → elegida. Sigue siendo la misma
--    función (search_path vacío, security invoker, literales por %L): el
--    cuerpo cambia, la guarda no.
-- =============================================================================

insert into public.currencies (code, exponent) values ('ARS', 2), ('MXN', 2);

alter table public.profiles
  drop constraint profiles_display_currency_check;

alter table public.profiles
  add constraint profiles_display_currency_check
  check (display_currency in ('COP', 'USD', 'EUR', 'ARS', 'MXN'));

alter table public.profiles
  add column enabled_currencies text[] not null default array['COP', 'USD', 'EUR'];

alter table public.profiles
  add constraint profiles_display_in_enabled_check
  check (display_currency = any (enabled_currencies));

-- 0001 revocó UPDATE en profiles y lo concede columna por columna (el
-- comentario de esa migración: "RLS no es la única barrera"); cada columna
-- editable nueva se agrega aquí igual que 0006 y 0023.
grant update (enabled_currencies) on public.profiles to authenticated;

create or replace function public.validate_enabled_currencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.enabled_currencies) as code
    where not exists (select 1 from public.currencies c where c.code = code)
  ) then
    raise exception 'unknown_currency_in_enabled_currencies'
      using errcode = '23514',
            detail = format('enabled_currencies trae un código que no está en currencies: %s', new.enabled_currencies);
  end if;
  return new;
end;
$$;

create trigger profiles_enabled_currencies_known
  before insert or update of enabled_currencies on public.profiles
  for each row execute function public.validate_enabled_currencies();

-- -----------------------------------------------------------------------------
-- dashboard_totals: la tasa de cada fila se triangula por USD.
-- -----------------------------------------------------------------------------
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
