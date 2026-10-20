-- =============================================================================
-- Tests de 0020_profile_eur_display.sql: profiles.display_currency admite
-- EUR, y sigue rechazando cualquier otra cosa. Todo en una transacción con
-- ROLLBACK (pnpm test:rls). Prefijo eurd_ para no chocar con otros archivos.
-- =============================================================================
begin;

create function pg_temp.eurd_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.eurd_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
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

create function pg_temp.eurd_expect_rows(stmt text, n int, label text) returns void language plpgsql as $$
declare affected int;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected <> n then
    raise exception 'FALLO: % (afectó % filas, esperaba %)', label, affected, n;
  end if;
end $$;

-- Vuelve al rol de la sesión por si el archivo anterior (en test:db:fresh,
-- todos juntos) dejó el role en authenticated.
reset role;

-- auth.users ya crea la fila de profiles por su cuenta (trigger de 0001).
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-4000-b000-0000000000e1', 'authenticated', 'authenticated', 'eurd-a@test.local', '{}', '{}');

select pg_temp.eurd_login('00000000-0000-4000-b000-0000000000e1');

select pg_temp.eurd_expect_rows(
  $q$update public.profiles set display_currency = 'EUR' where id = '00000000-0000-4000-b000-0000000000e1'$q$,
  1, 'EUR es una moneda de visualización válida');

select pg_temp.eurd_expect_error(
  $q$update public.profiles set display_currency = 'GBP' where id = '00000000-0000-4000-b000-0000000000e1'$q$,
  '23514', 'GBP sigue sin ser una moneda de visualización válida');

-- Vuelve al rol de la sesión: en test:db:fresh el siguiente archivo asume
-- que puede volver a insertar en auth.users sin haber iniciado sesión antes.
reset role;

select 'OK: profiles.display_currency admite EUR' as resultado;

rollback;
