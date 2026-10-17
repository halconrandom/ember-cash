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

|                                |                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Transacciones**              | Ingresos, gastos y transferencias entre cuentas, con categorías, notas y deshacer al borrar.                             |
| **Hogar compartido**           | Gastos a partes iguales, balance entre miembros y liquidación total o parcial. Quien se une después no debe lo anterior. |
| **Dos monedas**                | COP y USD sin perder precisión: cada monto se guarda en su moneda original y solo se convierte para mostrarlo.           |
| **Deudas**                     | Interés nominal o efectivo anual, y un simulador de pago por avalancha o bola de nieve.                                  |
| **Ahorros**                    | Metas con aportes y estado claro: en camino, atrasada o casi lista.                                                      |
| **Suscripciones y calendario** | Pagos recurrentes con vencimientos. Nada se da por pagado hasta que tú lo confirmas.                                     |
| **Presupuestos**               | Límites por categoría y mes, con aviso al acercarte al tope.                                                             |
| **Panel**                      | Balance del mes, categorías, tendencia de 6 meses y próximos pagos de un vistazo.                                        |
| **PWA**                        | Se instala en el celular y funciona con barra inferior y bottom sheets en móvil.                                         |
| **Respaldo**                   | Exporta todos tus datos en CSV desde Ajustes.                                                                            |

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

| Variable                        | Dónde se usa                    | Notas                                                                                                                    |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | cliente y servidor              | URL de tu proyecto de Supabase                                                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente y servidor              | Clave pública (`anon`)                                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | **solo servidor**               | Nunca con prefijo `NEXT_PUBLIC_` ni en el cliente                                                                        |
| `CRON_SECRET`                   | **solo servidor**               | Al menos 32 caracteres. Genera uno con `openssl rand -hex 32`                                                            |
| `TEST_DATABASE_URL`             | solo los tests de base de datos | Postgres **local** (`localhost`), base que termine en `_test`. Ver [Pruebas de base de datos](#pruebas-de-base-de-datos) |

La app valida estas variables al arrancar y te dice cuáles faltan.

Al validar, la app también se detiene si alguna variable `NEXT_PUBLIC_*` lleva un secreto (por su nombre o porque contiene una llave de servidor de Supabase), porque todo lo que empieza con `NEXT_PUBLIC_` termina en el navegador.

### Protección contra secretos

- `pnpm build` revisa, después de compilar, que nada de lo que descarga el navegador (`.next/static` y `public/`) contenga la service role, `CRON_SECRET` ni otros patrones de llaves (`scripts/check-client-bundle.mjs`). Si encuentra algo, el build falla y Vercel no publica.
- Al hacer `pnpm install`, el script `prepare` activa un hook de pre-commit (`.githooks/pre-commit`) que frena el commit si lleva archivos `.env*` (salvo `.env.example`), llaves (`*.pem`, `*.key`) o secretos en las líneas agregadas.

### Base de datos

Las migraciones están en `supabase/migrations`. Enlaza tu proyecto con la CLI de Supabase y aplícalas:

```bash
pnpm db:push
```

> Usa un proyecto de Supabase que sea tuyo. Nunca ejecutes datos de ejemplo ni pruebas destructivas contra una base con datos reales.

### Pruebas de base de datos

Los tests SQL (`supabase/tests`) corren **solo contra un Postgres local**, nunca contra Supabase. Crean usuarios y filas de prueba, y la base de pruebas se borra y se crea de nuevo en cada corrida. El script se detiene sin conectarse si `TEST_DATABASE_URL` no apunta a `localhost`, `127.0.0.1` o `::1`, si menciona Supabase o si el nombre de la base no termina en `_test`.

`supabase/tests/local-bootstrap.sql` imita lo que Supabase trae de fábrica (roles `anon`, `authenticated` y `service_role`, el esquema `auth` con `auth.users` y `auth.uid()`, y los permisos por defecto), así las migraciones se aplican tal cual. No hace falta Docker.

**Mac (Homebrew)**

```bash
brew install postgresql@17
brew services start postgresql@17      # o, sin dejarlo como servicio:
# LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 start
```

Homebrew crea un superusuario con tu usuario de macOS, sin contraseña, así que la URL no lleva credenciales:

```bash
TEST_DATABASE_URL=postgresql://localhost:5432/ember_cash_test
```

**Windows**

1. Instala PostgreSQL 17 con el instalador de [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) o con `winget install PostgreSQL.PostgreSQL.17`. Anota la contraseña del usuario `postgres` que pide el instalador.
2. El script busca `psql` en el `PATH` y en `C:\Program Files\PostgreSQL\17\bin`. Si está en otra carpeta, define `PSQL` con la ruta completa a `psql.exe`.
3. La URL lleva ese usuario y su contraseña:

```bash
TEST_DATABASE_URL=postgresql://postgres:TU_CONTRASEÑA@localhost:5432/ember_cash_test
```

**Crear la base y correr los tests**

Pon `TEST_DATABASE_URL` en `.env.local` (no es un secreto de producción; ese archivo no se sube a git) o pásala en la misma línea. No hace falta crear la base a mano: el script la borra si existe, la crea, aplica `local-bootstrap.sql` y todas las migraciones, y luego corre los tests. El usuario de la URL necesita permiso para crear bases (el de Homebrew y `postgres` en Windows lo tienen).

```bash
pnpm test:rls          # cada archivo de tests por separado
pnpm test:db:fresh     # todos los tests juntos en una sola transacción
```

Si prefieres crearla tú: `createdb ember_cash_test` (o `CREATE DATABASE ember_cash_test;` en `psql`).

## Scripts

| Comando              | Qué hace                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`           | Servidor de desarrollo                                                                                                               |
| `pnpm build`         | Compilación de producción                                                                                                            |
| `pnpm check`         | Lint, tipos y tests unitarios                                                                                                        |
| `pnpm test:rls`      | Tests SQL y de RLS contra el Postgres **local** de pruebas (cada archivo por separado)                                               |
| `pnpm test:db:fresh` | Borra y crea de nuevo **solo** la base local de pruebas (`TEST_DATABASE_URL`), aplica las migraciones y corre todos los tests juntos |

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

Es un proyecto personal, pero las ideas y los reportes son bienvenidos: abre un _issue_ describiendo qué esperabas y qué pasó. Si propones código, corre antes `pnpm check`.

## Créditos

- Iconos: [Flaticon Uicons](https://www.flaticon.com/uicons)
- Componentes animados adaptados de [Magic UI](https://magicui.design) y [Animate UI](https://animate-ui.com)

## Licencia

[MIT](LICENSE). Puedes usar, copiar y modificar el código, manteniendo el aviso de copyright.

---

<div align="center">

Hecho con cariño por [Isaac (Halcón)](https://www.linkedin.com/in/halcon-dev/)

</div>
