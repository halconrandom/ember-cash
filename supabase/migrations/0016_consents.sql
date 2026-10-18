-- =============================================================================
-- Consentimiento del aviso de privacidad y de los términos (beta, B1).
--
-- Una fila por usuario, tipo (privacy o terms) y versión del texto. La
-- versión vigente vive en el código (lib/legal/version.ts). Si cambia, no hay
-- fila de esa versión y la app vuelve a pedir el consentimiento. Las filas
-- viejas se quedan: son el historial, no se editan ni se borran.
--
-- No se guarda la IP ni ningún otro dato. user_id y accepted_at los pone la
-- base (default y disparador), así el cliente no puede firmar por otra
-- persona ni cambiar la hora.
--
-- El disparador zz_rate_limit_write (0015) también cuenta estas inserciones
-- como escritura. No se vuelve a llamar consume_rate_limit desde la app.
-- =============================================================================

create table public.consents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('privacy', 'terms')),
  version text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (user_id, type, version)
);

comment on table public.consents is
  'Consentimiento de privacidad y términos. Una fila por tipo y versión. No se edita ni se borra.';

alter table public.consents enable row level security;

-- Fuerza el dueño y la hora aunque quien inserta sea el dueño de la tabla
-- (ese rol se salta los GRANT de columna). Sin sesión, no hay consentimiento.
create function public.consents_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  new.accepted_at := pg_catalog.now();
  if new.user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return new;
end;
$$;

comment on function public.consents_stamp() is
  'Al crear un consentimiento, user_id es auth.uid() y accepted_at es ahora.';

revoke all on function public.consents_stamp() from public, anon;
grant execute on function public.consents_stamp() to authenticated;

-- Antes del límite de escrituras (zz_): si esta rechaza, no se gasta un cupo.
create trigger consents_stamp
  before insert on public.consents
  for each row execute function public.consents_stamp();

create trigger zz_rate_limit_write
  before insert or update or delete on public.consents
  for each row execute function public.enforce_write_rate_limit();

create policy "consents: cada quien ve los suyos"
  on public.consents for select to authenticated
  using (user_id = (select auth.uid()));

create policy "consents: cada quien crea los suyos"
  on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Sin políticas de update ni delete: con RLS, authenticated no puede hacerlo.
-- El revoke es la otra barrera, por si más adelante se agrega una política.
revoke all on table public.consents from public, anon, authenticated;
grant select on table public.consents to authenticated;
grant insert (type, version) on table public.consents to authenticated;
