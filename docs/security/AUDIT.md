# Auditoría de seguridad de Ember Cash

Estado: **Fase 0, reporte (solo lectura).** Nada de lo que sigue está corregido todavía. Cada hallazgo indica en qué fase se corrige.

- Fecha: 17 de octubre de 2026. Versión auditada: 0.14.2 (commit `cff807d`).
- Producción: https://cash.halcon.dev (Vercel). Un solo proyecto de Supabase, el real, para desarrollo y producción.

## Método

- **Código:** revisión de todo el repositorio (app, lib, components, proxy, migraciones, tests SQL, scripts, service worker y configuración).
- **Secretos:** se buscó en todo el historial de git (`git log --all -p`, 28 commits de todas las ramas, incluidos los archivos borrados) el valor real de `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` y la anon key de `.env.local`. Se comparó por coincidencia exacta sin imprimir los valores. También se buscaron patrones genéricos: JWT (`eyJhbGciOi…`), `sb_secret_`, `sb_publishable_`, `sk_live_`, `AKIA…` y llaves privadas PEM. Lo mismo se hizo sobre el bundle del cliente (`.next/static`) y `public/`.
- **Base de datos:** consultas **solo de lectura** (`SELECT` sobre `pg_class`, `pg_policies`, `pg_proc` y `has_*_privilege`) al proyecto enlazado. No se escribió nada, no se corrió ningún test SQL y no se creó ningún usuario.
- **Cabeceras:** medidas con `pnpm build` y `next start` en local, con `curl`.
- **Dependencias:** `pnpm audit`.
- **Severidad:** Crítica, Alta, Media, Baja o Informativa, según impacto y facilidad de explotación en este despliegue.

## Resumen

| Severidad   | Cantidad | Hallazgos              |
| ----------- | -------: | ---------------------- |
| Crítica     |        0 |                        |
| Alta        |        1 | A-01                   |
| Media       |        4 | M-01, M-02, M-03, M-04 |
| Baja        |        9 | B-01 a B-09            |
| Informativa |        7 | I-01 a I-07            |

No se encontraron secretos filtrados ni acceso entre hogares o usuarios distintos. Los hallazgos son de defensa en profundidad, de integridad dentro de un mismo hogar y de operación.

| ID   | Severidad   | Área             | Título                                                                              | Fase |
| ---- | ----------- | ---------------- | ----------------------------------------------------------------------------------- | ---- |
| A-01 | Alta        | Operación / BD   | Los tests de base de datos corren contra el proyecto real                           | 3    |
| M-01 | Media       | Cabeceras        | `connect-src` acepta cualquier proyecto `*.supabase.co`                             | 5    |
| M-02 | Media       | Sesiones         | Cookies de sesión sin `httpOnly` ni `Secure` explícito                              | 5    |
| M-03 | Media       | RLS (integridad) | Un miembro puede alterar repartos, liquidaciones y aportes del otro                 | 3    |
| M-04 | Media       | Rate limiting    | Sin límites en exportación, acciones de escritura e invitaciones                    | 4    |
| B-01 | Baja        | Fugas            | Cabecera `X-Powered-By: Next.js`                                                    | 2    |
| B-02 | Baja        | Secretos         | `CRON_SECRET` acepta un valor de 1 carácter                                         | 1    |
| B-03 | Baja        | Rate limiting    | Varias peticiones a la vez a las fuentes de la tasa cuando está vieja               | 4    |
| B-04 | Baja        | Validación       | `createInviteLink` sin zod y con el origen tomado de `x-forwarded-host`             | 3    |
| B-05 | Baja        | Cabeceras        | `img-src` permite `*.googleusercontent.com` sin uso                                 | 5    |
| B-06 | Baja        | Cabeceras        | `Permissions-Policy` deja abiertas funciones que la app no usa                      | 5    |
| B-07 | Baja        | RLS              | Dos funciones SECURITY DEFINER responden sobre ids ajenos                           | 3    |
| B-08 | Baja        | Dependencias     | `braces` vulnerable (alta en `pnpm audit`) vía la CLI de shadcn                     | 5    |
| B-09 | Baja        | Validación       | Parámetros booleanos y de texto sin validar en algunas acciones                     | 3    |
| I-01 | Informativa | Fugas            | Los cron devuelven el texto del error a quien ya tiene el secreto                   | 2    |
| I-02 | Informativa | Cabeceras        | HSTS sin `preload` (decisión documentada)                                           | 5    |
| I-03 | Informativa | Sesiones         | La exportación usa `getSession()` después de `getUser()`                            | 5    |
| I-04 | Informativa | Operación        | En fases anteriores las pruebas E2E crearon usuarios temporales en el proyecto real | 3    |
| I-05 | Informativa | RLS              | `rls_auto_enable` y `max_household_members` se pueden ejecutar como anon            | 3    |
| I-06 | Informativa | Cabeceras        | CSP con `'unsafe-inline'` en scripts (decisión tomada)                              | 5    |
| I-07 | Informativa | Supabase Auth    | Ajustes del panel de Supabase que no se pueden ver desde el código                  | 4, 6 |

---

## Hallazgos

### A-01. Los tests de base de datos corren contra el proyecto real (Alta)

- **Dónde:**
  - `scripts/db-tests.mjs:33` ejecuta cada archivo con `supabase db query --linked`.
  - `scripts/db-tests.mjs:61-78` (modo `--fresh`) hace `drop table public.<cada tabla> cascade`, borra las funciones y el trigger `on_auth_user_created` de `auth.users`, vuelve a aplicar las migraciones y corre todos los tests. Todo dentro de una transacción que termina en `ROLLBACK`.
  - `CLAUDE.md:25` manda correr `pnpm test:rls` y `pnpm test:db:fresh` después de cada migración.
  - `README.md:102` describe `test:db:fresh` como "Recrea una base local de prueba", y no lo es.
- **Qué puede pasar:** no lo explota un atacante; es un riesgo operativo sobre los datos reales.
  - Mientras corre `--fresh`, la transacción toma bloqueos `ACCESS EXCLUSIVE` sobre todas las tablas de `public`. La app real se queda esperando, y los usuarios ven errores o tiempos agotados.
  - Los tests insertan filas en `auth.users` y en las tablas reales. Se deshacen con el ROLLBACK, pero las secuencias avanzan y los triggers de `auth.users` corren.
  - Si alguien edita el script y quita el `rollback;`, o si la CLI cambiara y confirmara cada sentencia, se borrarían todas las tablas de producción.
- **Corrección propuesta (fase 3):**
  1. Bloquear los scripts contra el proyecto real: abortar si no hay una base local configurada (por ejemplo, `TEST_DATABASE_URL` hacia `localhost`).
  2. Correr los tests contra un Postgres local sin Docker. Dos opciones:
     - Postgres.app o `brew install postgresql@17`, con un esquema mínimo que imite lo de Supabase que usan las migraciones: esquema `auth` con `auth.users` y `auth.uid()`, y los roles `anon`, `authenticated` y `service_role`.
     - PGlite (Postgres en WebAssembly, paquete npm, sin instalar nada en el sistema) con el mismo esquema mínimo.
  3. Corregir CLAUDE.md y README.
- **Mientras tanto:** en esta auditoría no se ejecutaron esos scripts.

### M-01. `connect-src` acepta cualquier proyecto `*.supabase.co` (Media)

- **Dónde:** `lib/security/headers.ts:25`. A `connect-src` se agregan `https://*.supabase.co` y `wss://*.supabase.co`, además del origen exacto del proyecto. Medido en la build de producción:
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://ydxqaxyloyhlovhwjpcj.supabase.co wss://ydxqaxyloyhlovhwjpcj.supabase.co`.
- **Cómo se explota:** con `'unsafe-inline'` en scripts (decisión tomada), `connect-src` es la barrera principal contra la exfiltración. Si alguna vez entrara un script inyectado, podría enviar datos con `fetch` a un proyecto de Supabase del atacante (`https://atacante.supabase.co`), porque el comodín lo permite.
- **Corrección (fase 5):** dejar solo `'self'` y el origen exacto del proyecto (https y wss), ya calculados en `supabaseConnectSources`. Agregar un test que prohíba comodines en `connect-src`.

### M-02. Cookies de sesión sin `httpOnly` ni `Secure` explícito (Media)

- **Dónde:** `lib/supabase/server.ts:29` y `lib/supabase/proxy.ts:59` no pasan `cookieOptions`, así que rigen los valores por defecto de `@supabase/ssr`. Están en `node_modules/@supabase/ssr/dist/main/utils/constants.js`: `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 días }`, sin `secure`.
- **Cómo se explota:** el access token y el refresh token se pueden leer desde JavaScript (`document.cookie`). Un XSS (más probable con `'unsafe-inline'`) podría robar la sesión completa y usarla desde otra máquina hasta 400 días con el refresh token. Sin `Secure`, la cookie podría viajar por http en una primera visita sin HSTS.
- **Por qué se puede corregir:** el cliente de Supabase en el navegador solo se usa en `app/login/login-form.tsx`, para iniciar OAuth o el enlace mágico. La sesión se crea en el servidor (`/auth/callback` y `/auth/confirm`), así que las cookies de sesión pueden ser `httpOnly`.
- **Corrección (fase 5):** `cookieOptions: { httpOnly: true, secure: producción, sameSite: "lax" }` en los clientes de servidor y del proxy. Verificar que el login con Google y con enlace mágico siga funcionando con `next start`. El verificador PKCE lo escribe el navegador y no puede ser `httpOnly`; no es una sesión.

### M-03. Un miembro puede alterar repartos, liquidaciones y aportes del otro (Media)

No hay acceso entre hogares distintos. Esto pasa **dentro** de un mismo hogar, entre sus dos miembros.

- **Dónde:**
  - `supabase/migrations/0003_finance_model.sql:485`: `transaction_splits` permite insertar, editar y borrar repartos de cualquier transacción visible. La única condición es que `user_id` sea miembro, y el trigger diferido solo exige que la suma sea el monto.
  - `0003_finance_model.sql:525` y `:533`: cualquier miembro puede editar y borrar cualquier liquidación del hogar, no solo las suyas.
  - `0003_finance_model.sql:495`: en una meta compartida, `goal_contributions.user_id` puede ser cualquier miembro.
  - `0003_finance_model.sql:510`: `recurring_occurrences` permite a los miembros cambiar `status` y `transaction_id` directamente, sin pasar por `post_occurrence`.
- **Cómo se explota:** con el token de su sesión, un miembro llama a PostgREST directamente (`/rest/v1/...`) en lugar de usar la app.
  - Registra un gasto compartido que pagó él y cambia los repartos a 0 para él y 100 % para el otro. El balance dice que el otro le debe todo el monto.
  - Borra la liquidación que el otro registró. La deuda reaparece.
  - Registra un aporte a la meta compartida a nombre del otro.
- **Corrección (fase 3), en una migración nueva:**
  - Repartos solo a través de `save_transaction` y `post_occurrence`: sin insert, update ni delete directos para `authenticated`, o una política que exija reparto equitativo.
  - Editar y borrar una liquidación solo para quien la creó (`created_by = auth.uid()`).
  - `goal_contributions.user_id = auth.uid()` al insertar.
  - Cambios de estado de un vencimiento solo por RPC.
  - Pruebas SQL para cada caso.

### M-04. Sin límites en exportación, acciones de escritura e invitaciones (Media)

- **Dónde:**
  - `app/(app)/(shell)/settings/export/route.ts:15`: cada llamada lee 15 tablas completas.
  - Todas las server actions de escritura (lista en la fase 4).
  - `app/(app)/(shell)/household/actions.ts:42` (`createInviteLink`): invitaciones sin límite.
  - `supabase/migrations/0001_auth_households.sql:215` (`create_household`): hogares sin límite por usuario.
- **Cómo se explota:** un usuario autenticado, o un script con su cookie, repite la exportación o crea miles de filas e invitaciones. Consume la cuota del plan gratuito de Supabase y de Vercel (denegación de servicio para todos, porque hay un solo proyecto) y llena tablas.
- **Ya bien:**
  - `accept_invite`: 8 intentos en 15 minutos por usuario (migración 0013).
  - `refreshRate`: tiene una espera de 15 minutos.
  - El login, el enlace mágico y el OTP los limita Supabase Auth, con los valores del panel (ver I-07).
- **Corrección (fase 4):** límites con ventana deslizante, respuesta 429 con `Retry-After` y textos en es y en. La opción (tabla en Postgres o Upstash) queda para confirmar.

### B-01. Cabecera `X-Powered-By: Next.js` (Baja)

- **Dónde:** `next.config.ts` no define `poweredByHeader: false`. Medido en `next start`: `X-Powered-By: Next.js`.
- **Cómo se explota:** le dice a un atacante qué framework atacar. No revela la versión.
- **Corrección (fase 2):** `poweredByHeader: false` y un test.

### B-02. `CRON_SECRET` acepta un valor de 1 carácter (Baja)

- **Dónde:** `lib/env-server.ts:16`, `CRON_SECRET: z.string().min(1)`.
- **Cómo se explota:** si alguien configura un secreto corto en Vercel, `/api/cron/*` se puede adivinar por fuerza bruta (por ejemplo, forzar `purge-deleted` o consultas a las fuentes de la tasa). La comparación ya es en tiempo constante.
- **Corrección (fase 1):** exigir al menos 32 caracteres (`openssl rand -hex 32` da 64) y un test.

### B-03. Varias peticiones a la vez a las fuentes de la tasa cuando está vieja (Baja)

- **Dónde:** `lib/money/actions.ts:22-31`. La espera de 15 minutos se mira antes de pedir, pero no hay bloqueo: si la tasa está vieja y llegan N peticiones a la vez, las N consultan las fuentes externas (datos.gov.co y open.er-api.com) y escriben con la service role.
- **Cómo se explota:** varias pestañas, o un script con sesión, pulsando "Reintentar" a la vez. Puede llevar a que las fuentes bloqueen la IP de Vercel.
- **Corrección (fase 4):** un bloqueo (`pg_try_advisory_lock` o una fila con `locked_until`) y un límite por usuario.

### B-04. `createInviteLink` sin zod y con el origen tomado de `x-forwarded-host` (Baja)

- **Dónde:** `app/(app)/(shell)/household/actions.ts:42`. `householdId` no se valida con zod (lo frena RLS, pero el borde no se valida). En `:61-63`, el enlace se arma con `x-forwarded-host` o `host` de la petición.
- **Cómo se explota:** en Vercel, `x-forwarded-host` lo pone la plataforma, así que hoy no se puede falsificar. Detrás de otro proxy que lo dejara pasar, se podría generar un enlace de invitación a un dominio ajeno. Solo lo ve quien administra el hogar.
- **Corrección (fase 3):** validar con `z.uuid()` y tomar el origen de una variable de configuración (por ejemplo `APP_URL=https://cash.halcon.dev`), con la petición solo como respaldo en desarrollo.

### B-05. `img-src` permite `*.googleusercontent.com` sin uso (Baja)

- **Dónde:** `lib/security/headers.ts:57`.
- **Cómo se explota:** es otro canal de salida para un script inyectado: una imagen hacia un recurso de `googleusercontent.com`. La app no muestra imágenes de perfil (el avatar usa iniciales).
- **Corrección (fase 5):** quitarlo y dejar `'self' data: blob:`.

### B-06. `Permissions-Policy` deja abiertas funciones que la app no usa (Baja)

- **Dónde:** `lib/security/static-headers.ts:24`. Solo niega `camera`, `microphone`, `geolocation`, `payment` y `usb`.
- **Corrección (fase 5):** negar también lo demás que no se usa (`accelerometer`, `autoplay`, `bluetooth`, `browsing-topics`, `display-capture`, `fullscreen`, `gyroscope`, `hid`, `magnetometer`, `midi`, `screen-wake-lock`, `serial`, `xr-spatial-tracking`, entre otras) y fijarlo con un test.

### B-07. Dos funciones SECURITY DEFINER responden sobre ids ajenos (Baja)

- **Dónde:**
  - `0003_finance_model.sql:573` da `EXECUTE` sobre `household_has_member(hid, uid)` a `authenticated`.
  - `0010_household_leave.sql:211` hace lo mismo con `transaction_has_former_member(tid)`.

  Las dos son SECURITY DEFINER y no comprueban que quien llama sea miembro.

- **Cómo se explota:** cualquier usuario autenticado puede preguntar si el usuario X es miembro del hogar Y, o si la transacción Z incluye a un ex miembro. Hace falta conocer los UUID (no se pueden adivinar), así que el riesgo es bajo.
- **Corrección (fase 3):** que devuelvan `false` si quien llama no es miembro, o quitarles `EXECUTE` a `authenticated` (las políticas RLS las llaman igual, porque se evalúan con los permisos del dueño).

### B-08. `braces` vulnerable (alta en `pnpm audit`) vía la CLI de shadcn (Baja)

- **Dónde:** `pnpm audit` reporta `braces <= 3.0.3`, GHSA-vfj7-8cjw-p6xm, por la ruta `shadcn > fast-glob > micromatch > braces`. `shadcn` está en `dependencies` porque `app/globals.css:18` importa `shadcn/tailwind.css`.
- **Cómo se explota:** es una denegación de servicio con patrones glob anidados. Solo la usa la CLI de shadcn en desarrollo; no corre en el servidor ni en el navegador, y ningún usuario controla esos patrones. Por eso es Baja, aunque `pnpm audit` diga "high". No hay versión corregida.
- **Corrección (fase 5):** mover `shadcn` a `devDependencies` (el CSS se resuelve en el build, y Vercel instala las de desarrollo para compilar), o fijar un `override` cuando salga el parche. Documentar el motivo.

### B-09. Parámetros booleanos y de texto sin validar en algunas acciones (Baja)

- **Dónde:**
  - `app/(app)/(shell)/savings/actions.ts:68` (`setGoalArchived(id, archived)`): `archived` no se valida. Una cadena `"false"` cuenta como verdadera y archiva la meta.
  - `lib/accounts/actions.ts:71` (`setAccountArchived`): igual.
  - `setRecurringStatus` y otras sí validan con zod.
- **Cómo se explota:** solo sobre filas propias (RLS). Es robustez, no acceso indebido.
- **Corrección (fase 3):** esquema zod estricto en todos los parámetros de todas las server actions, con `z.boolean()` y `.strict()` en objetos, y un test que recorra la lista de acciones.

### I-01. Los cron devuelven el texto del error a quien ya tiene el secreto (Informativa)

- **Dónde:**
  - `app/api/cron/purge-deleted/route.ts:27` y `:29` devuelven `tx.error.message`.
  - `app/api/cron/rates/route.ts:28-31` devuelve `details` con los errores de las fuentes.
- Solo se ven después de pasar `CRON_SECRET`.
- **Corrección (fase 2):** respuesta genérica, y el detalle a `console.error`.

### I-02. HSTS sin `preload` (Informativa)

- **Dónde:** `lib/security/static-headers.ts:32`: `max-age=63072000; includeSubDomains`. Sin `preload`, a propósito; el comentario explica que quitarlo después es lento.
- **Fase 5:** decidir si se agrega. `preload` afecta a todo `halcon.dev` y sus subdominios, no solo a `cash.`.

### I-03. La exportación usa `getSession()` después de `getUser()` (Informativa)

- **Dónde:** `app/(app)/(shell)/settings/export/route.ts:18`.
- **Por qué está bien:** la autorización ya la hizo `requireUser()` con `getUser()` (validado contra Auth) en la línea 16. `getSession()` solo saca el token para llamar a PostgREST con RLS. Las demás decisiones del servidor usan `getUser()` (`lib/auth/session.ts:16`). El proxy usa `getClaims()`, que valida la firma del JWT, para redirigir.

### I-04. En fases anteriores las pruebas E2E crearon usuarios temporales en el proyecto real (Informativa)

Las pruebas con navegador de las fases 6 a 11 crearon usuarios y datos de prueba con la service role contra el proyecto real, y los borraron al final de cada prueba. Desde esta auditoría no se hace más. Las E2E futuras necesitan una base local (ver A-01) o quedarse en lectura.

### I-05. `rls_auto_enable` y `max_household_members` se pueden ejecutar como anon (Informativa)

- `rls_auto_enable` es una función de Supabase (disparador de eventos con `search_path=pg_catalog`), no de este proyecto. No se puede llamar como RPC útil.
- `max_household_members()` devuelve la constante 2.
- Sin riesgo. Se documenta para que la lista de grants quede completa.

### I-06. CSP con `'unsafe-inline'` en scripts (Informativa, decisión tomada)

- Es necesario porque PPR y nonce son incompatibles en Next 16 (0.14.2).
- Mitigación: no hay inyección de HTML. El único `dangerouslySetInnerHTML` es el script estático de arranque (`app/layout.tsx:72`), React escapa el resto, los `href` dinámicos son internos con valores validados y los enlaces externos llevan `rel="noopener noreferrer"`.
- El resto de directivas se ajusta en M-01, B-05 y la fase 5.

### I-07. Ajustes del panel de Supabase que no se pueden ver desde el código (Informativa)

Hay que revisarlos a mano en las fases 4 y 6:

- Rate limits de Auth (correos por hora, OTP, verificaciones, refrescos de token).
- Protección de contraseñas filtradas (no aplica si solo hay Google y enlace mágico).
- MFA.
- Lista de Redirect URLs (que solo tenga `https://cash.halcon.dev/**` y lo de desarrollo que haga falta).
- Plantillas de correo.
- Expiración del JWT.
- CAPTCHA en el registro.

---

## Comprobado y correcto

| Área                                 | Resultado                         | Cómo se comprobó                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historial de git                     | Sin secretos                      | Ninguna de las tres llaves reales aparece en `git log --all -p` (28 commits, incluidos los archivos borrados). No hay JWT, `sb_secret_`, `sk_*`, `AKIA` ni llaves PEM.                                                                                                                                                                  |
| Archivos versionados                 | Sin `.env` reales                 | `git ls-files` solo trae `.env.example` (sin valores). `.gitignore:34-35` ignora `.env*` salvo la plantilla. No hay logs, volcados ni CSV versionados.                                                                                                                                                                                  |
| `NEXT_PUBLIC_*`                      | Solo URL y anon key               | Son los únicos dos nombres con ese prefijo en todo el código. La service role y `CRON_SECRET` no lo llevan.                                                                                                                                                                                                                             |
| Bundle del cliente                   | Sin service role ni `CRON_SECRET` | Búsqueda del valor real en `.next/static` y `public/`: 0 archivos. La anon key sí aparece; es pública por diseño y la protege RLS.                                                                                                                                                                                                      |
| Service role                         | Solo en servidor                  | `lib/supabase/admin.ts` importa `server-only`. La usan los cron y `lib/money/rates.ts` (guardar la tasa). `getServerEnv()` falla si se llama en el navegador.                                                                                                                                                                           |
| Source maps                          | No se publican                    | `find .next/static -name '*.map'`: 0. `GET <chunk>.js.map` en `next start` da 404.                                                                                                                                                                                                                                                      |
| Service worker                       | No cachea nada autenticado        | `public/sw.js:49-63`: solo `GET` del mismo origen. Excluye RSC, `?_rsc`, `/api/` y `/auth/`. A las navegaciones les sirve red o `offline.html`, nunca HTML guardado. Solo cachea `/_next/static`, íconos, manifest y `offline.html`.                                                                                                    |
| RLS                                  | Activa en las 20 tablas           | Catálogo: `relrowsecurity = true` en todas. `anon` no tiene `SELECT` en ninguna. `invite_accept_attempts` no tiene políticas ni grants (solo la usan funciones).                                                                                                                                                                        |
| Aislamiento entre usuarios y hogares | Correcto                          | Todas las políticas se basan en `owner_id = auth.uid()` o en `is_household_member(household_id)`. `paid_by` tiene una política restrictiva. `owner_id` es inmutable por trigger. Las referencias pasan por `check_visible_refs`. `profiles` solo deja ver el propio.                                                                    |
| SECURITY DEFINER                     | `search_path` fijo en todas       | Las 17 funciones definer de `public` tienen `search_path=""`. Las que puede llamar `authenticated` comprueban `auth.uid()` o filtran por membresía (`accept_invite`, `create_household`, `get_household_members`, `leave_household`, `remove_household_member`, `is_household_*`). Las internas no son ejecutables por `authenticated`. |
| RPC de la revisión                   | Correctas                         | `save_transaction`, `dashboard_totals` y `post_occurrence` son SECURITY INVOKER, así que aplica RLS. `post_occurrence` exige `auth.uid()` y la service role no la puede ejecutar. `mark_overdue_occurrences` solo la ejecuta la service role. `exchange_rates`: lectura para `authenticated` e inserción solo con la service role.      |
| Invitaciones                         | Correctas                         | Token de 256 bits (`randomBytes(32)`). Solo se guarda su hash, sirve una vez, vence en máximo 7 días (CHECK en la tabla) y `accept_invite` permite 8 intentos en 15 minutos. Solo quien administra crea invitaciones (RLS).                                                                                                             |
| Cron                                 | Protegidos y fallan cerrados      | Comparación con `timingSafeEqual`. Sin `CRON_SECRET`, `getServerEnv()` lanza un error y no corre nada. `GET /api/cron/rates` sin cabecera responde 401 en `next start`.                                                                                                                                                                 |
| Redirecciones                        | Sin open redirect                 | `lib/auth/redirect.ts:9-16` solo acepta rutas que empiezan con una sola `/`, sin `\` ni caracteres de control. `/auth/callback` y `/auth/confirm` arman la URL sobre su propio origen.                                                                                                                                                  |
| SSRF                                 | No hay                            | Las únicas peticiones salientes van a URLs fijas: las fuentes de la tasa en `lib/money/rate-sources.ts:24-25` y PostgREST del propio proyecto en la exportación.                                                                                                                                                                        |
| XSS                                  | Sin puntos de inyección           | Solo un `dangerouslySetInnerHTML` (script estático). No hay `javascript:`. Los `href` son internos o literales y los externos llevan `noopener noreferrer`.                                                                                                                                                                             |
| CSRF                                 | Cubierto                          | Next compara `Origin` con el host en todas las server actions. La única ruta POST (`/auth/signout`) no cambia datos, y las cookies `SameSite=Lax` no viajan en un POST de otro sitio.                                                                                                                                                   |
| Errores hacia el cliente             | Genéricos                         | Las acciones devuelven claves de error traducidas (por ejemplo `householdErrorKey`, `leaveError`). Next oculta en producción el mensaje de los errores lanzados (solo queda el digest).                                                                                                                                                 |
| Logs                                 | Sin montos                        | Solo dos `console.error` (exportación y tarjetas del dashboard), con el objeto de error. No se registran montos ni correos.                                                                                                                                                                                                             |
| Enumeración de correos               | No revela                         | El enlace mágico usa `signInWithOtp` con `shouldCreateUser: true`: la respuesta es la misma exista o no la cuenta.                                                                                                                                                                                                                      |
| Exportación CSV                      | Solo lo de la sesión              | Va por PostgREST con el token del usuario (RLS). Neutraliza celdas que empiezan con `=`, `+`, `-` o `@` (inyección de fórmulas), `lib/export/csv.ts:1-8`. Sin caché (`private, no-store`). Exporta los datos del hogar que el usuario ya ve en la app.                                                                                  |
| Asignación masiva                    | No hay                            | Las acciones validan con zod y arman a mano el objeto de columnas (por ejemplo `saveDebt`). Las transacciones pasan por RPC. `household_id` sale del scope validado (`getScope` verifica membresía).                                                                                                                                    |
| `/dev/design-system`                 | Cerrado en producción             | `app/dev/design-system/page.tsx:18` llama a `notFound()` en producción.                                                                                                                                                                                                                                                                 |
| Cabeceras presentes                  | Sí                                | Medido en `next start`: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, COOP, CORP, HSTS de 2 años, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `frame-src 'none'`.                                                                                |
| Storage                              | No se usa                         | No hay buckets ni llamadas a `storage` en el código.                                                                                                                                                                                                                                                                                    |

## Lo que queda para ti (se completa en la fase 6)

- No hay llaves que rotar: no apareció ninguna en el historial ni en el cliente.
- Revisar en el panel de Supabase lo de I-07 (los valores concretos se proponen en la fase 4).
- Decidir la base local de pruebas (A-01) antes de la fase 3.
