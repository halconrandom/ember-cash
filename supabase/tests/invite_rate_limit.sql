-- =============================================================================
-- Límite de accept_invite: 8 intentos en 15 minutos, ahora en rate_limits
-- (0015). La tabla no es legible por authenticated.
--
-- Corre dentro de una transacción con ROLLBACK (`pnpm test:rls`).
-- =============================================================================
begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-4000-c900-00000000000a', 'authenticated', 'authenticated',
   'rate-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c900-00000000000b', 'authenticated', 'authenticated',
   'rate-b@test.local', '{}', '{}');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c900-00000000000a","role":"authenticated"}', true);

do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..8 loop
    r := public.accept_invite('token-que-no-existe');
    if r ->> 'error' is distinct from 'invite_invalid' then
      raise exception 'FALLO: el intento % dio %', i, r;
    end if;
  end loop;

  r := public.accept_invite('otro-token');
  if r ->> 'error' is distinct from 'invite_rate_limited' then
    raise exception 'FALLO: el noveno intento dio %', r;
  end if;

  -- Sin grant, authenticated no lee los intentos (42501).
  begin
    perform 1 from public.rate_limits;
    raise exception 'FALLO: authenticated leyó los intentos';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Otra persona no hereda el límite de la primera.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c900-00000000000b","role":"authenticated"}', true);

do $$
declare
  r jsonb := public.accept_invite('tampoco');
begin
  if r ->> 'error' is distinct from 'invite_invalid' then
    raise exception 'FALLO: B quedó limitado por los intentos de A (%).', r;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.rate_limits
      where user_id = '00000000-0000-4000-c900-00000000000a'
        and action = 'invite_accept') <> 8 then
    raise exception 'FALLO: A no quedó con 8 intentos guardados';
  end if;
end $$;

select 'OK: límite de invitaciones' as resultado;

rollback;
