-- Seed de demostración.
-- Este archivo no inserta datos. El proyecto enlazado es el de desarrollo
-- y el de producción a la vez, así que cargarlo escribiría ejemplos encima
-- de los datos reales. pnpm db:seed:demo termina antes de llegar aquí.
do $$
begin
  raise exception
    'FALLO: el seed de demostración no se ejecuta contra este proyecto';
end $$;
