-- =============================================================================
-- 0010_household_leave.sql
-- Salir del hogar o quitar a un miembro (fase 10.1).
--
-- Reglas:
-- 1. Solo con las RPC leave_household (la persona sale) y
--    remove_household_member (quien administra quita a otra persona).
-- 2. Las dos exigen que el neto de esa persona sea 0 en todas las monedas
--    (mismo cálculo que lib/household/balance.ts): balance_not_settled.
-- 3. Quien administra no puede salir: owner_cannot_leave.
-- 4. El historial queda tal cual (gastos, repartos, liquidaciones y aportes
--    conservan su usuario). Se guarda una fila en household_departures con
--    el nombre, para mostrarlo como "ex miembro".
-- 5. Lo que creó en el hogar se queda en el hogar. A sus recurrentes
--    compartidos se les apaga auto_post y el hogar muestra un aviso.
-- 6. Un gasto compartido con reparto (o pagador) de un ex miembro queda
--    bloqueado: monto, moneda, fecha, pagador, cuenta, tipo, descripción,
--    hogar, borrado y reparto. Solo se pueden editar la categoría y la nota.
--    Una liquidación con un ex miembro no se edita ni se borra.
-- 7. post_occurrence respeta joined_at igual que save_transaction (0009).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Salidas del hogar
-- -----------------------------------------------------------------------------
create table public.household_departures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Sin FK: el id se conserva aunque la cuenta se borre después.
  user_id uuid not null,
  display_name text,
  -- Quién la quitó (nulo si salió por su cuenta).
  removed_by uuid,
  left_at timestamptz not null default now(),
  -- Nombres de los recurrentes a los que se les apagó el cobro automático.
  auto_post_disabled text[] not null default '{}',
  -- Cuando alguien del hogar cierra el aviso.
  notice_dismissed_at timestamptz
);

create index household_departures_household_idx on public.household_departures (household_id, left_at);

alter table public.household_departures enable row level security;

create policy "household_departures: ver" on public.household_departures
  for select to authenticated using ((select public.is_household_member(household_id)));
create policy "household_departures: cerrar aviso" on public.household_departures
  for update to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));

-- Solo se escribe desde las RPC; los miembros solo pueden cerrar el aviso.
revoke all on public.household_departures from anon, authenticated;
grant select on public.household_departures to authenticated;
grant update (notice_dismissed_at) on public.household_departures to authenticated;

-- -----------------------------------------------------------------------------
-- Balance de un miembro (mismo cálculo que lib/household/balance.ts)
-- -----------------------------------------------------------------------------
-- Por moneda: + lo que pagó, − su parte, + lo que liquidó (from), − lo que
-- recibió (to). Un ingreso compartido cuenta al revés. Las transacciones
-- borradas y las transferencias no cuentan.
create or replace function public.household_member_settled(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with tx as (
    select t.id, t.amount_minor, t.currency, coalesce(t.paid_by, t.owner_id) as payer,
           case when t.kind = 'income' then -1 else 1 end as sgn
    from public.transactions t
    where t.household_id = hid and t.deleted_at is null and t.kind in ('expense', 'income')
  ), nets as (
    select currency, sgn * amount_minor as v from tx where payer = uid
    union all
    select tx.currency, -tx.sgn * s.share_minor
    from tx join public.transaction_splits s on s.transaction_id = tx.id
    where s.user_id = uid
    union all
    select currency, amount_minor from public.settlements where household_id = hid and from_user = uid
    union all
    select currency, -amount_minor from public.settlements where household_id = hid and to_user = uid
  )
  select not exists (select 1 from nets group by currency having sum(v) <> 0);
$$;

revoke execute on function public.household_member_settled(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Salir / quitar
-- -----------------------------------------------------------------------------
-- Núcleo común (interno): valida el saldo, apaga auto_post, guarda la salida
-- y borra la membresía.
create or replace function public.household_detach_member(hid uuid, uid uuid, removed_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
begin
  if not exists (select 1 from public.household_members where household_id = hid and user_id = uid) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if not public.household_member_settled(hid, uid) then
    raise exception 'balance_not_settled' using errcode = 'P0001';
  end if;

  -- Sus recurrentes compartidos dejan de registrarse solos: el cron los
  -- pondría a su nombre aunque ya no sea miembro.
  with off as (
    update public.recurring_items set auto_post = false
    where household_id = hid and owner_id = uid and auto_post
    returning name
  )
  select coalesce(array_agg(name order by name), '{}') into v_names from off;

  insert into public.household_departures (household_id, user_id, display_name, removed_by, auto_post_disabled)
  select hid, uid, p.display_name, removed_by, v_names
  from (select 1) x left join public.profiles p on p.id = uid;

  delete from public.household_members where household_id = hid and user_id = uid;
end;
$$;

revoke execute on function public.household_detach_member(uuid, uuid, uuid) from public, anon, authenticated;

-- La persona sale del hogar.
create or replace function public.leave_household(hid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.is_household_owner(hid) then
    raise exception 'owner_cannot_leave' using errcode = 'P0001';
  end if;
  perform public.household_detach_member(hid, v_uid, null);
end;
$$;

-- Quien administra quita a otra persona.
create or replace function public.remove_household_member(hid uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_household_owner(hid) then
    raise exception 'only_owner_can_remove' using errcode = '42501';
  end if;
  if uid = v_uid then
    raise exception 'owner_cannot_leave' using errcode = 'P0001';
  end if;
  perform public.household_detach_member(hid, uid, v_uid);
end;
$$;

revoke execute on function public.leave_household(uuid) from public, anon;
revoke execute on function public.remove_household_member(uuid, uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Bloqueo de lo que involucra a un ex miembro
-- -----------------------------------------------------------------------------
-- ¿La transacción compartida tiene un reparto o un pagador que ya no es
-- miembro? Si el hogar ya no existe (borrado en cascada) no hay bloqueo.
create or replace function public.transaction_has_former_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.transactions t
    join public.households h on h.id = t.household_id
    where t.id = tid
      and (
        exists (
          select 1 from public.transaction_splits s
          where s.transaction_id = t.id
            and not exists (select 1 from public.household_members hm
                            where hm.household_id = t.household_id and hm.user_id = s.user_id)
        )
        or (t.paid_by is not null
            and not exists (select 1 from public.household_members hm
                            where hm.household_id = t.household_id and hm.user_id = t.paid_by))
      )
  );
$$;

revoke execute on function public.transaction_has_former_member(uuid) from public, anon;
grant execute on function public.transaction_has_former_member(uuid) to authenticated;

-- Transacciones: solo categoría y nota (y updated_at) cambian si está
-- bloqueada. Borrar una ya borrada (purga) sí se permite: no cuenta en el
-- balance.
create or replace function public.lock_former_member_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.household_id is null or not public.transaction_has_former_member(old.id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.deleted_at is not null then
      return old;
    end if;
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  if (new.amount_minor, new.currency, new.occurred_on, new.paid_by, new.account_id, new.kind,
      new.description, new.household_id, new.deleted_at, new.transfer_to_account_id)
     is distinct from
     (old.amount_minor, old.currency, old.occurred_on, old.paid_by, old.account_id, old.kind,
      old.description, old.household_id, old.deleted_at, old.transfer_to_account_id) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_former_member_transaction() from public, anon, authenticated;

create trigger transactions_former_member_lock
  before update or delete on public.transactions
  for each row execute function public.lock_former_member_transaction();

-- Repartos de una transacción bloqueada: no se tocan. Si la transacción ya
-- no existe (borrado en cascada), la función devuelve false.
create or replace function public.lock_former_member_splits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.transaction_has_former_member(coalesce(new.transaction_id, old.transaction_id)) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.lock_former_member_splits() from public, anon, authenticated;

create trigger transaction_splits_former_member_lock
  before insert or update or delete on public.transaction_splits
  for each row execute function public.lock_former_member_splits();

-- Liquidaciones con un ex miembro: no se editan ni se borran.
create or replace function public.lock_former_member_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.households where id = old.household_id)
     and (not public.household_has_member(old.household_id, old.from_user)
          or not public.household_has_member(old.household_id, old.to_user)) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.lock_former_member_settlement() from public, anon, authenticated;

create trigger settlements_former_member_lock
  before update or delete on public.settlements
  for each row execute function public.lock_former_member_settlement();

-- -----------------------------------------------------------------------------
-- save_transaction: si la transacción está bloqueada, el UPDATE solo puede
-- cambiar categoría y nota (el trigger rechaza lo demás) y el reparto no se
-- rehace.
-- -----------------------------------------------------------------------------
create or replace function public.save_transaction(
  p_id uuid,
  p_household_id uuid,
  p_account_id uuid,
  p_kind text,
  p_category_key text,
  p_description text,
  p_note text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_paid_by uuid,
  p_transfer_to_account_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_members integer;
  v_locked boolean := false;
begin
  if v_id is null then
    insert into public.transactions (
      household_id, account_id, kind, category_key, description, note,
      amount_minor, currency, occurred_on, paid_by, transfer_to_account_id
    ) values (
      p_household_id, p_account_id, p_kind, p_category_key, p_description, p_note,
      p_amount_minor, p_currency, p_occurred_on, p_paid_by, p_transfer_to_account_id
    )
    returning id into v_id;
  else
    v_locked := public.transaction_has_former_member(v_id);
    update public.transactions set
      household_id = p_household_id,
      account_id = p_account_id,
      kind = p_kind,
      category_key = p_category_key,
      description = p_description,
      note = p_note,
      amount_minor = p_amount_minor,
      currency = p_currency,
      occurred_on = p_occurred_on,
      paid_by = p_paid_by,
      transfer_to_account_id = p_transfer_to_account_id
    where id = v_id;
    if not found then
      raise exception 'transaction_not_found' using errcode = 'P0002';
    end if;
    -- Bloqueada: categoría y nota ya se guardaron; el reparto no cambia.
    if v_locked then
      return v_id;
    end if;
  end if;

  delete from public.transaction_splits where transaction_id = v_id;

  if p_household_id is not null and p_kind <> 'transfer' then
    -- Miembros que ya lo eran en la fecha del gasto.
    insert into public.transaction_splits (transaction_id, user_id, share_minor)
    select
      v_id,
      m.user_id,
      p_amount_minor / m.n + case when m.rn <= p_amount_minor % m.n then 1 else 0 end
    from (
      select
        hm.user_id,
        row_number() over (order by hm.joined_at, hm.user_id) as rn,
        count(*) over () as n
      from public.household_members hm
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = p_household_id
        and (hm.joined_at at time zone coalesce(p.timezone, 'America/Bogota'))::date <= p_occurred_on
    ) m;
    get diagnostics v_members = row_count;

    -- Nadie era miembro en esa fecha: el gasto es todo del pagador.
    if v_members = 0 then
      insert into public.transaction_splits (transaction_id, user_id, share_minor)
      values (v_id, coalesce(p_paid_by, (select auth.uid())), p_amount_minor);
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_transaction(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid
) from public, anon;
grant execute on function public.save_transaction(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid
) to authenticated;

-- -----------------------------------------------------------------------------
-- post_occurrence: reparte como save_transaction (joined_at ≤ fecha del
-- vencimiento; si nadie cumple, todo para quien paga). Un pagador que ya no
-- es miembro del hogar se rechaza (payer_not_member).
-- -----------------------------------------------------------------------------
create or replace function public.post_occurrence(
  p_occurrence_id uuid,
  p_account_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_occ public.recurring_occurrences%rowtype;
  v_item public.recurring_items%rowtype;
  v_amount bigint;
  v_kind text;
  v_category text;
  v_owner uuid;
  v_tx uuid;
  v_members integer;
begin
  select * into v_occ
  from public.recurring_occurrences
  where id = p_occurrence_id
  for update;
  if not found then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;

  if v_occ.status = 'skipped' then
    raise exception 'occurrence_skipped' using errcode = 'P0001';
  end if;

  -- Segunda llamada (cron y "Marcar como pagado" a la vez): no duplica.
  if v_occ.status = 'paid' and v_occ.transaction_id is not null then
    return v_occ.transaction_id;
  end if;

  select * into v_item from public.recurring_items where id = v_occ.recurring_item_id;
  if not found then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;

  if p_account_id is null then
    raise exception 'account_required' using errcode = 'P0001';
  end if;

  v_amount := coalesce(v_occ.amount_override_minor, v_item.amount_minor);
  v_owner := coalesce(auth.uid(), v_item.owner_id);

  if v_item.household_id is not null
     and not public.household_has_member(v_item.household_id, v_owner) then
    raise exception 'payer_not_member' using errcode = 'P0001';
  end if;

  if v_item.kind = 'income' then
    v_kind := 'income';
    v_category := coalesce(v_item.category_key, 'other_income');
  else
    v_kind := 'expense';
    v_category := coalesce(
      v_item.category_key,
      case when v_item.kind = 'subscription' then 'subscriptions' else 'other' end
    );
  end if;

  insert into public.transactions (
    owner_id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on, paid_by, recurring_item_id, debt_id
  ) values (
    v_owner, v_item.household_id, p_account_id, v_kind, v_category, v_item.name,
    v_amount, v_item.currency, v_occ.due_on, v_owner, v_item.id, v_item.debt_id
  )
  returning id into v_tx;

  if v_item.household_id is not null then
    -- Miembros que ya lo eran en la fecha del vencimiento.
    insert into public.transaction_splits (transaction_id, user_id, share_minor)
    select
      v_tx,
      m.user_id,
      v_amount / m.n + case when m.rn <= (v_amount % m.n) then 1 else 0 end
    from (
      select
        hm.user_id,
        row_number() over (order by hm.joined_at, hm.user_id) as rn,
        count(*) over () as n
      from public.household_members hm
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = v_item.household_id
        and (hm.joined_at at time zone coalesce(p.timezone, 'America/Bogota'))::date <= v_occ.due_on
    ) m;
    get diagnostics v_members = row_count;

    -- Nadie era miembro en esa fecha: todo para quien paga.
    if v_members = 0 then
      insert into public.transaction_splits (transaction_id, user_id, share_minor)
      values (v_tx, v_owner, v_amount);
    end if;
  end if;

  if v_item.debt_id is not null then
    insert into public.debt_payments (
      debt_id, paid_on, amount_minor, interest_minor, principal_minor, transaction_id
    ) values (
      v_item.debt_id, v_occ.due_on, v_amount, 0, v_amount, v_tx
    );
  end if;

  update public.recurring_occurrences
  set status = 'paid', transaction_id = v_tx
  where id = v_occ.id;

  return v_tx;
end;
$$;

revoke execute on function public.post_occurrence(uuid, uuid) from public, anon;
grant execute on function public.post_occurrence(uuid, uuid) to authenticated, service_role;
