# Ember Cash: reglas para Claude

@AGENTS.md

## Contexto

- App web de finanzas personales (después iOS). Se construye por fases (15 en total). Haz solo la fase pedida.
- Diseño: `docs/DESIGN_SPEC.md` y `docs/IVERN_FIXES.md`. IVERN_FIXES corrige al spec donde lo indica.

## Reglas

1. **Idioma**: explica en español neutro, sin voseo (usa "tú", no "vos").
2. **Comentarios**: comenta todo el código (qué hace cada archivo, función y decisión no obvia).
3. **Commits**: haz commit al terminar cada cambio. **Nunca hagas push.**
4. **Versión y changelog**: en cada cambio sube la versión en `package.json` (SemVer) y anota el cambio en `CHANGELOG.md`.
5. **UI**: sin emojis y sin glows decorativos.
6. **Secretos**: nunca pongas secretos en el repo. Solo `.env.example` (sin valores) se versiona. `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` solo se usan en el servidor, mediante `getServerEnv()` de `lib/env.ts`.
7. **Alcance**: no avances más allá de la fase pedida.
8. **Diseño ambiguo**: si algo del diseño es ambiguo, pregunta en vez de inventar.

## Flujo

- `pnpm check` (lint, typecheck y tests) debe pasar antes de cada commit.
- La CLI de Supabase se usa con `pnpm exec supabase ...`.
- Base de datos: nunca editar una migración ya aplicada; crear una nueva. Antes de `pnpm db:push`, prueba la migración en local con `pnpm test:rls` y `pnpm test:db:fresh` (Postgres local de `TEST_DATABASE_URL`; nunca contra Supabase, que es el proyecto real). Después: `pnpm db:push` y `pnpm db:types`. Toda tabla nueva lleva RLS y tests en `supabase/tests/`. Los tipos de la base se importan desde `lib/db/types.ts`.
- Dinero: todo importe es `*_minor` (entero en unidades menores) en la moneda original de la fila, con su columna `currency`; la conversión se hace al leer con `exchange_rates`. Nunca floats.
- En código, el dinero es `Money` de `lib/money` (`amountMinor: bigint`): sumar con `add`/`sum`, convertir con `convert`/`totalIn`, mostrar con `<MoneyAmount>` o `formatMoney`, leer inputs con `parseMoney`. Nada de `number` para importes.
- Scope: toda consulta de finanzas recibe el scope (`getScope()` de `lib/scope/server.ts`; Personal por defecto, cookie `ec-scope`). Personal = `household_id` nulo; hogar = ese `household_id`.
- Las transacciones se guardan con la RPC `save_transaction` (rehace los repartos de las compartidas). Borrar es suave (`deleted_at`) con toast y Deshacer; las listas excluyen las borradas.
- El estado de una meta (Al día / Atrasada / Casi lista) se calcula con `lib/goals/status.ts`; nunca se guarda.
- El plan de pago de deudas sale de `lib/debts/payoff.ts` (función pura con tests); no dupliques esa lógica en componentes.
- Borrar algo irreversible (deudas) usa `HoldToDeleteButton` con la alternativa `TwoStepDeleteButton`, y 6 s de Deshacer antes del borrado definitivo.
- Una transacción compartida y sus repartos se escriben en la misma transacción de base de datos (la suma se valida al hacer COMMIT); las personales y las transferencias no llevan repartos.
- Miembro nuevo: ve todo el historial del hogar, pero solo comparte (y debe) los gastos con fecha igual o posterior a su ingreso (`joined_at` en la zona del perfil). Lo aplica `save_transaction`; un gasto anterior queda entero para quien pagó.
- El balance del hogar sale de `lib/household/balance.ts` (por moneda; se convierte solo para mostrar). Liquidar total guarda una fila de `settlements` por moneda con saldo y queda exactamente en 0; Deshacer borra esas filas. No dupliques esa lógica en componentes.
- Salir o quitar a un miembro solo con `leave_household` / `remove_household_member` (saldo en cero). Lo que involucra a un ex miembro queda bloqueado en la base (gastos: solo categoría y nota; liquidaciones: nada).
- Ningún vencimiento se registra solo: el cron solo marca "Vencida" (`overdue`); la única forma de crear la transacción es "Marcar como pagado" (`post_occurrence`, exige usuario, con la fecha real de pago).
- Dashboard: los totales salen de la RPC `dashboard_totals` (sumas en la base) y se calculan con `lib/dashboard/aggregate.ts`; nunca se traen transacciones para sumarlas. Cada tarjeta lee sus datos con `safe()` (error aislado) y tiene su propio `<Suspense>`.
- El interruptor Personal / Compartido se declara por ruta en `components/shell/nav.ts` (`scope: "shell"` o `"page"`).
- CSP sin nonce (`lib/security/headers.ts`): con `cacheComponents` el esqueleto prerenderizado no puede llevar nonce; un nonce, un hash o `'strict-dynamic'` en `script-src` rompe la hidratación en producción. Probar cambios de CSP con `pnpm build && pnpm start`, no solo en dev.
- Next.js 16 con `cacheComponents`: lo que lee cookies, params o datos va dentro de `<Suspense>` en cada página.

## UI

- Colores, tamaños y radios solo con los tokens de `app/globals.css` (utilidades `bg-surface`, `text-ink-2`, `text-body`, `rounded-card`...). Nada de hex sueltos ni de la variante `dark:`: el tema oscuro sale de los tokens.
- Íconos solo con `<Icon name="...">` (`components/ui/icon.tsx`). Si hace falta uno nuevo, agrégalo al registro con su equivalente de lucide-react.
- Un solo botón primario (ember-fill) por pantalla. El naranja es marca y acción; nunca categoría, miembro ni estado.
- Texto de 12 px como mínimo; montos con `tabular-nums`; nunca truncar montos ni fechas.
- Borrados reversibles: toast con Undo. Irreversibles: `HoldToDeleteButton` o `TwoStepDeleteButton`.
- Compara con `/dev/design-system` y los frames de `docs/design/` antes de dar una pantalla por terminada.

## Textos e idiomas

- Ninguna cadena de UI va escrita directo en el código: todo va en `messages/*.json` (next-intl). Cada texto nuevo se agrega en `es` y en `en` a la vez; `lib/i18n/messages.test.ts` falla si una clave existe en un idioma y no en el otro.
- La UI va en español neutro (sin voseo y, cuando se pueda, sin marcar género). El español es el idioma por defecto.
- Números y fechas con `useFormat()` / `lib/i18n/format.ts` (separadores según el idioma). El dinero sigue la spec: COP sin decimales, USD con 2, nunca floats para calcular.
- Sin prefijos de idioma en la URL: el idioma vive en la cookie `ec-locale` y en `profiles.locale`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
