# Ember Cash

App web de finanzas personales (después iOS). Next.js (App Router), TypeScript estricto, Tailwind, shadcn/ui, Supabase y Vitest.

El diseño está en [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) y [docs/IVERN_FIXES.md](docs/IVERN_FIXES.md); los frames de referencia y los logos, en [docs/design/](docs/design/).

## Requisitos

- **Node.js 24 LTS** (mínimo 20.9). El archivo `.nvmrc` fija la versión 24.
- **pnpm** (la versión exacta está en `packageManager` de `package.json`).
- **Git**.

## Puesta en marcha en Mac

```bash
# 1. Instalar Node 24 (con nvm; o descárgalo de https://nodejs.org)
brew install nvm         # o sigue https://github.com/nvm-sh/nvm
nvm install 24 && nvm use 24

# 2. Activar pnpm (viene con Node a través de corepack)
corepack enable pnpm
pnpm -v

# 3. Instalar dependencias
pnpm install

# 4. Crear el archivo de entorno y completar los valores
cp .env.example .env.local

# 5. Correr la app
pnpm dev                 # abre http://localhost:3000
```

## Puesta en marcha en Windows (PowerShell)

```powershell
# 1. Instalar Node 24 LTS
winget install OpenJS.NodeJS.LTS
# (o usa nvm-windows: https://github.com/coreybutler/nvm-windows  ->  nvm install 24; nvm use 24)

# 2. Activar pnpm (abre PowerShell como administrador para este paso)
corepack enable pnpm
# Si corepack falla:  npm install -g pnpm
pnpm -v

# 3. Instalar dependencias
pnpm install

# 4. Crear el archivo de entorno y completar los valores
copy .env.example .env.local

# 5. Correr la app
pnpm dev                 # abre http://localhost:3000
```

## Variables de entorno

| Variable                        | Dónde se usa       | Descripción                                                    |
| ------------------------------- | ------------------ | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | cliente y servidor | URL del proyecto de Supabase                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente y servidor | Anon key pública de Supabase                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | **solo servidor**  | Llave con permisos totales. Nunca en el cliente                |
| `CRON_SECRET`                   | **solo servidor**  | Secreto para autenticar los cron jobs (`openssl rand -hex 32`) |

`lib/env.ts` las valida con zod al arrancar. Si falta alguna, `pnpm dev` se detiene y dice cuál falta. `.env.local` está ignorado por git; solo `.env.example` se versiona.

## Scripts

| Comando                             | Qué hace                                                   |
| ----------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                          | Servidor de desarrollo                                     |
| `pnpm build` / `pnpm start`         | Build y servidor de producción                             |
| `pnpm check`                        | Lint + typecheck + tests (debe pasar antes de cada commit) |
| `pnpm lint`                         | ESLint                                                     |
| `pnpm typecheck`                    | `tsc --noEmit`                                             |
| `pnpm test` / `pnpm test:watch`     | Vitest                                                     |
| `pnpm format` / `pnpm format:check` | Prettier                                                   |

## Supabase

La CLI de Supabase está instalada como dependencia de desarrollo (`pnpm exec supabase ...`). Desarrollo y producción usan el mismo proyecto. Se enlaza una vez y no se cambia de ref:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref-del-proyecto>
```

| Comando             | Qué hace                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm db:push`      | Pide el ref del proyecto enlazado y, si coincide, aplica las migraciones. No carga el seed                 |
| `pnpm db:seed:demo` | Se niega a correr. Ese proyecto guarda los datos reales                                                     |
| `pnpm db:types`     | Regenera `lib/db/database.types.ts` desde el esquema remoto                                                 |
| `pnpm test:rls`     | Corre `supabase/tests/*.sql` en una transacción con ROLLBACK (no deja datos)                               |

Reglas: una migración ya aplicada no se edita; los cambios van en una migración nueva. Después de cada migración, corre `pnpm db:types`, `pnpm test:rls` y `pnpm test:db:fresh`.

### Auth

- Login con Google y con link mágico por correo (`/login`).
- `/auth/callback` recibe el retorno de Google; `/auth/confirm` recibe el link mágico (la plantilla de correo de Supabase debe apuntar a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`).
- `proxy.ts` (el antiguo middleware) refresca la sesión y manda a `/login` a quien no tenga sesión.
- Después del primer login, `/onboarding` ofrece: usar la app solo, crear un household o unirse con una invitación (`/invite/<token>`).

## Sistema de diseño

- Tokens claro y oscuro en [app/globals.css](app/globals.css), expuestos como utilidades de Tailwind (`bg-surface`, `text-ink-2`, `text-headline`, `rounded-card`...). Los componentes usan solo estos tokens, no la variante `dark:`.
- Tema por clase en `<html>` (`light` / `dark`), resuelto antes de pintar desde la cookie `ec-theme` y guardado en `profiles.theme` (Settings > Appearance).
- Primitivas en [components/ui/](components/ui/); íconos solo con `<Icon name="...">` ([components/ui/icon-registry.ts](components/ui/icon-registry.ts) permite cambiar a lucide-react).
- `/dev/design-system` (solo en desarrollo) muestra todo en claro y oscuro para comparar con `docs/design/10-design-system.png`, `19-states.png` y `20-states-dark.png`.
- `lib/design/contrast.test.ts` (port de `docs/contrast.py`) falla si algún par de tokens baja del ratio de la spec.

## Idiomas

- next-intl con español (`es`, por defecto) e inglés (`en`). Textos en [messages/es.json](messages/es.json) y [messages/en.json](messages/en.json).
- Sin prefijos en la URL: el idioma sale de la cookie `ec-locale` y se guarda en `profiles.locale` (Ajustes > Apariencia > Idioma).
- Formatos en [lib/i18n/format.ts](lib/i18n/format.ts): números y fechas según el idioma; dinero según la spec (COP sin decimales, USD con 2).

## Dinero y tasa de cambio

- [lib/money](lib/money/): `Money` con `bigint`, formato exacto (COP sin decimales, USD con 2), parseo del input y conversión con redondeo de mitades lejos de cero.
- La tasa USD/COP se guarda en `exchange_rates`. `GET /api/cron/rates` (con `Authorization: Bearer $CRON_SECRET`) trae la TRM oficial de datos.gov.co y, si falla, usa open.er-api.com. Si las dos fallan no escribe nada.
- [vercel.json](vercel.json) programa el cron todos los días a las 13:00 UTC (8:00 en Bogotá). Para correrlo a mano en local:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/rates
  ```

## Endpoints

- `GET /api/health` responde `{ "ok": true }`.
- `GET /api/cron/rates` actualiza la tasa (requiere `CRON_SECRET`).
- `GET /api/cron/occurrences` materializa los vencimientos (requiere `CRON_SECRET`).
- `GET /api/cron/purge-deleted` borra de forma definitiva las transacciones y deudas marcadas como borradas hace más de un día (requiere `CRON_SECRET`).
- `GET /settings/export` (con sesión) descarga un ZIP de CSV con los datos visibles para esa cuenta.

## Producción

Desarrollo y producción usan el mismo proyecto de Supabase. El ref enlazado (`supabase/.temp/project-ref`) es ese proyecto. `pnpm db:push` escribe ahí las migraciones, por eso pide que escribas el ref antes de continuar. `pnpm db:seed:demo` se niega a correr contra él.

### Dónde va cada variable

En Vercel: Project, Settings, Environment Variables, entorno **Production**. Los mismos tres valores de Supabase van en `.env.local`. Los cron solo corren en el deploy de producción.

| Variable | Dónde se copia el valor | Dónde se pega |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Project Settings, API, Project URL | `.env.local` y Vercel, entorno Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La misma pantalla, clave `anon` `public` | `.env.local` y Vercel, entorno Production |
| `SUPABASE_SERVICE_ROLE_KEY` | La misma pantalla, clave `service_role` (secreta) | `.env.local` y Vercel, entorno Production. Nunca con prefijo `NEXT_PUBLIC_`. Nunca en el cliente |
| `CRON_SECRET` | Lo generas tú: `openssl rand -hex 32`. No sale de Supabase | `.env.local` y Vercel, entorno Production. Vercel lo envía solo en los cron, como `Authorization: Bearer <CRON_SECRET>` |

### Supabase

1. Authentication, URL Configuration: Site URL `https://<tu-dominio>`. En Redirect URLs agrega `https://<tu-dominio>/auth/callback`, `https://<tu-dominio>/auth/confirm`, `http://localhost:3000/auth/callback` y `http://localhost:3000/auth/confirm`.
2. Activa Google (el callback de Google es el de Supabase, `https://<ref>.supabase.co/auth/v1/callback`) y la plantilla del magic link apunta a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
3. Con el proyecto ya enlazado, aplica las migraciones y comprueba el RLS:

```bash
pnpm db:push
pnpm exec supabase db query --linked -f supabase/tests/rls_enabled.sql
```

`pnpm db:push` no sigue hasta que escribes el ref del proyecto. `rls_enabled.sql` tiene que imprimir `OK: RLS activo en todas las tablas de public`. No deja datos.

### Vercel

Importa el repositorio. El archivo `vercel.json` ya declara los cron (UTC, una vez al día; en el plan Hobby la hora puede moverse dentro de esa hora):

| Ruta | Schedule | Qué hace |
| --- | --- | --- |
| `/api/cron/rates` | `0 13 * * *` | Tasa USD/COP (13:00 UTC, 08:00 en Bogotá) |
| `/api/cron/purge-deleted` | `30 13 * * *` | Borrado definitivo de lo que lleva más de un día en la papelera |
| `/api/cron/occurrences` | `45 13 * * *` | Vencimientos de suscripciones y deudas |

Sin `CRON_SECRET` en Production, Vercel llama esas rutas y responden 401. No hace falta otro header.
