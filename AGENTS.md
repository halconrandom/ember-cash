<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Graphify (grafo del código)

Hay un grafo del repo en `graphify-out/` (skill en `.agents/skills/graphify/SKILL.md`). Antes de buscar o leer archivos, consulta el grafo con `graphify query "<tema>"`, `graphify explain "<símbolo>"` o `graphify path "<a>" "<b>"`, y lee solo los archivos que señale. Después de editar código, corre `graphify update .` (no gasta tokens).
