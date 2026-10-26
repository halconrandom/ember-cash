-- =============================================================================
-- 0030_debt_exclude_from_plan.sql
-- Deudas fuera del plan de pago.
--
-- exclude_from_plan = true saca la deuda del plan (avalancha / bola de nieve,
-- fecha "libre de deudas" y simulación de pago extra), p. ej. una hipoteca a
-- 20 años. La deuda sigue en la lista, en los totales y en el bot de Telegram
-- sin cambios. Las políticas de debts (0003) ya cubren la columna: solo el
-- dueño la ve y la cambia.
-- =============================================================================

alter table public.debts
  add column exclude_from_plan boolean not null default false;

comment on column public.debts.exclude_from_plan is
  'Fuera del plan de pago (simulación de payoff y pago extra). No cambia saldos ni totales.';
