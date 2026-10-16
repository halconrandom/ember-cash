# Ember Cash

App web de finanzas personales (después iOS). Next.js (App Router), TypeScript estricto, Tailwind, shadcn/ui, Supabase y Vitest.

El diseño está en [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) y [docs/IVERN_FIXES.md](docs/IVERN_FIXES.md).

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

La CLI de Supabase está instalada como dependencia de desarrollo, así que se usa con `pnpm exec supabase ...`. Las migraciones van en `supabase/migrations/` (por ahora vacía). Para una base local hace falta Docker: `pnpm exec supabase start`.

## Endpoints

- `GET /api/health` responde `{ "ok": true }`.
