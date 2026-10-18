-- =============================================================================
-- 0014_definer_scope.sql
-- B-07: las dos funciones SECURITY DEFINER que authenticated puede llamar
-- no revelan si un id ajeno existe.
--
-- household_has_member ya exigía ser miembro (0003). Aquí queda explícito
-- auth.uid() y la misma respuesta (false) si el hogar no es del usuario.
-- transaction_has_former_member antes contestaba sobre cualquier transacción:
-- ahora false si no es suya ni de un hogar suyo, igual que si el id no existe.
-- search_path queda fijo en las dos. Las políticas y los triggers las siguen
-- usando: quien sí ve la fila obtiene la respuesta real.
-- =============================================================================

create or replace function public.household_has_member(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Sin sesión, o sin ser miembro de hid: false. No se distingue "no existe"
  -- de "existe y no es tuyo".
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.household_members me
      where me.household_id = hid
        and me.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.household_members m
      where m.household_id = hid
        and m.user_id = uid
    );
$$;

revoke execute on function public.household_has_member(uuid, uuid) from public, anon;
grant execute on function public.household_has_member(uuid, uuid) to authenticated;

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
      and (select auth.uid()) is not null
      -- Dueño de la fila o miembro actual del hogar. Si no, la respuesta es
      -- false, la misma que para un id que no existe.
      and (
        t.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.household_members me
          where me.household_id = t.household_id
            and me.user_id = (select auth.uid())
        )
      )
      and (
        exists (
          select 1
          from public.transaction_splits s
          where s.transaction_id = t.id
            and not exists (
              select 1
              from public.household_members hm
              where hm.household_id = t.household_id
                and hm.user_id = s.user_id
            )
        )
        or (
          t.paid_by is not null
          and not exists (
            select 1
            from public.household_members hm
            where hm.household_id = t.household_id
              and hm.user_id = t.paid_by
          )
        )
      )
  );
$$;

revoke execute on function public.transaction_has_former_member(uuid) from public, anon;
grant execute on function public.transaction_has_former_member(uuid) to authenticated;
