-- =============================================================================
-- Tests de RLS para 0001_auth_households.sql
--
-- Usuarios: A (owner) y B (member) del mismo household; C es ajeno.
-- Todo corre dentro de una transacción que termina en ROLLBACK, así que se
-- puede ejecutar contra el proyecto remoto sin dejar datos:
--   pnpm test:rls
-- Si una prueba falla, el script se detiene con "FALLO: ...". Si todas pasan,
-- la última consulta devuelve "OK".
--
-- Para actuar como un usuario se cambia al rol `authenticated` y se define
-- request.jwt.claims, que es de donde auth.uid() lee el id. Los valores que
-- hay que recordar entre pasos (id del household) se guardan en ajustes
-- `test.*` locales a la transacción.
-- =============================================================================
begin;

-- --- Preparación (como postgres) ---------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated',
   'rls-a@test.local', '{"full_name":"Usuario A"}', '{}'),
  ('00000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated',
   'rls-b@test.local', '{"full_name":"Usuario B"}', '{}'),
  ('00000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated',
   'rls-c@test.local', '{}', '{}');

do $$
begin
  -- El trigger debe haber creado los tres perfiles con sus valores por defecto.
  if (select count(*) from public.profiles
      where id::text like '00000000-0000-4000-a000-00000000000_') <> 3 then
    raise exception 'FALLO: el trigger no creó los perfiles';
  end if;
  if (select display_name from public.profiles
      where id = '00000000-0000-4000-a000-00000000000c') <> 'rls-c' then
    raise exception 'FALLO: display_name por defecto no sale del correo';
  end if;
  if exists (select 1 from public.profiles
             where id = '00000000-0000-4000-a000-00000000000a'
               and (display_currency <> 'COP' or timezone <> 'America/Bogota' or theme <> 'system')) then
    raise exception 'FALLO: valores por defecto del perfil incorrectos';
  end if;
end $$;

-- --- A crea el household y dos invitaciones ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

select set_config('test.hid', public.create_household('Casa de prueba')::text, true);

insert into public.household_invites (household_id, token_hash)
values
  (current_setting('test.hid')::uuid, encode(sha256(convert_to('token-uno', 'UTF8')), 'hex')),
  (current_setting('test.hid')::uuid, encode(sha256(convert_to('token-dos', 'UTF8')), 'hex'));

do $$
begin
  if (select count(*) from public.household_invites) <> 2 then
    raise exception 'FALLO: A (owner) no ve sus invitaciones';
  end if;
  if exists (select 1 from public.household_invites where token_hash like 'token%') then
    raise exception 'FALLO: el token se guardó en claro';
  end if;
  if (select expires_at - created_at from public.household_invites limit 1) <> interval '7 days' then
    raise exception 'FALLO: la invitación no vence a los 7 días';
  end if;
  -- A no puede alargar la vigencia (columna sin privilegio de insert).
  begin
    insert into public.household_invites (household_id, token_hash, expires_at)
    values (current_setting('test.hid')::uuid, repeat('a', 64), now() + interval '1 year');
    raise exception 'FALLO: A pudo fijar expires_at';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --- B acepta la invitación --------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
begin
  if public.accept_invite('token-uno') <> current_setting('test.hid')::uuid then
    raise exception 'FALLO: accept_invite devolvió otro household';
  end if;

  if (select count(*) from public.households) <> 1 then
    raise exception 'FALLO: B no ve el household al que se unió';
  end if;
  if (select count(*) from public.household_members) <> 2 then
    raise exception 'FALLO: B no ve a los dos miembros';
  end if;
  if (select count(*) from public.get_household_members(current_setting('test.hid')::uuid)) <> 2 then
    raise exception 'FALLO: get_household_members no devuelve los dos miembros para B';
  end if;
  if (select role from public.household_members
      where user_id = '00000000-0000-4000-a000-00000000000b') <> 'member' then
    raise exception 'FALLO: B no quedó como member';
  end if;

  -- B solo ve su propio perfil, no el de A.
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FALLO: B ve perfiles ajenos';
  end if;

  -- B no puede invitar.
  begin
    insert into public.household_invites (household_id, token_hash)
    values (current_setting('test.hid')::uuid, repeat('b', 64));
    raise exception 'FALLO: B (member) pudo crear una invitación';
  exception when insufficient_privilege then null;
  end;

  -- B no ve las invitaciones (son solo del owner).
  if (select count(*) from public.household_invites) <> 0 then
    raise exception 'FALLO: B ve las invitaciones';
  end if;

  -- B no puede ascenderse a owner ni agregar gente directamente.
  begin
    update public.household_members set role = 'owner'
    where user_id = '00000000-0000-4000-a000-00000000000b';
    raise exception 'FALLO: B pudo cambiar su rol';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.household_members (household_id, user_id, role)
    values (current_setting('test.hid')::uuid, '00000000-0000-4000-a000-00000000000c', 'member');
    raise exception 'FALLO: B pudo insertar miembros directamente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --- C es ajeno: no ve nada y no puede entrar --------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.households) <> 0 then
    raise exception 'FALLO: C ve households ajenos';
  end if;
  if (select count(*) from public.household_members) <> 0 then
    raise exception 'FALLO: C ve miembros ajenos';
  end if;
  if (select count(*) from public.household_invites) <> 0 then
    raise exception 'FALLO: C ve invitaciones ajenas';
  end if;
  if (select count(*) from public.profiles where id <> '00000000-0000-4000-a000-00000000000c') <> 0 then
    raise exception 'FALLO: C ve perfiles de A o B';
  end if;
  if (select count(*) from public.get_household_members(current_setting('test.hid')::uuid)) <> 0 then
    raise exception 'FALLO: C obtiene miembros con get_household_members';
  end if;
  if public.is_household_member(current_setting('test.hid')::uuid) then
    raise exception 'FALLO: C aparece como miembro';
  end if;

  -- C no puede editar el perfil de A (la fila no es visible, 0 filas).
  update public.profiles set display_name = 'hackeado'
  where id = '00000000-0000-4000-a000-00000000000a';

  -- Un token ya usado no sirve otra vez.
  begin
    perform public.accept_invite('token-uno');
    raise exception 'FALLO: se reutilizó un token';
  exception when raise_exception then
    if sqlerrm <> 'invite_used' then
      raise exception 'FALLO: reutilizar token dio "%" en vez de invite_used', sqlerrm;
    end if;
  end;

  -- Con un token válido, el household está lleno (máximo 2).
  begin
    perform public.accept_invite('token-dos');
    raise exception 'FALLO: entró un tercer miembro';
  exception when raise_exception then
    if sqlerrm <> 'household_full' then
      raise exception 'FALLO: tercer miembro dio "%" en vez de household_full', sqlerrm;
    end if;
  end;

  -- Un token inexistente se rechaza.
  begin
    perform public.accept_invite('no-existe');
    raise exception 'FALLO: se aceptó un token inexistente';
  exception when raise_exception then
    if sqlerrm <> 'invite_invalid' then
      raise exception 'FALLO: token inexistente dio "%" en vez de invite_invalid', sqlerrm;
    end if;
  end;

  -- C no puede crear invitaciones para el household de A.
  begin
    insert into public.household_invites (household_id, token_hash)
    values (current_setting('test.hid')::uuid, repeat('c', 64));
    raise exception 'FALLO: C pudo crear una invitación ajena';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --- Comprobaciones finales (como postgres) -----------------------------------
reset role;

-- Invitación vencida: se crea a mano con fechas pasadas.
insert into public.household_invites (household_id, token_hash, created_at, expires_at, created_by)
values (current_setting('test.hid')::uuid,
        encode(sha256(convert_to('token-vencido', 'UTF8')), 'hex'),
        now() - interval '8 days', now() - interval '1 day',
        '00000000-0000-4000-a000-00000000000a');

do $$
begin
  if (select count(*) from public.household_members
      where household_id = current_setting('test.hid')::uuid) <> 2 then
    raise exception 'FALLO: el household no tiene exactamente 2 miembros';
  end if;
  if (select display_name from public.profiles
      where id = '00000000-0000-4000-a000-00000000000a') <> 'Usuario A' then
    raise exception 'FALLO: C modificó el perfil de A';
  end if;
  if (select used_by from public.household_invites
      where token_hash = encode(sha256(convert_to('token-uno', 'UTF8')), 'hex'))
     <> '00000000-0000-4000-a000-00000000000b' then
    raise exception 'FALLO: la invitación usada no registra a B';
  end if;
  if (select used_at from public.household_invites
      where token_hash = encode(sha256(convert_to('token-dos', 'UTF8')), 'hex')) is not null then
    raise exception 'FALLO: el intento de C marcó token-dos como usado';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.accept_invite('token-vencido');
    raise exception 'FALLO: se aceptó una invitación vencida';
  exception when raise_exception then
    if sqlerrm <> 'invite_expired' then
      raise exception 'FALLO: invitación vencida dio "%" en vez de invite_expired', sqlerrm;
    end if;
  end;
end $$;

reset role;

select 'OK: todas las pruebas RLS pasaron' as resultado;

rollback;
