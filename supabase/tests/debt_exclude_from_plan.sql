-- =============================================================================
-- Deudas fuera del plan (0030). exclude_from_plan arranca en false, el dueño
-- lo cambia y otra persona no. No toca pagos ni saldo. Ayudas con prefijo dxp_.
-- =============================================================================
begin;

create function pg_temp.dxp_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.dxp_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c030-00000000000a', 'authenticated', 'authenticated', 'dxp-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c030-00000000000b', 'authenticated', 'authenticated', 'dxp-b@test.local', '{}', '{}');

select pg_temp.dxp_login('00000000-0000-4000-c030-00000000000a');
insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind)
values ('00000000-0000-4000-c030-0000000000d1', 'Casa', 'COP', 180000000, 1200, 'EA');
select pg_temp.dxp_expect(
  (select not exclude_from_plan from public.debts where id = '00000000-0000-4000-c030-0000000000d1'),
  'una deuda nueva está en el plan'
);
update public.debts set exclude_from_plan = true where id = '00000000-0000-4000-c030-0000000000d1';
select pg_temp.dxp_expect(
  (select exclude_from_plan from public.debts where id = '00000000-0000-4000-c030-0000000000d1'),
  'el dueño la saca del plan'
);

select pg_temp.dxp_login('00000000-0000-4000-c030-00000000000b');
update public.debts set exclude_from_plan = false where id = '00000000-0000-4000-c030-0000000000d1';
select pg_temp.dxp_expect(
  not exists (select 1 from public.debts where id = '00000000-0000-4000-c030-0000000000d1'),
  'B no ve la deuda de A'
);

select pg_temp.dxp_login('00000000-0000-4000-c030-00000000000a');
select pg_temp.dxp_expect(
  (select exclude_from_plan from public.debts where id = '00000000-0000-4000-c030-0000000000d1'),
  'B no pudo cambiar el flag de A'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
delete from auth.users
where id in ('00000000-0000-4000-c030-00000000000a', '00000000-0000-4000-c030-00000000000b');

select 'OK: exclude_from_plan solo lo cambia el dueño' as resultado;

rollback;
