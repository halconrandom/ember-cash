-- =============================================================================
-- 0003_finance_model.sql
-- Modelo financiero: monedas, categorías, tasas de cambio, cuentas,
-- transacciones (con repartos), metas, deudas, recurrentes, presupuestos y
-- liquidaciones entre miembros.
--
-- Reglas generales:
-- - Todo importe es `*_minor bigint` en la moneda original de la fila, con su
--   columna `currency` (unidades menores: COP exponente 0, USD exponente 2).
-- - Filas con owner_id + household_id: household_id nulo = personal (solo la
--   ve y edita su owner); no nulo = compartida (la ve y edita cualquier
--   miembro del household).
-- - owner_id (y created_by en settlements) no se puede cambiar después de
--   crear la fila (trigger forbid_column_change).
-- - Las referencias a otras filas (cuenta, meta, deuda...) deben ser visibles
--   para quien escribe (trigger check_visible_refs), para que nadie cuelgue
--   datos de filas ajenas aprovechando que las FK no aplican RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- ¿El usuario `uid` es miembro de `hid`? Solo responde si quien pregunta
-- también es miembro (si no, devuelve false), para no filtrar membresías.
create or replace function public.household_has_member(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_household_member(hid)
    and exists (
      select 1 from public.household_members m
      where m.household_id = hid and m.user_id = uid
    );
$$;

-- Trigger genérico: impide cambiar la columna indicada en TG_ARGV[0].
create or replace function public.forbid_column_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) -> tg_argv[0] is distinct from to_jsonb(old) -> tg_argv[0] then
    raise exception '%_immutable', tg_argv[0] using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Trigger genérico: cada argumento es "columna:tabla". Si la columna cambió
-- (o es un insert) y no es nula, la fila referenciada debe ser visible para
-- el usuario actual. La función es SECURITY INVOKER, así que la consulta
-- respeta RLS. Con service role (sin RLS) siempre pasa.
create or replace function public.check_visible_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  spec text;
  col text;
  tbl text;
  new_val text;
  visible boolean;
begin
  foreach spec in array tg_argv loop
    col := split_part(spec, ':', 1);
    tbl := split_part(spec, ':', 2);
    new_val := to_jsonb(new) ->> col;
    if new_val is not null
       and (tg_op = 'INSERT' or new_val is distinct from (to_jsonb(old) ->> col)) then
      execute format('select exists (select 1 from public.%I where id = $1::uuid)', tbl)
        into visible
        using new_val;
      if not visible then
        raise exception '%_not_accessible', col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

-- Trigger: mantiene updated_at al día.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Catálogos: currencies, categories (fijos, sembrados, solo lectura)
-- -----------------------------------------------------------------------------
create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  -- Decimales de la unidad menor: 0 para COP, 2 para USD.
  exponent smallint not null check (exponent between 0 and 4)
);

insert into public.currencies (code, exponent) values ('COP', 0), ('USD', 2);

create table public.categories (
  key text primary key,
  kind text not null check (kind in ('expense', 'income')),
  sort smallint not null,
  -- Permite FK compuestas (category_key, kind) para que un gasto no use una
  -- categoría de ingreso y viceversa.
  unique (key, kind)
);

insert into public.categories (key, kind, sort) values
  ('housing', 'expense', 10),
  ('food', 'expense', 20),
  ('transport', 'expense', 30),
  ('subscriptions', 'expense', 40),
  ('health', 'expense', 50),
  ('leisure', 'expense', 60),
  ('other', 'expense', 70),
  ('salary', 'income', 10),
  ('other_income', 'income', 20);

-- -----------------------------------------------------------------------------
-- exchange_rates: 1 base = rate quote, con fecha. Escritura solo service role.
-- -----------------------------------------------------------------------------
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null references public.currencies (code),
  quote text not null references public.currencies (code),
  rate numeric(24, 10) not null check (rate > 0),
  as_of date not null,
  fetched_at timestamptz not null default now(),
  source text not null,
  check (base <> quote),
  unique (base, quote, as_of, source)
);

create index exchange_rates_pair_as_of_idx on public.exchange_rates (base, quote, as_of desc);

-- -----------------------------------------------------------------------------
-- accounts (sin saldos: se calculan a partir de las transacciones)
-- -----------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  type text not null check (type in ('checking', 'savings', 'credit_card', 'cash', 'other')),
  currency text not null references public.currencies (code),
  archived_at timestamptz
);

create index accounts_owner_id_idx on public.accounts (owner_id);
create index accounts_household_id_idx on public.accounts (household_id);

-- -----------------------------------------------------------------------------
-- goals (metas de ahorro)
-- -----------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  icon_key text,
  target_minor bigint not null check (target_minor > 0),
  currency text not null references public.currencies (code),
  target_date date,
  monthly_contribution_minor bigint check (monthly_contribution_minor >= 0),
  started_on date not null default current_date,
  archived_at timestamptz
);

create index goals_owner_id_idx on public.goals (owner_id);
create index goals_household_id_idx on public.goals (household_id);

-- -----------------------------------------------------------------------------
-- debts (siempre personales: no tienen household_id)
-- -----------------------------------------------------------------------------
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  subtitle text check (char_length(subtitle) <= 120),
  icon_key text,
  currency text not null references public.currencies (code),
  original_principal_minor bigint not null check (original_principal_minor > 0),
  -- Tasa en puntos básicos: 2450 = 24,50 %.
  apr_bps integer not null check (apr_bps >= 0),
  -- EA = efectiva anual; nominal = nominal anual.
  apr_kind text not null check (apr_kind in ('EA', 'nominal')),
  min_payment_minor bigint not null default 0 check (min_payment_minor >= 0),
  due_day smallint check (due_day between 1 and 31),
  started_on date not null default current_date,
  closed_at timestamptz,
  deleted_at timestamptz
);

create index debts_owner_id_idx on public.debts (owner_id);

-- -----------------------------------------------------------------------------
-- recurring_items (suscripciones, facturas, ingresos y pagos de deuda fijos)
-- -----------------------------------------------------------------------------
create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in ('subscription', 'bill', 'income', 'debt_payment')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  icon_key text,
  category_key text references public.categories (key),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  account_id uuid references public.accounts (id) on delete set null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- Cada cuántas unidades de `frequency` se repite (1 = cada mes, 3 = trimestral).
  "interval" smallint not null default 1 check ("interval" between 1 and 52),
  anchor_date date not null,
  ends_on date,
  auto_post boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  debt_id uuid references public.debts (id) on delete set null,
  check (ends_on is null or ends_on >= anchor_date)
);

create index recurring_items_owner_id_idx on public.recurring_items (owner_id);
create index recurring_items_household_id_idx on public.recurring_items (household_id);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  category_key text,
  description text not null check (char_length(trim(description)) between 1 and 200),
  note text check (char_length(note) <= 2000),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  occurred_on date not null,
  -- Quién pagó (en compartidas, un miembro del household).
  paid_by uuid references auth.users (id) on delete set null,
  transfer_to_account_id uuid references public.accounts (id) on delete restrict,
  goal_id uuid references public.goals (id) on delete set null,
  debt_id uuid references public.debts (id) on delete set null,
  recurring_item_id uuid references public.recurring_items (id) on delete set null,
  -- Borrado suave para el toast con Undo.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La categoría debe ser del mismo tipo que la transacción (gasto/ingreso).
  -- En transferencias category_key es nulo y la FK no aplica.
  foreign key (category_key, kind) references public.categories (key, kind),
  -- Gastos e ingresos llevan categoría y no cuenta destino; las
  -- transferencias llevan cuenta destino distinta y no categoría.
  constraint transactions_kind_shape check (
    (kind in ('expense', 'income') and category_key is not null and transfer_to_account_id is null)
    or (kind = 'transfer' and category_key is null and transfer_to_account_id is not null
        and transfer_to_account_id <> account_id)
  )
);

create index transactions_owner_occurred_idx on public.transactions (owner_id, occurred_on);
create index transactions_household_occurred_idx on public.transactions (household_id, occurred_on);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_goal_id_idx on public.transactions (goal_id) where goal_id is not null;
create index transactions_debt_id_idx on public.transactions (debt_id) where debt_id is not null;
create index transactions_recurring_item_id_idx on public.transactions (recurring_item_id)
  where recurring_item_id is not null;

-- -----------------------------------------------------------------------------
-- transaction_splits: cuánto le toca a cada miembro de una transacción.
-- En v1 el reparto es equitativo; la tabla admite cualquier reparto después.
-- -----------------------------------------------------------------------------
create table public.transaction_splits (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_minor bigint not null check (share_minor >= 0),
  primary key (transaction_id, user_id)
);

create index transaction_splits_user_id_idx on public.transaction_splits (user_id);

-- -----------------------------------------------------------------------------
-- goal_contributions
-- -----------------------------------------------------------------------------
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  contributed_on date not null default current_date,
  transaction_id uuid references public.transactions (id) on delete set null
);

create index goal_contributions_goal_id_idx on public.goal_contributions (goal_id);

-- -----------------------------------------------------------------------------
-- debt_payments
-- -----------------------------------------------------------------------------
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts (id) on delete cascade,
  paid_on date not null,
  amount_minor bigint not null check (amount_minor > 0),
  interest_minor bigint not null default 0 check (interest_minor >= 0),
  principal_minor bigint not null default 0 check (principal_minor >= 0),
  transaction_id uuid references public.transactions (id) on delete set null
);

create index debt_payments_debt_id_idx on public.debt_payments (debt_id, paid_on);

-- -----------------------------------------------------------------------------
-- recurring_occurrences: cada vencimiento concreto de un recurrente.
-- -----------------------------------------------------------------------------
create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_item_id uuid not null references public.recurring_items (id) on delete cascade,
  due_on date not null,
  amount_override_minor bigint check (amount_override_minor > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'skipped')),
  transaction_id uuid references public.transactions (id) on delete set null,
  -- Fecha original si el vencimiento se movió.
  rescheduled_from date,
  unique (recurring_item_id, due_on)
);

create index recurring_occurrences_due_on_idx on public.recurring_occurrences (due_on);

-- -----------------------------------------------------------------------------
-- budgets: límite mensual por categoría de gasto.
-- -----------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  category_key text not null references public.categories (key),
  limit_minor bigint not null check (limit_minor > 0),
  currency text not null references public.currencies (code)
);

-- Un presupuesto por categoría: uno personal por owner y uno por household.
create unique index budgets_personal_category_uniq on public.budgets (owner_id, category_key)
  where household_id is null;
create unique index budgets_household_category_uniq on public.budgets (household_id, category_key)
  where household_id is not null;

-- -----------------------------------------------------------------------------
-- settlements: liquidación de saldo entre dos miembros de un household.
-- -----------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  settled_on date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check (from_user <> to_user)
);

create index settlements_household_id_idx on public.settlements (household_id, settled_on);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger accounts_owner_immutable before update on public.accounts
  for each row execute function public.forbid_column_change('owner_id');
create trigger goals_owner_immutable before update on public.goals
  for each row execute function public.forbid_column_change('owner_id');
create trigger debts_owner_immutable before update on public.debts
  for each row execute function public.forbid_column_change('owner_id');
create trigger recurring_items_owner_immutable before update on public.recurring_items
  for each row execute function public.forbid_column_change('owner_id');
create trigger transactions_owner_immutable before update on public.transactions
  for each row execute function public.forbid_column_change('owner_id');
create trigger budgets_owner_immutable before update on public.budgets
  for each row execute function public.forbid_column_change('owner_id');
create trigger settlements_created_by_immutable before update on public.settlements
  for each row execute function public.forbid_column_change('created_by');

create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger transactions_visible_refs before insert or update on public.transactions
  for each row execute function public.check_visible_refs(
    'account_id:accounts', 'transfer_to_account_id:accounts', 'goal_id:goals',
    'debt_id:debts', 'recurring_item_id:recurring_items');
create trigger recurring_items_visible_refs before insert or update on public.recurring_items
  for each row execute function public.check_visible_refs('account_id:accounts', 'debt_id:debts');
create trigger goal_contributions_visible_refs before insert or update on public.goal_contributions
  for each row execute function public.check_visible_refs('transaction_id:transactions');
create trigger debt_payments_visible_refs before insert or update on public.debt_payments
  for each row execute function public.check_visible_refs('transaction_id:transactions');
create trigger recurring_occurrences_visible_refs before insert or update on public.recurring_occurrences
  for each row execute function public.check_visible_refs('transaction_id:transactions');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.currencies enable row level security;
alter table public.categories enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.accounts enable row level security;
alter table public.goals enable row level security;
alter table public.debts enable row level security;
alter table public.recurring_items enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.debt_payments enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.budgets enable row level security;
alter table public.settlements enable row level security;

-- Catálogos y tasas: lectura para cualquier usuario autenticado.
create policy "currencies: lectura" on public.currencies
  for select to authenticated using (true);
create policy "categories: lectura" on public.categories
  for select to authenticated using (true);
create policy "exchange_rates: lectura" on public.exchange_rates
  for select to authenticated using (true);

-- Tablas personales o compartidas (owner_id + household_id). Misma regla en
-- todas, creada con un bloque para no repetirla seis veces:
--   ver/editar/borrar: personal y mía, o compartida en un household mío.
--   insertar: además, owner_id debe ser el usuario actual.
--   WITH CHECK del update: la fila resultante debe seguir cumpliendo la
--   regla, así que no se puede mover a un household ajeno ni volver
--   personal una fila de otro.
do $$
declare
  t text;
  rule text := '(household_id is null and owner_id = (select auth.uid()))'
            || ' or (household_id is not null and (select public.is_household_member(household_id)))';
begin
  foreach t in array array['accounts', 'goals', 'recurring_items', 'transactions', 'budgets'] loop
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      t || ': ver', t, rule);
    execute format('create policy %I on public.%I for insert to authenticated with check ((%s) and owner_id = (select auth.uid()))',
      t || ': crear', t, rule);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || ': editar', t, rule, rule);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
      t || ': borrar', t, rule);
  end loop;
end $$;

-- En transacciones, paid_by debe ser el owner (personal) o un miembro del
-- household (compartida). Política restrictiva: se suma a las anteriores.
create policy "transactions: paid_by válido" on public.transactions
  as restrictive for all to authenticated
  using (true)
  with check (
    paid_by is null
    or (household_id is null and paid_by = owner_id)
    or (household_id is not null and public.household_has_member(household_id, paid_by))
  );

-- debts: siempre personales.
create policy "debts: ver las mías" on public.debts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "debts: crear" on public.debts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "debts: editar las mías" on public.debts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "debts: borrar las mías" on public.debts
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Tablas hijas: heredan el acceso de la fila padre. La subconsulta corre con
-- RLS, así que "existe" significa "el padre es visible para mí".
create policy "transaction_splits: acceso por transacción" on public.transaction_splits
  for all to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id))
  with check (exists (
    select 1 from public.transactions t
    where t.id = transaction_id
      and ((t.household_id is null and user_id = t.owner_id)
           or (t.household_id is not null and public.household_has_member(t.household_id, user_id)))
  ));

create policy "goal_contributions: acceso por meta" on public.goal_contributions
  for all to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id))
  with check (exists (
    select 1 from public.goals g
    where g.id = goal_id
      and ((g.household_id is null and user_id = g.owner_id)
           or (g.household_id is not null and public.household_has_member(g.household_id, user_id)))
  ));

create policy "debt_payments: acceso por deuda" on public.debt_payments
  for all to authenticated
  using (exists (select 1 from public.debts d where d.id = debt_id))
  with check (exists (select 1 from public.debts d where d.id = debt_id));

create policy "recurring_occurrences: acceso por recurrente" on public.recurring_occurrences
  for all to authenticated
  using (exists (select 1 from public.recurring_items r where r.id = recurring_item_id))
  with check (exists (select 1 from public.recurring_items r where r.id = recurring_item_id));

-- settlements: solo miembros del household, entre dos miembros del household.
create policy "settlements: ver" on public.settlements
  for select to authenticated using ((select public.is_household_member(household_id)));
create policy "settlements: crear" on public.settlements
  for insert to authenticated with check (
    (select public.is_household_member(household_id))
    and created_by = (select auth.uid())
    and public.household_has_member(household_id, from_user)
    and public.household_has_member(household_id, to_user)
  );
create policy "settlements: editar" on public.settlements
  for update to authenticated
  using ((select public.is_household_member(household_id)))
  with check (
    (select public.is_household_member(household_id))
    and public.household_has_member(household_id, from_user)
    and public.household_has_member(household_id, to_user)
  );
create policy "settlements: borrar" on public.settlements
  for delete to authenticated using ((select public.is_household_member(household_id)));

-- -----------------------------------------------------------------------------
-- Privilegios
-- -----------------------------------------------------------------------------
-- anon no toca nada del modelo financiero.
revoke all on public.currencies, public.categories, public.exchange_rates, public.accounts,
  public.goals, public.debts, public.recurring_items, public.transactions,
  public.transaction_splits, public.goal_contributions, public.debt_payments,
  public.recurring_occurrences, public.budgets, public.settlements
from anon;

-- Catálogos y tasas: solo lectura para authenticated (service role escribe).
revoke insert, update, delete on public.currencies, public.categories, public.exchange_rates
from authenticated;

-- TRUNCATE se salta RLS; REFERENCES y TRIGGER no hacen falta. Supabase los
-- concede por defecto, así que se quitan también en las tablas de 0001.
revoke truncate, references, trigger on
  public.currencies, public.categories, public.exchange_rates, public.accounts,
  public.goals, public.debts, public.recurring_items, public.transactions,
  public.transaction_splits, public.goal_contributions, public.debt_payments,
  public.recurring_occurrences, public.budgets, public.settlements,
  public.profiles, public.households, public.household_members, public.household_invites
from authenticated;

-- Funciones: household_has_member la usan las políticas; los triggers no se
-- llaman por RPC.
revoke execute on function
  public.household_has_member(uuid, uuid),
  public.forbid_column_change(),
  public.check_visible_refs(),
  public.set_updated_at()
from public, anon;
revoke execute on function
  public.forbid_column_change(),
  public.check_visible_refs(),
  public.set_updated_at()
from authenticated;
grant execute on function public.household_has_member(uuid, uuid) to authenticated;
