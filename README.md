<div align="center">

<img src="public/icons/icon-192.png" alt="Ember Cash" width="88" height="88" />

# Ember Cash

**Las finanzas del hogar, claras y compartidas.**
Gastos, deudas, ahorros y suscripciones en un solo lugar, para ti o para dos.

[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Idiomas](https://img.shields.io/badge/idiomas-ES%20%7C%20EN-C6500B)](#idiomas)

[Demo](https://cash.halcon.dev) · [Características](#características) · [Empezar](#empezar-en-local) · [Arquitectura](#arquitectura)

</div>

---

## Qué es

Ember Cash es una app web para llevar las cuentas de la casa sin hojas de cálculo. Cada persona tiene su espacio personal y, si quiere, comparte un **hogar** con su pareja o con quien viva: los gastos compartidos se reparten solos y el balance de quién debe a quién siempre está al día.

Está pensada para uso real en Colombia: maneja **pesos (COP) y dólares (USD)** a la vez, con la tasa de cambio oficial del día.

## Características

| | |
|---|---|
| **Transacciones** | Ingresos, gastos y transferencias entre cuentas, con categorías, notas y deshacer al borrar. |
| **Hogar compartido** | Gastos a partes iguales, balance entre miembros y liquidación total o parcial. Quien se une después no debe lo anterior. |
| **Dos monedas** | COP y USD sin perder precisión: cada monto se guarda en su moneda original y solo se convierte para mostrarlo. |
| **Deudas** | Interés nominal o efectivo anual, y un simulador de pago por avalancha o bola de nieve. |
| **Ahorros** | Metas con aportes y estado claro: en camino, atrasada o casi lista. |
| **Suscripciones y calendario** | Pagos recurrentes con vencimientos. Nada se da por pagado hasta que tú lo confirmas. |
| **Presupuestos** | Límites por categoría y mes, con aviso al acercarte al tope. |
| **Panel** | Balance del mes, categorías, tendencia de 6 meses y próximos pagos de un vistazo. |
| **PWA** | Se instala en el celular y funciona con barra inferior y bottom sheets en móvil. |
| **Respaldo** | Exporta todos tus datos en CSV desde Ajustes. |

## Principios de diseño

- **Claridad antes que adorno.** Sin brillos decorativos ni animaciones gratuitas.
- **Accesible.** Contraste verificado con tests (WCAG), objetivos táctiles de 44 px y respeto a `prefers-reduced-motion`.
- **Dinero exacto.** Montos enteros en unidades menores (`bigint`), nunca decimales flotantes.
- **Tus datos, tu hogar.** Cada fila está protegida con Row Level Security en la base de datos.

## Stack

- **Framework:** Next.js (App Router) con TypeScript estricto
- **Interfaz:** Tailwind CSS, shadcn/ui y `motion`
- **Datos y auth:** Supabase (Auth + Postgres con RLS)
- **Idiomas:** next-intl, español (por defecto) e inglés
- **Despliegue:** Vercel, con tareas programadas para tasas, borrado definitivo y vencimientos
- **Pruebas:** Vitest y pruebas SQL contra Postgres para RLS y reglas de dinero

## Empezar en local

Necesitas **Node.js 20+**, **pnpm** y un proyecto de Supabase.

```bash
git clone https://github.com/halconrandom/ember-cash.git
cd ember-cash
pnpm install
cp .env.example .env.local   # completa tus valores
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Variables de entorno

| Variable | Dónde se usa | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | URL de tu proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente y servidor | Clave pública (`anon`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | Nunca con prefijo `NEXT_PUBLIC_` ni en el cliente |
| `CRON_SECRET` | **solo servidor** | Genera uno con `openssl rand -hex 32` |

La app valida estas variables al arrancar y te dice cuáles faltan.

### Base de datos

Las migraciones están en `supabase/migrations`. Enlaza tu proyecto con la CLI de Supabase y aplícalas:

```bash
pnpm db:push
```

> Usa un proyecto de Supabase que sea tuyo. Nunca ejecutes datos de ejemplo ni pruebas destructivas contra una base con datos reales.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compilación de producción |
| `pnpm check` | Lint, tipos y tests unitarios |
| `pnpm test:rls` | Pruebas de políticas RLS |
| `pnpm test:db:fresh` | Recrea una base local de prueba y valida migraciones |

## Arquitectura

```
app/            Rutas, pantallas y APIs (App Router)
components/     Componentes de interfaz
lib/            Dinero, divisas, balance del hogar, recurrencias, env
messages/       Textos en es.json y en.json
supabase/       Migraciones y pruebas SQL
```

Decisiones clave:

- **Un solo modelo de recurrencia** para suscripciones y pagos mínimos de deuda.
- **Repartos creados en la base** (`save_transaction`) en una sola operación, con una restricción que garantiza que la suma de los repartos iguala el monto.
- **Borrado suave** con deshacer, depurado por un cron.
- **Sin cobros automáticos:** el cron solo marca lo vencido. Registrar un pago es siempre una acción tuya.
- **CSP sin nonce** (`'unsafe-inline'`) por la incompatibilidad actual entre PPR y nonce en Next 16.

## Idiomas

La interfaz está en español e inglés. Los textos viven en `messages/es.json` y `messages/en.json`; no hay cadenas fijas en los componentes.

## Contribuir

Es un proyecto personal, pero las ideas y los reportes son bienvenidos: abre un *issue* describiendo qué esperabas y qué pasó. Si propones código, corre antes `pnpm check`.

## Créditos

- Iconos: [Flaticon Uicons](https://www.flaticon.com/uicons)
- Componentes animados adaptados de [Magic UI](https://magicui.design) y [Animate UI](https://animate-ui.com)

## Licencia

[MIT](LICENSE). Puedes usar, copiar y modificar el código, manteniendo el aviso de copyright.

---

<div align="center">

Hecho con cariño por [Isaac (Halcón)](https://www.linkedin.com/in/halcon-dev/)

</div>
