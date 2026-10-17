# Changelog

Todos los cambios relevantes de Ember Cash. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.8.2] - 2026-10-17

### Cambiado

- La barra de porcentaje pagado de las deudas usa, en oscuro, el naranja gráfico #FF7A2E (token `--debt-bar`); en claro sigue con ember-fill #C6500B.
- El test pendiente de contraste pasa a ser normal: #FF7A2E sobre la pista #3B3B40 da 4,28:1 (y 6,17:1 sobre surface2), por encima de 3:1.
- Excepción anotada en DESIGN_SPEC.md, junto a la regla del naranja como dato.

## [0.8.1] - 2026-10-17

### Cambiado

- La barra de porcentaje pagado de las deudas usa ember-fill (#C6500B en claro y oscuro), según el uso del naranja como dato de DESIGN_SPEC §1, en lugar de verde.
- Test de contraste: ember-fill sobre su pista y sobre el fondo de la fila. En claro cumple (3,88 y 4,24); en oscuro cumple contra la fila (3,48) pero queda en 2,41 contra la pista #3B3B40, por debajo de 3:1. Se documenta como pendiente.

## [0.8.0] - 2026-10-17

### Añadido (fase 8: deudas)

- Pantalla Deudas (04/14-debts.png): resumen (saldo total, mínimos mensuales, interés del mes, fecha libre de deudas), lista ordenable por vencimiento, saldo o interés, con saldo, tasa, pago mínimo, porcentaje pagado, próximo vencimiento (en rojo si faltan 10 días o menos) y "original" para deudas en otra moneda.
- Crear y editar deudas (moneda, principal original, tasa anual EA o nominal, pago mínimo, día de pago). Registrar pagos separa interés (estimado y editable) y capital, y puede crear la transacción vinculada.
- `lib/debts/payoff.ts`: simulador puro (avalancha y bola de nieve, pago extra opcional, presupuesto con efecto bola de nieve). Tasa mensual (1 + EA)^(1/12) − 1 o nominal/12, guardada con 12 decimales; interés redondeado a la unidad menor con mitades lejos de cero; aritmética entera. Detecta cuando los pagos no cubren los intereses y no entra en bucle. Tests con casos verificados a mano.
- Gráfica "Plan de pago" con selector avalancha / bola de nieve y tarjeta "Paga X extra al mes" (meses e interés ahorrados; monto sugerido editable).
- Borrado irreversible: mantener 2 s (puntero o Enter/Espacio) o dos pasos, con 6 s para deshacer (deleted_at) y borrado definitivo al vencer; el cron de purga también limpia deudas.

### Cambiado

- Los porcentajes de progreso se redondean al más cercano, como en los frames (6,8 de 12 → 57 %), sin mostrar 100 % antes de completar.

## [0.7.0] - 2026-10-17

### Añadido (fase 7: ahorros)

- Pantalla Ahorros (03/13-savings.png): tarjetas de total ahorrado, aportes mensuales y progreso total; una tarjeta por meta con anillo de progreso, ahorrado, objetivo, equivalente, mensual, restante y fecha objetivo; tarjeta punteada para crear. Subtítulo con el número de metas y el progreso total; "Nueva meta" en la topbar.
- Crear y editar metas (nombre, ícono, objetivo y moneda, fecha objetivo y aporte mensual opcionales) y registrar aportes en la moneda de la meta, opcionalmente vinculados a una transacción.
- `lib/goals/status.ts`: estado calculado (nunca guardado). "Casi lista" con 95 % o más; si no, se compara lo ahorrado con lo esperado en línea recta entre started_on y target_date. Tests para cada estado, fechas pasadas, sin fecha y fechas invertidas.
- Reglas de moneda: una meta en otra moneda se muestra convertida con "original US$ 640,00 de US$ 1.200,00"; en la misma moneda, con "≈" en la otra. Sin tasa, el original queda como principal.
- Archivar meta con toast y Deshacer; estados vacío, cargando y error.
- Primitivas: anillo y barra de progreso, campo de fecha compartido; `<MoneyAmount>` acepta sufijo ("/mes") y tamaño de la línea secundaria.
- Validación zod de metas y aportes (sin retiros: el aporte debe ser mayor que 0 y no futuro).

## [0.6.0] - 2026-10-17

### Añadido (fase 6: transacciones)

- Scope de datos (Personal por defecto, cookie `ec-scope` validada contra la membresía) que respetan todas las consultas de cuentas y transacciones. El interruptor visible llega en la fase 10.
- Pantalla Transacciones (02-transactions.png): lista agrupada por día (Hoy, Ayer, fecha), búsqueda, filtros de categoría, cuenta, moneda original y rango de fechas (este mes por defecto), pestañas Todas / Ingresos / Gastos, paginación del servidor ("Mostrando 9 de 42"), tooltip de conversión por fila y estados vacío, cargando y error. Selector de mes y "Agregar transacción" en la topbar; el subtítulo cuenta las transacciones.
- Modal agregar/editar (07/17-add-transaction.png): Gasto / Ingreso / Transferencia, monto grande con COP/USD y su conversión, categorías en chips, fecha, cuenta, "Pagó" (solo en un hogar), notas y validación ("Escribe un monto mayor que 0"). Las transferencias mueven dinero entre cuentas y no cuentan como ingreso ni gasto.
- Borrado con toast de 6 s y Deshacer (`deleted_at`); borrado definitivo al vencer el toast y cron diario `/api/cron/purge-deleted` para los que queden.
- Migración `0007_save_transaction.sql`: RPC `save_transaction` (SECURITY INVOKER) que guarda la transacción y, si es compartida, sus repartos en partes iguales en una sola transacción; tests en `supabase/tests/save_transaction.sql`.
- Cuentas en Ajustes: crear, renombrar, archivar y desarchivar. El modal ofrece crear una si no hay ninguna.
- Server Actions con validación zod (el mismo esquema que el formulario); sin service role en el cliente.
- Primitivas: chip de selección, campo de selección, buscador, área de texto y modal (Base UI Dialog).
- Tests: validación del formulario, agrupación por día, filtros, fechas, Deshacer restaura, purga.

### Cambiado

- `<MoneyAmount>` muestra el número en negrita y "COP" más pequeño, con signo y color para ingresos/gastos.
- El control segmentado es un poco más angosto (como en los frames).
- `rls_finance.sql` ya no asume que `exchange_rates` está vacía.

## [0.5.0] - 2026-10-17

### Añadido (fase 5: dinero y tasa de cambio)

- `lib/money`: tipo `Money` (`amountMinor: bigint` + moneda), suma, resta, comparación, formato exacto con Intl según el exponente (COP 0, USD 2) y parseo del input según el idioma.
- Conversión `convert(money, to, rate)` con bigint y redondeo de mitades lejos de cero; `totalIn` suma por moneda y convierte una vez con la tasa más reciente.
- `GET /api/cron/rates` protegida con `CRON_SECRET`: TRM oficial (datos.gov.co) con respaldo open.er-api; valida forma y rango y guarda en `exchange_rates` con `fetched_at` y `source`. Si ambas fuentes fallan responde 502 y conserva la última tasa. Cron diario en `vercel.json`.
- Chip de tasa en la topbar con la tasa real y sus 4 estados: fresca, vieja (más de 24 h, ámbar, clic refresca), actualizando (conserva el ancho; lo convertido baja al 60 %) y error (Reintentar; la última tasa queda en el tooltip). Sin la etiqueta SAMPLE. Sin red pasa a error.
- Selector COP/USD en la topbar que guarda `profiles.display_currency`.
- Componentes `<MoneyAmount>` (fila con "original US$ 2,99" cuando la moneda difiere; total con "≈" en la otra moneda; tooltip con tasa y fecha), `<CurrencyFilter>` ("Moneda: Todas / COP / USD", por moneda original) y `<CurrencyBadge>` neutra.
- Tests: 0, 1, 12 dígitos, negativos, redondeo COP y USD, ida y vuelta, parseo, fuentes de la tasa, ruta del cron, los 4 estados del chip y las reglas de `<MoneyAmount>`.

### Cambiado

- El formato de dinero sale de `lib/i18n/format.ts` y pasa a `lib/money/format.ts` (exacto, con bigint); `useFormat().money` recibe un `Money`.
- `tsconfig` apunta a ES2022 (literales bigint).

## [0.4.1] - 2026-10-16

### Añadido

- Internacionalización con next-intl: español (por defecto) e inglés, sin prefijos en la URL. Todas las cadenas de la UI pasan a `messages/es.json` y `messages/en.json` (shell, login, onboarding, invitación, hogar, ajustes, primitivas y `/dev/design-system`). Secciones en español: Panel, Transacciones, Ahorros, Deudas, Suscripciones, Calendario, Hogar y Ajustes.
- Migración `0006_profile_locale.sql` (el número 0005 ya estaba usado): `profiles.locale` ('es' | 'en', por defecto 'es'), con tests en `supabase/tests/profile_locale.sql`. Selector de idioma en Ajustes; el idioma del perfil se aplica al entrar desde otro dispositivo.
- Formatos según el idioma (`lib/i18n/format.ts`, `useFormat`): números y fechas con es-CO / en-US; el dinero sigue la spec (COP sin decimales, USD con 2, US$ delante y COP detrás).
- Tests: paridad de claves y variables entre idiomas, formatos, textos en español de las primitivas.
- Regla en CLAUDE.md: ninguna cadena de UI en el código; cada texto va en es y en en.

### Cambiado

- La etiqueta del ítem activo del sidebar usa ember-text, como dice DESIGN_SPEC §1 (5.10:1 en claro, 8.25:1 en oscuro; par agregado al test de contraste).
- Los errores de las RPC de hogares se traducen por clave (`householdErrorKey`).
- Textos en español neutro: "enlace" en vez de "link", "hogar" en vez de "household", bienvenida sin marca de género.

## [0.4.0] - 2026-10-16

### Añadido (fase 4: sistema de diseño y shell)

- Tokens de la spec (claro y oscuro) como variables CSS y tema de Tailwind: colores, escala tipográfica Inter (mínimo 12 px, tracking por tamaño), radios, sombras. Los valores que la spec no lista (toast, deshabilitado, control segmentado) se muestrearon de `19-states.png` / `20-states-dark.png`.
- Tema claro/oscuro/sistema por clase, sin parpadeo (script inline + cookie), sincronizado con `profiles.theme`; selector en Settings.
- `prefers-reduced-motion` (MotionConfig y CSS), `prefers-reduced-transparency` y `prefers-contrast: more`. Anillo de foco único de 2 px con offset 2 (#BD490A / #FF9552).
- `@flaticon/flaticon-uicons` 3.3.1 y componente `<Icon>` como único punto de acceso, con equivalencias en lucide-react.
- Shell según `01-dashboard.png`: sidebar de 248 px con nombres visibles, topbar de 72 px, tarjeta de usuario con engranaje. Rutas vacías: Dashboard, Transactions, Savings, Debts, Subscriptions, Calendar, Household y Settings.
- Primitivas con todos sus estados: botones, campos, chips y badges, control segmentado, filas, navegación, estado vacío, skeleton, toast con Undo (6 s, pausa con hover/foco), tooltip, chip de tasa de cambio y borrado irreversible (mantener 2 s con puntero o teclado, y dos pasos).
- `/dev/design-system` (solo en desarrollo) con todo en claro y oscuro.
- Tests: contraste de tokens (port de `docs/contrast.py`, leyendo `globals.css`), tamaño mínimo de 12 px, registro de íconos, borrado irreversible, toast y `cn` con la escala tipográfica.
- Logo del paquete `docs/design/logos` como componente y favicon (`app/icon.svg`).
- Frames de diseño, logos, `contrast.py` y `pal.py` en `docs/`.

### Cambiado

- La UI del household (fase 2) pasa de la página principal a `/household`; login, onboarding e invitación usan las primitivas nuevas. Se eliminan `components/provisional/`.
- `cn` se configura con la escala tipográfica propia para no descartar tamaños al combinarlos con colores.

## [0.3.2] - 2026-10-16

### Cambiado

- Migración `0005_transfer_splits.sql`: el trigger diferido de repartos excluye las transferencias (`kind = 'transfer'`). Una transferencia, personal o compartida, no lleva repartos ni se le exige que sumen; si trae repartos falla con `transfer_has_splits`. El trigger de `transactions` ahora también se dispara al cambiar `kind`.
- Tests: transferencia sin repartos pasa (compartida y personal), con repartos falla, convertir en transferencia un gasto con repartos falla y el gasto compartido sigue exigiendo que los repartos sumen.

## [0.3.1] - 2026-10-16

### Añadido

- Migración `0004_finance_validations.sql`:
  - CHECK en `debt_payments`: `interest_minor + principal_minor = amount_minor`.
  - Constraint trigger diferido (`DEFERRABLE INITIALLY DEFERRED`) en `transaction_splits` y `transactions`: en una transacción compartida la suma de `share_minor` debe ser igual a `amount_minor`; una transacción personal no lleva repartos. Se comprueba al hacer COMMIT, así que la transacción y sus repartos se pueden crear en sentencias separadas dentro de la misma transacción de base de datos.
- Tests para ambos casos (suma correcta pasa, suma incorrecta falla) en `supabase/tests/rls_finance.sql`.

### Cambiado

- Esquema sin cambios en importes: cada fila guarda el importe en su moneda original y la conversión se hace al leer (decisión confirmada; la sección 8 del spec no se modifica).

## [0.3.0] - 2026-10-16

### Añadido (fase 3: modelo financiero)

- Migración `0003_finance_model.sql` (el nombre `0002` ya lo usaba `0002_revoke_handle_new_user.sql`): `currencies` (COP 0, USD 2), `categories` fijas y sembradas, `exchange_rates`, `accounts`, `transactions`, `transaction_splits`, `goals`, `goal_contributions`, `debts`, `debt_payments`, `recurring_items`, `recurring_occurrences`, `budgets` y `settlements`. Todo importe es `*_minor bigint` en la moneda original de la fila.
- RLS en todas las tablas: lo personal solo lo ve y edita su owner; lo compartido, cualquier miembro del household. `owner_id` y `settlements.created_by` son inmutables; las referencias a otras filas (cuenta, meta, deuda, recurrente, transacción) deben ser visibles para quien escribe; `paid_by`, los repartos, los aportes y las liquidaciones solo pueden nombrar miembros del household.
- Catálogos y `exchange_rates` de solo lectura para usuarios (escribe el service role). Se revocan `TRUNCATE`, `REFERENCES` y `TRIGGER` a `authenticated` en todas las tablas, también las de `0001`.
- Tests SQL en `supabase/tests/rls_finance.sql` y runner `scripts/db-tests.mjs` (`pnpm test:rls`, `pnpm test:db:fresh`).
- Tipos de la base en `lib/db/database.types.ts`, expuestos con alias y uniones literales en `lib/db/types.ts`.

## [0.2.0] - 2026-10-16

### Añadido (fase 2: auth y households)

- Migración `0001_auth_households.sql`: `profiles` (con trigger que lo crea al registrarse), `households`, `household_members` y `household_invites` (solo se guarda el hash SHA-256 del token, vence a 7 días). RLS en todas las tablas, privilegios de columna recortados, `is_household_member` / `is_household_owner` SECURITY DEFINER, y RPC `create_household`, `accept_invite` (un solo uso, máximo 2 miembros vía `max_household_members()`) y `get_household_members`.
- Columna `profiles.onboarded_at` para saber si el usuario terminó el onboarding (la opción "Usar solo yo" no deja rastro en otras tablas).
- Migración `0002_revoke_handle_new_user.sql`: quita el permiso de ejecutar el trigger por RPC (lo señaló `supabase db advisors`).
- Tests RLS en `supabase/tests/rls_households.sql` (`pnpm test:rls`) con usuarios A, B y C.
- `/login` (Google y link mágico), `/auth/callback`, `/auth/confirm`, `/auth/signout`, `proxy.ts` que refresca la sesión, grupo protegido `(app)`, `/onboarding` y `/invite/[token]`. El owner genera links de invitación desde la página principal.
- Tipos de la base en `lib/supabase/database.types.ts` (`pnpm db:types`) y scripts `db:push` y `test:rls`.
- Tokens de diseño provisionales en `app/globals.css` y `components/provisional/` (los reemplaza la fase 4).

## [0.1.0] - 2026-10-16

### Añadido (fase 1: base del proyecto)

- Proyecto Next.js 16.4.2 (App Router) con TypeScript estricto, Tailwind v4, pnpm, ESLint, Prettier y Vitest.
- shadcn/ui inicializado; `motion` y `lucide-react` instalados.
- Supabase: `supabase init`, carpeta `supabase/migrations` vacía y clientes `@supabase/ssr` en `lib/supabase/client.ts` y `lib/supabase/server.ts`.
- `lib/env.ts`: validación de variables de entorno con zod al arrancar, con mensaje claro si falta alguna. `.env.example` como plantilla.
- Página inicial "Ember Cash" y ruta `GET /api/health`.
- Script `pnpm check` (lint, typecheck y tests), README con pasos para Mac y Windows, y `CLAUDE.md` con las reglas del proyecto.
