-- =============================================================================
-- Tests de 0006_profile_locale.sql: profiles.locale.
-- Usuarios A y B. Todo en una transacción con ROLLBACK (pnpm test:rls).
-- Las ayudas llevan el prefijo loc_ para no chocar con las de otros archivos
-- cuando test:db:fresh corre todos juntos.
-- =============================================================================
begin;

-- Actúa como el usuario indicado.
create function pg_temp.loc_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Exige que `stmt` falle con el SQLSTATE `expected`.
create function pg_temp.loc_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- Exige que `stmt` afecte exactamente `n` filas.
create function pg_temp.loc_expect_rows(stmt text, n int, label text) returns void language plpgsql as $$
declare affected int;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected <> n then
    raise exception 'FALLO: % (afectó % filas, esperaba %)', label, affected, n;
  end if;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-d000-00000000000a', 'authenticated', 'authenticated', 'loc-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-d000-00000000000b', 'authenticated', 'authenticated', 'loc-b@test.local', '{}', '{}');

do $$
begin
  if (select locale from public.profiles where id = '00000000-0000-4000-d000-00000000000a') <> 'es' then
    raise exception 'FALLO: el idioma por defecto no es es';
  end if;
end $$;

select pg_temp.loc_login('00000000-0000-4000-d000-00000000000a');

select pg_temp.loc_expect_rows($q$update public.profiles set locale = 'en' where id = '00000000-0000-4000-d000-00000000000a'$q$, 1, 'A cambia su idioma a en');
select pg_temp.loc_expect_error($q$update public.profiles set locale = 'fr' where id = '00000000-0000-4000-d000-00000000000a'$q$, '23514', 'un idioma no permitido falla');
select pg_temp.loc_expect_error($q$update public.profiles set locale = null where id = '00000000-0000-4000-d000-00000000000a'$q$, '23502', 'el idioma no puede ser nulo');
select pg_temp.loc_expect_rows($q$update public.profiles set locale = 'en' where id = '00000000-0000-4000-d000-00000000000b'$q$, 0, 'A no cambia el idioma de B');

do $$
begin
  if (select locale from public.profiles where id = '00000000-0000-4000-d000-00000000000a') <> 'en' then
    raise exception 'FALLO: el idioma de A no quedó en en';
  end if;
end $$;

select set_config('role', 'postgres', true);

do $$
begin
  if (select locale from public.profiles where id = '00000000-0000-4000-d000-00000000000b') <> 'es' then
    raise exception 'FALLO: el idioma de B cambió';
  end if;
end $$;

select 'OK: todas las pruebas de profiles.locale pasaron' as resultado;

rollback;
