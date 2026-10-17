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
- Base de datos: nunca editar una migración ya aplicada; crear una nueva. Después de cada migración: `pnpm db:push`, `pnpm db:types`, `pnpm test:rls` y `pnpm test:db:fresh`. Toda tabla nueva lleva RLS y tests en `supabase/tests/`. Los tipos de la base se importan desde `lib/db/types.ts`.
- Dinero: todo importe es `*_minor` (entero en unidades menores) en la moneda original de la fila, con su columna `currency`; la conversión se hace al leer con `exchange_rates`. Nunca floats.
- Una transacción compartida y sus repartos se escriben en la misma transacción de base de datos (la suma se valida al hacer COMMIT); las personales no llevan repartos.
- Next.js 16 con `cacheComponents`: lo que lee cookies, params o datos va dentro de `<Suspense>` en cada página.
