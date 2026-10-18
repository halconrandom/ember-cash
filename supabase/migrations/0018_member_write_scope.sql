-- =============================================================================
-- 0018_member_write_scope.sql
-- M-03: dentro de un mismo hogar, un miembro no puede reescribir por la API
-- lo que mueve el balance del otro.
--
--   - transaction_splits: crear, editar o borrar solo si la transacción es
--     tuya (owner_id = auth.uid()). Quien la guarda sigue pudiendo escribir
--     el reparto de los dos: save_transaction y post_occurrence son security
--     invoker, así que el disparador los ve como el dueño de la fila.
--   - goal_contributions: solo el aporte propio (user_id = auth.uid()). Si
--     lleva transaction_id, esa transacción también tiene que ser tuya. Un
--     aporte sin transacción (el de la pantalla de metas) sigue valiendo.
--   - settlements: solo si participas, como quien paga (from_user) o quien
--     recibe (to_user), en la fila vieja y en la nueva.
--
-- No sustituye los candados de 0010. Un gasto con un ex miembro sigue
-- pudiendo cambiar solo categoría y nota: save_transaction vuelve antes de
-- tocar los repartos, y lock_former_member_* sigue rechazando el resto.
-- leave_household y remove_household_member no escriben estas tablas.
--
-- delete_account_data reasigna filas que el usuario no posee (el reparto de
-- B en una transacción de A, una liquidación que pasa al usuario fantasma).
-- Esas escrituras pasan solo con el ajuste ember.account_deletion, el mismo
-- escape de sesión que ya usan los otros candados. Una sesión que no es
-- authenticated (postgres en los tests, service role, cron) no es la API y
-- tampoco se frena aquí. El rol se lee del GUC `role`, no de current_user:
-- las funciones son security definer (leen owner_id aunque RLS oculte la
-- fila) y current_user dentro de ellas sería el dueño de la función.
-- =============================================================================

-- ¿Esta escritura viene de la API de un miembro, o hay que dejarla pasar?
-- true = dejar pasar (borrado de cuenta, o no es la sesión authenticated).
create or replace function public.member_write_bypassed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(current_setting('ember.account_deletion', true), '') = 'on'
      or current_setting('role', true) is distinct from 'authenticated';
$$;

revoke execute on function public.member_write_bypassed() from public, anon, authenticated;

-- Repartos: solo el dueño de la transacción.
create or replace function public.enforce_split_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_owner uuid;
  v_tx uuid;
begin
  if public.member_write_bypassed() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- En un update se miran las dos: no se puede sacar el reparto de una
  -- transacción ajena ni colgarlo de otra que tampoco es tuya.
  if tg_op in ('UPDATE', 'DELETE') then
    select t.owner_id into v_owner from public.transactions t where t.id = old.transaction_id;
    if v_owner is distinct from v_uid then
      raise exception 'not_transaction_owner' using errcode = '42501';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_tx := new.transaction_id;
    if tg_op = 'UPDATE' and v_tx is not distinct from old.transaction_id then
      -- El dueño de la fila vieja ya se comprobó arriba.
      return new;
    end if;
    select t.owner_id into v_owner from public.transactions t where t.id = v_tx;
    if v_owner is distinct from v_uid then
      raise exception 'not_transaction_owner' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_split_owner() from public, anon, authenticated;

-- El nombre va antes de lock_former_member y de zz_rate_limit: si esta
-- rechaza, no se gasta cupo y el otro candado no llega a correr.
create trigger enforce_split_owner
  before insert or update or delete on public.transaction_splits
  for each row execute function public.enforce_split_owner();

-- Aportes: solo el propio. Si apunta a una transacción, tiene que ser tuya.
create or replace function public.enforce_contribution_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_owner uuid;
begin
  if public.member_write_bypassed() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.user_id is distinct from v_uid then
    raise exception 'not_contribution_owner' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.user_id is distinct from v_uid then
      raise exception 'not_contribution_owner' using errcode = '42501';
    end if;
    if new.transaction_id is not null then
      select t.owner_id into v_owner from public.transactions t where t.id = new.transaction_id;
      if v_owner is distinct from v_uid then
        raise exception 'not_transaction_owner' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_contribution_owner() from public, anon, authenticated;

create trigger enforce_contribution_owner
  before insert or update or delete on public.goal_contributions
  for each row execute function public.enforce_contribution_owner();

-- Liquidaciones: solo quien paga o quien recibe.
create or replace function public.enforce_settlement_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if public.member_write_bypassed() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and v_uid is distinct from old.from_user
     and v_uid is distinct from old.to_user then
    raise exception 'not_settlement_party' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and v_uid is distinct from new.from_user
     and v_uid is distinct from new.to_user then
    raise exception 'not_settlement_party' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_settlement_party() from public, anon, authenticated;

create trigger enforce_settlement_party
  before insert or update or delete on public.settlements
  for each row execute function public.enforce_settlement_party();
