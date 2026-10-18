-- =============================================================================
-- Tests de aislamiento entre hogares y seguridad (beta, B4 de docs/PROMPT_BETA.md)
--
-- No repite lo que ya cubren otros archivos; se apoya en ellos y agrega lo
-- que faltaba para este tema en concreto:
--   - rls_finance.sql / rls_households.sql: un hogar + un usuario ajeno sin
--     hogar, con inserts/updates crudos. Aquí hay DOS hogares reales (cada
--     uno con dueño y miembro) y las suplantaciones se intentan también por
--     RPC (save_transaction, leave_household, remove_household_member), no
--     solo con insert/update directo.
--   - household_leave.sql: candado de ex miembro (salida voluntaria) dentro
--     de UN hogar. Aquí se confirma además que salir de un hogar no da
--     ninguna visibilidad sobre el OTRO hogar.
--   - account_deletion.sql: mecánica completa de reasignación al usuario
--     fantasma al borrar una cuenta. Aquí se confirma que ese fantasma
--     (compartido por todos los borrados de cuenta de toda la app) nunca es
--     miembro de ningún hogar y no sirve de puente entre hogares distintos.
--   - definer_scope.sql: ya prueba a fondo (SECURITY DEFINER, search_path
--     fijo, misma respuesta para "de otro hogar" y "no existe") que
--     household_has_member y transaction_has_former_member no revelan ids
--     ajenos (B-07 de docs/security/AUDIT.md). Aquí solo se reconfirma con
--     los dos hogares y los ex miembros de ESTE archivo, sin repetir la
--     introspección de pg_proc.
--
-- Entidades: hogar H1 (A administra, B es miembro), hogar H2 (D administra,
-- G es miembro), sin relación entre H1 y H2. S no tiene hogar. B sale de H1
-- por su cuenta (leave_household): queda como "ex miembro" con su nombre.
-- G borra su cuenta estando en H2 (delete_account_data): queda reasignado
-- al usuario fantasma, sin nombre.
--
-- Última sección: ember.account_deletion (0017) no se puede activar desde
-- ninguna RPC expuesta ni filtra la aislación de RLS si alguien lo fuerza a
-- mano (ver el razonamiento completo ahí).
-- =============================================================================
begin;

create function pg_temp.hi_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.hi_logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.hi_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.hi_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    set constraints all immediate;
  exception when others then
    if sqlerrm <> expected and sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    set constraints all deferred;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

create function pg_temp.hi_expect_count(q text, n bigint, label text) returns void language plpgsql as $$
declare got bigint;
begin
  execute q into got;
  if got is distinct from n then
    raise exception 'FALLO: % (contó %, esperaba %)', label, got, n;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Preparación: dos hogares reales, sin relación, y un usuario sin hogar.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ec10-000000000001', 'authenticated', 'authenticated', 'hi-a@test.local', '{"full_name":"A"}', '{}'),
  ('00000000-0000-4000-ec10-000000000002', 'authenticated', 'authenticated', 'hi-b@test.local', '{"full_name":"B"}', '{}'),
  ('00000000-0000-4000-ec10-000000000003', 'authenticated', 'authenticated', 'hi-d@test.local', '{"full_name":"D"}', '{}'),
  ('00000000-0000-4000-ec10-000000000004', 'authenticated', 'authenticated', 'hi-g@test.local', '{"full_name":"G"}', '{}'),
  ('00000000-0000-4000-ec10-000000000005', 'authenticated', 'authenticated', 'hi-s@test.local', '{}', '{}');

-- H1: A administra, invita a B.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select set_config('test.hi_h1', public.create_household('H1')::text, true);
insert into public.household_invites (household_id, token_hash) values
  (current_setting('test.hi_h1')::uuid, encode(sha256(convert_to('hi-token-b', 'UTF8')), 'hex')),
  (current_setting('test.hi_h1')::uuid, encode(sha256(convert_to('hi-token-h1-extra', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('10000000-0000-4000-ec10-000000000001', current_setting('test.hi_h1')::uuid, 'Casa H1', 'checking', 'COP');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000002');
select public.accept_invite('hi-token-b');

-- H2: D administra, invita a G. Nada en común con H1.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000003');
select set_config('test.hi_h2', public.create_household('H2')::text, true);
insert into public.household_invites (household_id, token_hash) values
  (current_setting('test.hi_h2')::uuid, encode(sha256(convert_to('hi-token-g', 'UTF8')), 'hex')),
  (current_setting('test.hi_h2')::uuid, encode(sha256(convert_to('hi-token-h2-extra', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('10000000-0000-4000-ec10-000000000002', current_setting('test.hi_h2')::uuid, 'Casa H2', 'checking', 'COP');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000004');
select public.accept_invite('hi-token-g');

-- A paga 1000 en H1 (50/50): B le debe 500. D paga 1000 en H2 (50/50): G le debe 500.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select set_config('test.hi_tx1', public.save_transaction(null, current_setting('test.hi_h1')::uuid,
  '10000000-0000-4000-ec10-000000000001', 'expense', 'food', 'Mercado H1', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ec10-000000000001', null)::text, true);
set constraints all immediate;
set constraints all deferred;

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000003');
select set_config('test.hi_tx2', public.save_transaction(null, current_setting('test.hi_h2')::uuid,
  '10000000-0000-4000-ec10-000000000002', 'expense', 'food', 'Mercado H2', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ec10-000000000003', null)::text, true);
set constraints all immediate;
set constraints all deferred;

-- Liquidaciones que dejan el saldo de B (en H1) y de G (en H2) en cero.
select set_config('role', 'postgres', true);
insert into public.settlements (household_id, from_user, to_user, amount_minor, currency, created_by) values
  (current_setting('test.hi_h1')::uuid, '00000000-0000-4000-ec10-000000000002',
   '00000000-0000-4000-ec10-000000000001', 500, 'COP', '00000000-0000-4000-ec10-000000000002'),
  (current_setting('test.hi_h2')::uuid, '00000000-0000-4000-ec10-000000000004',
   '00000000-0000-4000-ec10-000000000003', 500, 'COP', '00000000-0000-4000-ec10-000000000004');

-- =============================================================================
-- 1. Aislamiento de lectura cruzada: A y D son simétricamente ajenos entre
--    sí; S (sin hogar) no ve nada de ninguno de los dos.
-- =============================================================================
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select pg_temp.hi_expect_count($q$select count(*) from public.accounts where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve cuentas de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.transactions where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve transacciones de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.transaction_splits s join public.transactions t on t.id = s.transaction_id where t.household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve repartos de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.settlements where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve liquidaciones de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.household_invites where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve invitaciones de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.household_members where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve miembros de H2');
select pg_temp.hi_expect_count($q$select count(*) from public.households where id = current_setting('test.hi_h2')::uuid$q$, 0, 'A no ve el hogar H2 en sí');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000003');
select pg_temp.hi_expect_count($q$select count(*) from public.accounts where household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve cuentas de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.transactions where household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve transacciones de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.transaction_splits s join public.transactions t on t.id = s.transaction_id where t.household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve repartos de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.settlements where household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve liquidaciones de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.household_invites where household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve invitaciones de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.household_members where household_id = current_setting('test.hi_h1')::uuid$q$, 0, 'D no ve miembros de H1');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000005');
select pg_temp.hi_expect_count('select count(*) from public.accounts', 0, 'S (sin hogar) no ve cuentas de nadie');
select pg_temp.hi_expect_count('select count(*) from public.transactions', 0, 'S no ve transacciones de nadie');
select pg_temp.hi_expect_count('select count(*) from public.households', 0, 'S no ve ningún hogar');
select pg_temp.hi_expect_count('select count(*) from public.household_members', 0, 'S no ve ninguna membresía');
select pg_temp.hi_expect_count('select count(*) from public.household_invites', 0, 'S no ve ninguna invitación');
select pg_temp.hi_expect_count('select count(*) from public.settlements', 0, 'S no ve ninguna liquidación');

-- =============================================================================
-- 2. Suplantación por RPC (no solo insert/update crudo): household_id,
--    user_id/paid_by y las RPC de salida, probadas con DOS hogares reales.
-- =============================================================================
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
-- A intenta crear una transacción en H2 (household_id ajeno) por la RPC.
select pg_temp.hi_expect_error(format(
  $q$select public.save_transaction(null, %L, '10000000-0000-4000-ec10-000000000002',
    'expense', 'food', 'intrusa', null, 1, 'COP', current_date, %L, null)$q$,
  current_setting('test.hi_h2'), '00000000-0000-4000-ec10-000000000001'),
  '42501', 'A no crea una transacción en H2 llamando a save_transaction');
-- A intenta poner como pagador a D (ajeno a H1) en una transacción de H1 por la RPC.
select pg_temp.hi_expect_error(format(
  $q$select public.save_transaction(null, %L, '10000000-0000-4000-ec10-000000000001',
    'expense', 'food', 'pagador ajeno', null, 1, 'COP', current_date, %L, null)$q$,
  current_setting('test.hi_h1'), '00000000-0000-4000-ec10-000000000003'),
  '42501', 'A no pone a D (de H2) como pagador en H1 por la RPC');
-- A intenta quitar a D de H1: D ni siquiera es miembro de H1.
select pg_temp.hi_expect_error(format(
  $q$select public.remove_household_member(%L, '00000000-0000-4000-ec10-000000000003')$q$,
  current_setting('test.hi_h1')), 'not_member', 'A no puede quitar de H1 a alguien que nunca fue miembro (D)');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000003');
-- D (ajeno a H1) intenta salir de H1: nunca fue miembro.
select pg_temp.hi_expect_error(format(
  $q$select public.leave_household(%L)$q$, current_setting('test.hi_h1')),
  'not_member', 'D no puede "salir" de un hogar al que nunca perteneció (H1)');
-- D (no administra H1) intenta quitar a A de H1.
select pg_temp.hi_expect_error(format(
  $q$select public.remove_household_member(%L, '00000000-0000-4000-ec10-000000000001')$q$,
  current_setting('test.hi_h1')), '42501', 'D no administra H1: no puede quitar a A');

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000005');
-- S (sin hogar) intenta las mismas RPC contra H1.
select pg_temp.hi_expect_error(format(
  $q$select public.leave_household(%L)$q$, current_setting('test.hi_h1')),
  'not_member', 'S no puede salir de un hogar al que nunca perteneció');
select pg_temp.hi_expect_error(format(
  $q$select public.remove_household_member(%L, '00000000-0000-4000-ec10-000000000001')$q$,
  current_setting('test.hi_h1')), '42501', 'S no administra H1: no puede quitar a nadie');

-- =============================================================================
-- 3. Miembro que salió por su cuenta (B, de H1): sigue sin ver nada de H2.
-- =============================================================================
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000002');
select public.leave_household(current_setting('test.hi_h1')::uuid);
select pg_temp.hi_expect(not public.is_household_member(current_setting('test.hi_h1')::uuid), 'B salió de H1 con el saldo en cero');
select pg_temp.hi_expect_count($q$select count(*) from public.households$q$, 0, 'B (ya ex miembro de H1) no ve ningún hogar, tampoco H2');
select pg_temp.hi_expect_count($q$select count(*) from public.accounts where household_id = current_setting('test.hi_h2')::uuid$q$, 0, 'B no obtuvo acceso a H2 al salir de H1');

select pg_temp.hi_logout();
select pg_temp.hi_expect(
  (select display_name = 'B' and not deleted_account from public.household_departures
   where household_id = current_setting('test.hi_h1')::uuid and user_id = '00000000-0000-4000-ec10-000000000002'),
  'la salida de B queda con su nombre real (voluntaria, no por borrado de cuenta)');

-- =============================================================================
-- 4. Ex miembro por borrado de cuenta (G, de H2): se reasigna al usuario
--    fantasma. El fantasma nunca es miembro de ningún hogar, así que no
--    puede servir de puente entre H2 y H1 (ni con ningún otro hogar que
--    algún día tenga un borrado de cuenta).
-- -----------------------------------------------------------------------------
-- El usuario fantasma es una sola fila en toda la base (0017). Si ya existe
-- (por ejemplo, porque account_deletion.sql corrió antes en esta misma
-- transacción, como pasa en pnpm test:db:fresh), se reutiliza; si no, se crea
-- aquí como lo haría el servidor (lib/auth/deleted-user-sentinel.ts).
-- =============================================================================
select set_config('role', 'postgres', true);
do $$
begin
  if not exists (select 1 from public.deleted_account_sentinel) then
    insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
    values ('00000000-0000-4000-ec10-0000000000ff', 'authenticated', 'authenticated',
      'deleted-user@ember-cash.invalid', '{}', '{}');
    insert into public.deleted_account_sentinel (user_id) values ('00000000-0000-4000-ec10-0000000000ff');
  end if;
end $$;
select set_config('test.hi_sentinel', (select user_id::text from public.deleted_account_sentinel), true);

select pg_temp.hi_login('00000000-0000-4000-ec10-000000000004');
select pg_temp.hi_expect((public.delete_account_data() ->> 'ok')::boolean, 'G (saldo en cero en H2) puede borrar su cuenta');

select pg_temp.hi_logout();
select pg_temp.hi_expect(
  (select array_agg(user_id) from public.household_members where household_id = current_setting('test.hi_h2')::uuid)
    = array[('00000000-0000-4000-ec10-000000000003')::uuid],
  'H2 sigue existiendo con solo D; G ya no es miembro');
select pg_temp.hi_expect(
  (select paid_by from public.transactions where id = current_setting('test.hi_tx2')::uuid) is distinct from
  '00000000-0000-4000-ec10-000000000004'::uuid,
  'el pagador de la transacción de H2 ya no es G: quedó a nombre del fantasma');
select pg_temp.hi_expect(
  (select display_name is null and deleted_account from public.household_departures
   where household_id = current_setting('test.hi_h2')::uuid and user_id = current_setting('test.hi_sentinel')::uuid),
  'la salida de G por borrado de cuenta queda anónima ("Usuario eliminado")');

-- El fantasma NUNCA es miembro de ningún hogar (ni de H1, ni de H2, ni de
-- cualquier otro que haya existido antes en esta misma base de pruebas): es
-- solo un valor en columnas owner_id/paid_by/user_id/from_user/to_user, y las
-- políticas de RLS de estas tablas se basan en membresía ACTUAL de
-- auth.uid(), nunca en qué nombres aparecen en las filas. Por eso un usuario
-- fantasma compartido entre todos los borrados de cuenta de la app no puede
-- volverse un puente de visibilidad entre hogares distintos.
select pg_temp.hi_expect_count(
  format($q$select count(*) from public.household_members where user_id = %L$q$, current_setting('test.hi_sentinel')),
  0, 'el usuario fantasma no es miembro de ningún hogar');

-- A (H1) sigue sin ver nada de H2, ahora con un ex miembro de por medio.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select pg_temp.hi_expect_count($q$select count(*) from public.transactions where household_id = current_setting('test.hi_h2')::uuid$q$,
  0, 'A sigue sin ver las transacciones de H2 (ni las que ahora son del fantasma)');
select pg_temp.hi_expect_count($q$select count(*) from public.household_departures where household_id = current_setting('test.hi_h2')::uuid$q$,
  0, 'A no ve el registro de salida de G en H2');

-- =============================================================================
-- 5. B-07 (docs/security/AUDIT.md): household_has_member y
--    transaction_has_former_member, reconfirmadas con los hogares y ex
--    miembros de ESTE archivo. La prueba a fondo (SECURITY DEFINER,
--    search_path fijo, introspección de pg_proc) vive en definer_scope.sql;
--    aquí solo se repite el comportamiento observable.
-- =============================================================================
-- household_has_member exige que quien llama sea TAMBIÉN miembro del hogar
-- que pregunta (0014_definer_scope.sql): por eso aquí se entra como D antes
-- de preguntar por H2, igual que definer_scope.sql entra como cada dueño
-- antes de preguntar por su propio hogar.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000003');
do $$
declare
  h1 uuid := current_setting('test.hi_h1')::uuid;
  h2 uuid := current_setting('test.hi_h2')::uuid;
  tx2 uuid := current_setting('test.hi_tx2')::uuid;
  missing_h uuid := '00000000-0000-4000-ec10-00000000eeee';
  d uuid := '00000000-0000-4000-ec10-000000000003';
begin
  -- D sigue siendo miembro de H2; la transacción de H2 ya tiene un ex miembro (el fantasma).
  if public.household_has_member(h2, d) is distinct from true then
    raise exception 'FALLO: D no aparece como miembro de H2';
  end if;
  if public.transaction_has_former_member(tx2) is distinct from true then
    raise exception 'FALLO: la transacción de H2 no muestra el ex miembro (fantasma)';
  end if;
  -- H1 no es de D: misma respuesta que un hogar que no existe (D no es
  -- miembro de H1, así que household_has_member ni confirma ni niega nada
  -- sobre sus miembros reales: siempre false).
  if public.household_has_member(h1, d) is distinct from false
     or public.household_has_member(h1, d) is distinct from public.household_has_member(missing_h, d) then
    raise exception 'FALLO: household_has_member distingue H1 (ajeno) de un hogar inexistente, para D';
  end if;
end $$;

-- =============================================================================
-- 6. Export (lib/export/backup.ts, EXPORT_TABLES): baja cada tabla con la
--    anon key + el access token de la sesión, es decir, sujeto a RLS igual
--    que cualquier otra lectura. Las tablas con household_id ya se probaron
--    arriba contra el OTRO hogar; aquí se confirma puntualmente en las
--    tablas donde este archivo tiene datos reales de los dos hogares y de
--    sus ex miembros (goals/debts/recurring_items/budgets ya quedan
--    cubiertos con dos hogares reales en rls_finance.sql, sección 1-3, y no
--    hace falta repetirlos).
-- =============================================================================
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select pg_temp.hi_expect_count('select count(*) from public.profiles', 1, 'export: A solo vería su propio perfil');
select pg_temp.hi_expect_count('select count(*) from public.households', 1, 'export: A solo vería H1');
select pg_temp.hi_expect_count($q$select count(*) from public.household_members where household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería miembros fuera de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.household_departures where household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería salidas fuera de H1 (ni la de G en H2)');
select pg_temp.hi_expect_count($q$select count(*) from public.accounts where household_id is not null and household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería cuentas compartidas fuera de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.transactions where household_id is not null and household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería transacciones compartidas fuera de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.transaction_splits s join public.transactions t on t.id = s.transaction_id where t.household_id is not null and t.household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería repartos fuera de H1');
select pg_temp.hi_expect_count($q$select count(*) from public.settlements where household_id <> current_setting('test.hi_h1')::uuid$q$, 0, 'export: A no vería liquidaciones fuera de H1');

-- =============================================================================
-- 7. ember.account_deletion (0017): ninguna RPC expuesta puede activarlo, y
--    aunque alguien lo fuerce a mano, RLS sigue aislando los hogares.
--
-- "Desde la API": PostgREST solo traduce peticiones HTTP a dos cosas, nunca
-- a SQL libre: operaciones CRUD sobre una tabla expuesta (bajo RLS) o una
-- llamada a una función del esquema public expuesta como RPC. set_config
-- vive en pg_catalog, no en public, así que no existe ninguna ruta
-- /rest/v1/rpc/set_config ni forma de colarlo en el body de una petición de
-- tabla: estructuralmente, PostgREST nunca ejecuta esa llamada por cuenta de
-- un cliente. Lo que SÍ se puede probar aquí, dentro de una sesión SQL:
--   a) que ninguna función de public (las únicas que una RPC real podría
--      exponer) ENCIENDE el ajuste salvo delete_account_data;
--   b) que no existe una función public.set_config que pudiera exponerse
--      como esa ruta;
--   c) que si alguien lo forzara a mano (el rol authenticated SÍ tiene
--      permiso de ejecutar el set_config de pg_catalog, como cualquier rol:
--      no es un privilegio especial), eso NO basta para saltarse RLS, que es
--      una capa totalmente aparte y es la que de verdad separa los hogares.
-- =============================================================================

-- a) y b): introspección de pg_proc. Si alguna vez una función nueva
-- empieza a tocar este ajuste, esta prueba se detiene y obliga a revisarla.
do $$
declare
  fn record;
  writers text[] := '{}';
  touches_count int := 0;
begin
  for fn in
    select p.proname, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%ember.account_deletion%'
  loop
    touches_count := touches_count + 1;
    -- member_write_bypassed (0018) solo lee el ajuste. No lo enciende.
    if fn.proname not in ('forbid_column_change', 'lock_former_member_transaction',
        'lock_former_member_splits', 'lock_former_member_settlement',
        'enforce_write_rate_limit', 'delete_account_data', 'member_write_bypassed') then
      raise exception 'FALLO: % toca ember.account_deletion y no estaba en la lista esperada', fn.proname;
    end if;
    if fn.prosrc like '%set_config%ember.account_deletion%' then
      writers := array_append(writers, fn.proname);
    end if;
  end loop;
  if touches_count <> 7 then
    raise exception 'FALLO: se esperaban 7 funciones que mencionan ember.account_deletion, hay %', touches_count;
  end if;
  if writers <> array['delete_account_data'] then
    raise exception 'FALLO: la única función que debería ENCENDER ember.account_deletion es delete_account_data, pero son: %', writers;
  end if;
end $$;

-- No existe public.set_config (ni ninguna otra función en public con ese
-- nombre) que pudiera quedar expuesta como /rest/v1/rpc/set_config.
select pg_temp.hi_expect_count(
  $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_config'$q$,
  0, 'no hay ninguna función set_config en el esquema public (el que expone PostgREST)');

-- c) Defensa en profundidad: aunque A fuerce el ajuste a mano con una sesión
-- autenticada legítima (demuestra que el permiso de Postgres sobre
-- set_config no es el verdadero candado), sigue sin poder tocar ni leer H2.
select pg_temp.hi_login('00000000-0000-4000-ec10-000000000001');
select set_config('ember.account_deletion', 'on', true);
select pg_temp.hi_expect(current_setting('ember.account_deletion', true) = 'on',
  'A (rol authenticated normal) sí puede ejecutar set_config: no es un privilegio especial');
-- RLS sigue bloqueando lectura de H2.
select pg_temp.hi_expect_count($q$select count(*) from public.accounts where household_id = current_setting('test.hi_h2')::uuid$q$,
  0, 'con el ajuste forzado a mano, A sigue sin VER cuentas de H2 (RLS es independiente del ajuste)');
-- RLS sigue bloqueando escritura cruzada: 0 filas afectadas (USING las oculta), no un bypass.
do $$
declare affected int;
begin
  update public.accounts set name = 'hack' where household_id = current_setting('test.hi_h2')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FALLO: con el ajuste forzado a mano, A pudo renombrar % cuenta(s) de H2 (debería ser 0, por RLS)', affected;
  end if;
end $$;
-- RLS sigue bloqueando crear una fila nueva en H2.
select pg_temp.hi_expect_error(format(
  $q$insert into public.accounts (household_id, name, type, currency) values (%L, 'intrusa', 'cash', 'COP')$q$,
  current_setting('test.hi_h2')), '42501', 'con el ajuste forzado a mano, A no puede crear una cuenta en H2 (RLS, no el ajuste)');
-- Se apaga explícitamente: si quedara encendido, los demás archivos de esta
-- misma transacción (pnpm test:db:fresh) heredarían el bypass de los
-- candados de ex miembro y del límite de escrituras.
select set_config('ember.account_deletion', 'off', true);
select pg_temp.hi_expect(coalesce(current_setting('ember.account_deletion', true), '') <> 'on',
  'el ajuste queda apagado después de esta prueba, para no filtrarse a otros archivos');

select pg_temp.hi_logout();

select 'OK: todas las pruebas de aislamiento entre hogares pasaron' as resultado;

rollback;
