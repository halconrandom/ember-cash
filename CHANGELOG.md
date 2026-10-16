# Changelog

Todos los cambios relevantes de Ember Cash. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.1.0] - 2026-10-16

### Añadido (fase 1: base del proyecto)

- Proyecto Next.js 16.4.2 (App Router) con TypeScript estricto, Tailwind v4, pnpm, ESLint, Prettier y Vitest.
- shadcn/ui inicializado; `motion` y `lucide-react` instalados.
- Supabase: `supabase init`, carpeta `supabase/migrations` vacía y clientes `@supabase/ssr` en `lib/supabase/client.ts` y `lib/supabase/server.ts`.
- `lib/env.ts`: validación de variables de entorno con zod al arrancar, con mensaje claro si falta alguna. `.env.example` como plantilla.
- Página inicial "Ember Cash" y ruta `GET /api/health`.
- Script `pnpm check` (lint, typecheck y tests), README con pasos para Mac y Windows, y `CLAUDE.md` con las reglas del proyecto.
