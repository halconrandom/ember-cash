-- =============================================================================
-- Onboarding (fase F1): eventos propios, el paso del wizard y el cupo de la
-- tarjeta.
--
-- events guarda lo que hace cada persona (el wizard y, más adelante, la
-- ayuda). No hay scripts de terceros ni un servicio de analítica: la fila
-- se inserta con el cliente del usuario y RLS. user_id y created_at los pone
-- el disparador, así nadie firma por otra persona ni cambia la hora.
--
-- El disparador zz_rate_limit_write (0015) cuenta estas inserciones como
-- escritura. La app no vuelve a llamar consume_rate_limit para este insert.
--
-- Las métricas (porcentaje que termina, abandono, etc.) están en
-- docs/onboarding/metrics.sql. No hay una vista para authenticated: con RLS
-- cada quien solo ve sus filas, y el porcentaje necesita verlas todas. Esa
-- consulta se corre como dueño de la tabla o con la service role.
-- =============================================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_skipped',
    'onboarding_completed',
    'first_item_created',
    'help_opened'
  )),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.events is
  'Hechos del propio usuario (onboarding y ayuda). Sin analítica externa. No se editan ni se borran.';

create index events_user_name_created_idx
  on public.events (user_id, name, created_at);

alter table public.events enable row level security;

-- Revisa el nombre y las props (sin SQL dinámico) y sella dueño y hora.
-- Corre como el usuario de la sesión: por eso authenticated puede ejecutarla.
create function public.events_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[];
  v_step numeric;
  v_type text;
  v_page text;
begin
  new.user_id := (select auth.uid());
  new.created_at := pg_catalog.now();
  if new.user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if new.props is null or pg_catalog.jsonb_typeof(new.props) <> 'object' then
    raise exception 'invalid_event_props' using errcode = '22023';
  end if;

  -- Cero claves → arreglo vacío (array_agg de ninguna fila es null).
  select coalesce(pg_catalog.array_agg(k order by k), array[]::text[])
    into v_keys
  from pg_catalog.jsonb_object_keys(new.props) as k;

  if new.name in ('onboarding_started', 'onboarding_completed') then
    if v_keys <> array[]::text[] then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
  elsif new.name in ('onboarding_step_completed', 'onboarding_skipped') then
    if v_keys <> array['step']::text[]
      or pg_catalog.jsonb_typeof(new.props -> 'step') <> 'number' then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
    v_step := (new.props ->> 'step')::numeric;
    if v_step <> trunc(v_step) or v_step < 0 or v_step > 4 then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
  elsif new.name = 'first_item_created' then
    if v_keys <> array['type']::text[] then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
    v_type := new.props ->> 'type';
    if v_type is null or v_type not in (
      'account', 'goal', 'debt', 'subscription', 'expense'
    ) then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
  elsif new.name = 'help_opened' then
    if v_keys <> array['page']::text[] then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
    v_page := new.props ->> 'page';
    if v_page is null or v_page not in (
      'dashboard', 'transactions', 'savings', 'debts',
      'subscriptions', 'calendar', 'household', 'settings'
    ) then
      raise exception 'invalid_event_props' using errcode = '22023';
    end if;
  else
    raise exception 'invalid_event_props' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.events_stamp() is
  'Al crear un evento, user_id es auth.uid(), created_at es ahora y las props coinciden con el nombre.';

revoke all on function public.events_stamp() from public, anon;
grant execute on function public.events_stamp() to authenticated;

-- Antes del límite de escrituras (zz_): si esta rechaza, no se gasta un cupo.
create trigger events_stamp
  before insert on public.events
  for each row execute function public.events_stamp();

create trigger zz_rate_limit_write
  before insert or update or delete on public.events
  for each row execute function public.enforce_write_rate_limit();

create policy "events: cada quien ve los suyos"
  on public.events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "events: cada quien crea los suyos"
  on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Sin políticas de update ni delete. El revoke es la otra barrera.
revoke all on table public.events from public, anon, authenticated;
grant select on table public.events to authenticated;
grant insert (name, props) on table public.events to authenticated;

-- -----------------------------------------------------------------------------
-- profiles: en qué paso va el wizard y si ocultó las tarjetas del panel.
-- 0 bienvenida, 1 moneda, 2 cuenta, 3 qué controlar, 4 panel (pista visible).
-- Null cuenta como 0. El grant es por columna: sin esto, authenticated no
-- puede escribir las columnas nuevas (0001 y 0006 recortan el UPDATE).
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column onboarding_step smallint,
  add column dashboard_hint_dismissed_at timestamptz,
  add column first_steps_dismissed_at timestamptz,
  add constraint profiles_onboarding_step_range
    check (onboarding_step is null or onboarding_step between 0 and 4);

comment on column public.profiles.onboarding_step is
  'Paso del wizard. Null o 0 = bienvenida. 4 = ya está en el panel y la pista sigue visible.';

comment on column public.profiles.dashboard_hint_dismissed_at is
  'Cuándo cerró la pista "Este es tu panel". Omitir también la marca, para no mostrarla.';

comment on column public.profiles.first_steps_dismissed_at is
  'Cuándo ocultó la tarjeta Primeros pasos. No vuelve a salir.';

grant update (onboarding_step, dashboard_hint_dismissed_at, first_steps_dismissed_at)
  on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- accounts: cupo y día de pago solo en tarjetas de crédito. El saldo no vive
-- aquí (0003): el wizard lo guarda como transacción con save_transaction.
-- -----------------------------------------------------------------------------
alter table public.accounts
  add column credit_limit_minor bigint,
  add column payment_day smallint,
  add constraint accounts_credit_limit_positive
    check (credit_limit_minor is null or credit_limit_minor > 0),
  add constraint accounts_payment_day_range
    check (payment_day is null or payment_day between 1 and 31),
  add constraint accounts_credit_fields_only_card
    check (
      type = 'credit_card'
      or (credit_limit_minor is null and payment_day is null)
    );

comment on column public.accounts.credit_limit_minor is
  'Cupo de la tarjeta, en unidades menores. Null si no es tarjeta o si todavía no lo dijo.';

comment on column public.accounts.payment_day is
  'Día del mes en que vence el pago de la tarjeta (1 a 31). Null fuera de una tarjeta.';
