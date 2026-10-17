# Changelog

Todos los cambios relevantes de Ember Cash. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

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
