-- Ember Cash: métricas de onboarding (Nova), fase F1.
--
-- Consultas sobre public.events. Correrlas como dueño de la tabla o con la
-- service role. No hay una vista para authenticated: RLS solo deja ver las
-- filas propias, y estos porcentajes necesitan ver a todo el mundo.
--
-- Definiciones (no hay un evento app_open; el retorno solo ve eventos que
-- la app ya registra):
--
--   Termina
--     Personas distintas con onboarding_completed
--     / personas distintas con onboarding_started.
--
--   Abandono
--     Empezó, no tiene onboarding_completed y no tiene onboarding_skipped.
--     El paso es el menor n entre 0 y 4 para el que no hay
--     onboarding_step_completed con props.step = n.
--     0 bienvenida, 1 moneda, 2 cuenta, 3 qué controlar, 4 panel.
--     Quien termina emite los pasos 0 a 3 y onboarding_completed; no emite
--     el paso 4. Quien omite emite onboarding_skipped y no cuenta como
--     abandono ni como terminado.
--
--   Elemento en la primera sesión
--     Tiene first_item_created en las 12 horas siguientes a
--     onboarding_started (la más antigua) / quienes empezaron.
--     type: account, goal, debt, subscription, expense.
--
--   Tiempo al panel con datos
--     Mediana de (onboarding_completed - onboarding_started) entre quienes
--     tienen un first_item_created con created_at <= el completed.
--
--   Retorno a 7 días
--     Entre quienes completaron hace al menos 8 días: los que tienen
--     cualquier evento en [completed + 7 días, completed + 8 días).
--
--   Ayuda
--     Conteo de help_opened por props.page. El panel de ayuda es la fase F2;
--     el evento ya está permitido.

-- % que termina el wizard.
select
  count(distinct user_id) filter (where name = 'onboarding_completed') as terminaron,
  count(distinct user_id) filter (where name = 'onboarding_started') as empezaron,
  round(
    100.0 * count(distinct user_id) filter (where name = 'onboarding_completed')
    / nullif(count(distinct user_id) filter (where name = 'onboarding_started'), 0),
    1
  ) as porcentaje_termina
from public.events
where name in ('onboarding_started', 'onboarding_completed');

-- Paso en el que se quedan quienes no terminan ni omiten.
with empezaron as (
  select distinct user_id
  from public.events
  where name = 'onboarding_started'
),
cerraron as (
  select distinct user_id
  from public.events
  where name in ('onboarding_completed', 'onboarding_skipped')
),
hechos as (
  select user_id, (props ->> 'step')::int as step
  from public.events
  where name = 'onboarding_step_completed'
),
abandono as (
  select
    e.user_id,
    (
      select min(n)
      from generate_series(0, 4) as n
      where not exists (
        select 1 from hechos h
        where h.user_id = e.user_id and h.step = n
      )
    ) as step
  from empezaron e
  where not exists (select 1 from cerraron c where c.user_id = e.user_id)
)
select step as paso_de_abandono, count(*) as personas
from abandono
group by step
order by step;

-- % que crea un elemento en la primera sesión (12 h desde que empezó).
with inicio as (
  select user_id, min(created_at) as started_at
  from public.events
  where name = 'onboarding_started'
  group by user_id
),
con_elemento as (
  select distinct i.user_id
  from inicio i
  join public.events ev
    on ev.user_id = i.user_id
   and ev.name = 'first_item_created'
   and ev.created_at >= i.started_at
   and ev.created_at < i.started_at + interval '12 hours'
)
select
  (select count(*) from inicio) as empezaron,
  (select count(*) from con_elemento) as crearon_en_la_primera_sesion,
  round(
    100.0 * (select count(*) from con_elemento)
    / nullif((select count(*) from inicio), 0),
    1
  ) as porcentaje;

-- Mediana del tiempo hasta el panel, solo si ya había un elemento creado.
with marcas as (
  select
    s.user_id,
    min(s.created_at) as started_at,
    min(c.created_at) as completed_at
  from public.events s
  join public.events c
    on c.user_id = s.user_id
   and c.name = 'onboarding_completed'
  where s.name = 'onboarding_started'
  group by s.user_id
),
con_datos as (
  select m.completed_at - m.started_at as duracion
  from marcas m
  where exists (
    select 1
    from public.events f
    where f.user_id = m.user_id
      and f.name = 'first_item_created'
      and f.created_at <= m.completed_at
  )
)
select
  count(*) as personas,
  percentile_cont(0.5) within group (order by extract(epoch from duracion)) as mediana_segundos
from con_datos;

-- Retorno a 7 días. Solo cuenta un evento posterior (no hay app_open).
with completaron as (
  select user_id, min(created_at) as completed_at
  from public.events
  where name = 'onboarding_completed'
  group by user_id
),
elegibles as (
  select * from completaron
  where completed_at <= pg_catalog.now() - interval '8 days'
),
volvieron as (
  select distinct e.user_id
  from elegibles e
  join public.events ev
    on ev.user_id = e.user_id
   and ev.created_at >= e.completed_at + interval '7 days'
   and ev.created_at < e.completed_at + interval '8 days'
)
select
  (select count(*) from elegibles) as elegibles,
  (select count(*) from volvieron) as volvieron,
  round(
    100.0 * (select count(*) from volvieron)
    / nullif((select count(*) from elegibles), 0),
    1
  ) as porcentaje_retorno_7_dias;

-- Aperturas de ayuda por página (el panel es la fase F2; el evento ya existe).
select props ->> 'page' as pagina, count(*) as aperturas, count(distinct user_id) as personas
from public.events
where name = 'help_opened'
group by props ->> 'page'
order by aperturas desc;
