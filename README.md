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

La CLI de Supabase está instalada como dependencia de desarrollo (`pnpm exec supabase ...`). El proyecto remoto se enlaza una vez con:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref-del-proyecto>
```

| Comando         | Qué hace                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `pnpm db:push`  | Aplica las migraciones de `supabase/migrations/` al proyecto enlazado                     |
| `pnpm db:types` | Regenera `lib/supabase/database.types.ts` desde el esquema remoto                         |
| `pnpm test:rls` | Corre `supabase/tests/rls_households.sql` en una transacción con ROLLBACK (no deja datos) |

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

## Endpoints

- `GET /api/health` responde `{ "ok": true }`.
