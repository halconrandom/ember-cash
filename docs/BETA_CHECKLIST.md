# Lista antes de compartir el enlace

Lista para quien va a abrir https://cash.halcon.dev a unos amigos. Cada casilla se marca solo después de hacer la comprobación de esa misma casilla. Nada de aquí cambia el código.

Versión de la app al armar esta lista: 0.14.11. Producción: https://cash.halcon.dev. Desarrollo y producción usan el mismo proyecto de Supabase.

Ya están en el repositorio el bloque A (límites en Postgres, 0.14.8), B1 (consentimiento, 0.14.9), B2 (aviso, términos y security.txt, 0.14.10) y B3 (eliminar cuenta, 0.14.11). La sección [Aislamiento entre hogares (B4)](#aislamiento-entre-hogares-b4) está pendiente: ese trabajo va en paralelo y esta lista no lo da por hecho.

Los tests SQL (`pnpm test:rls` y `pnpm test:db:fresh`) corren solo contra el Postgres local de `TEST_DATABASE_URL`. No los lances contra el proyecto de Supabase, ni escribas datos de prueba ahí salvo la cuenta de prueba que se indica más abajo.

El detalle de la auditoría está en `docs/security/AUDIT.md`. Este archivo no lo sustituye.

## Antes de las pruebas en el sitio

- [ ] En el proyecto de Supabase ya están aplicadas las migraciones `0015_rate_limits.sql`, `0016_consents.sql` y `0017_account_deletion.sql` (`pnpm db:push`). Sin la 0015 los límites de la base no rechazan filas. Sin la 0016 el consentimiento no se guarda. Sin la 0017 eliminar la cuenta no tiene la función. Comprobación de solo lectura: en el SQL editor existen la tabla `consents`, la tabla `rate_limits`, la tabla `deleted_account_sentinel` y las funciones `consume_rate_limit` y `delete_account_data`.
- [ ] En Vercel, entorno Production, están `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CONTACT_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET`. Las dos últimas no llevan prefijo `NEXT_PUBLIC_`. `CRON_SECRET` tiene al menos 32 caracteres. Si falta el correo de contacto, la app no arranca.

## Texto legal revisado por una persona

El aviso y los términos publicados siguen siendo un borrador. La frase de la página es "Borrador sujeto a revisión legal." No la quites hasta que una persona haya revisado el texto y el cambio de copy sea deliberado. No inventes NIT, razón social ni dirección.

- [ ] Alguien distinto de quien escribió el borrador leyó https://cash.halcon.dev/privacidad y https://cash.halcon.dev/terminos sin iniciar sesión. Vio el aviso de borrador, la versión `2026-10-v1` y la fecha 17 de octubre de 2026.
- [ ] En el aviso está el apartado "Gastos compartidos del hogar" y el párrafo que explica que, al borrar la cuenta, lo compartido queda como "Usuario eliminado".
- [ ] Si la revisión cambia el texto, se sube `LEGAL_VERSION` en `lib/legal/version.ts`. Quien ya aceptó la versión anterior vuelve a ver la pantalla de consentimiento. Hasta esa revisión, las casillas de abajo pueden avanzar, pero el enlace no se comparte como texto legal cerrado.

## Correo de contacto funcionando y probado

`{contactEmail}` sale de `NEXT_PUBLIC_CONTACT_EMAIL`. Es el mismo correo del aviso, de los términos y de `security.txt`.

- [ ] https://cash.halcon.dev/privacidad y https://cash.halcon.dev/terminos muestran ese correo como enlace `mailto:`.
- [ ] https://cash.halcon.dev/.well-known/security.txt responde texto plano con `Contact: mailto:` de ese mismo correo, `Expires: 2027-10-17T00:00:00.000Z`, `Preferred-Languages: es, en` y `Canonical` apuntando a esa misma URL en el origen de producción.
- [ ] Enviaste un mensaje real a ese correo (desde otra cuenta) y llegó. Respondiste y la respuesta también llegó.

## Consentimiento guardándose

Código de B1. La casilla es obligatoria para el correo y para Google. Sin consentimiento vigente de la versión `2026-10-v1`, una pantalla bloquea la app. No se guarda la IP. Cada quien solo ve y crea los suyos.

- [ ] En local, `pnpm test:rls` incluye `supabase/tests/consents.sql` y pasa. No lo corras contra Supabase.
- [ ] En https://cash.halcon.dev/login, sin marcar la casilla, "Continuar con Google" no abre Google y "Enviar enlace mágico" no envía el correo. Aparece "Marca esta casilla para crear tu cuenta."
- [ ] Con una cuenta de prueba nueva (correo que controlas, cifras inventadas), al entrar la app no deja usar el resto hasta aceptar. Después, en `consents` hay dos filas de ese usuario: `privacy` y `terms`, las dos con versión `2026-10-v1`.
- [ ] Con otra sesión, ese segundo usuario no puede leer ni editar las filas del primero. El test SQL local ya cubre ese caso. En el proyecto real basta con no usar el SQL editor con un rol que se salte RLS para "comprobarlo".

## Eliminar cuenta probado con una cuenta de prueba

Código de B3. En Ajustes, sección "Privacidad y datos": primero el CSV (`account.exportNotice` y `account.exportButton`) y luego "Eliminar mi cuenta". Confirmar es mantener presionado 2 segundos o escribir `ELIMINAR` (`DELETE` en inglés).

La función `delete_account_data` no recibe un id: solo actúa sobre la sesión. Si la persona administra un hogar con más miembros, no se borra. Si en un hogar compartido el saldo no está en cero, no se borra. Si es el único miembro, se borra el hogar entero. Si es miembro con saldo en cero, lo compartido queda a nombre de "Usuario eliminado" y el saldo de quien se queda no cambia. La service role solo entra después, para borrar el usuario de Auth.

- [ ] En local, `pnpm test:rls` incluye `supabase/tests/account_deletion.sql` y pasa.
- [ ] En el sitio, con una cuenta creada solo para esto (no la tuya y no la de un amigo), exportaste el CSV y luego eliminaste la cuenta. Al terminar, ese correo ya no inicia sesión.
- [ ] Probaste el rechazo: una cuenta de prueba que administra un hogar con otro miembro ve la explicación y la cuenta sigue existiendo. Otra con saldo pendiente también. No fuerces el borrado a mano en el panel.
- [ ] Probaste el caso compartido con saldo en cero: quien se queda ve el historial, el nombre y el correo ya no aparecen, y el texto es "Usuario eliminado".

## Aislamiento entre hogares (B4)

**Pendiente.** B4 se está haciendo en paralelo. No marques estas casillas en esta pasada. Cuando esa rama cierre, el criterio es el de `docs/PROMPT_BETA.md` (sub-fase B4), corrido solo contra Postgres local:

- [ ] Hay una prueba SQL con dos hogares y un usuario sin hogar: lectura, inserción, edición, borrado y RPC cruzadas, incluidos intentos de suplantar `household_id`, `user_id` y `paid_by`, en todas las tablas y funciones. El comando que la corre está escrito en el README o junto a `pnpm test:rls`.
- [ ] Hay tests automáticos de que `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` solo existen en el servidor, y de que no hay claves en el cliente ni en el service worker.
- [ ] La única cookie es la de sesión de Supabase Auth: sin analítica, sin scripts ni fuentes de terceros y sin cookies extra, incluido el service worker. Un test falla si aparece un script de terceros. Por eso el aviso no lleva banner de cookies.

Lo que ya existe no cierra B4. La auditoría de fase 0, en solo lectura, no encontró acceso entre hogares (`docs/security/AUDIT.md`, "Comprobado y correcto"). En local ya corren `supabase/tests/rls_enabled.sql`, `rls_households.sql`, `rls_finance.sql` y `definer_scope.sql` (B-07, 0.14.7). Desde 0.14.5, `pnpm build` revisa el bundle (`scripts/check-client-bundle.mjs`), `lib/security/server-boundary.test.ts` frena imports de servidor en el cliente y el hook de pre-commit frena secretos. Falta la suite cruzada de B4 y el test de scripts de terceros.

- [ ] RLS entre hogares probado: esta casilla se marca solo cuando las tres de arriba están hechas y en verde en local.

## MFA en Supabase, GitHub y Vercel

Es el segundo factor de las cuentas que administran el proyecto, no un MFA para los amigos dentro de la app. La app no pide MFA al entrar.

- [ ] La cuenta de Supabase dueña del proyecto tiene MFA activo. Entras al panel y el segundo factor te lo pide.
- [ ] La cuenta de GitHub dueña del repositorio tiene MFA activo.
- [ ] La cuenta de Vercel que despliega cash.halcon.dev tiene MFA activo.

## Backups de Supabase activos

El CSV de Ajustes es el respaldo de una persona. El respaldo del proyecto es otro.

- [ ] En el panel de Supabase, Database y luego Backups, hay copias recientes y sabes cuál restaurarías. La pantalla de Ajustes ya dice que ese respaldo vive ahí. Anota la fecha de la última copia que viste.

## Panel de Auth: contraseñas filtradas y límites

La auditoría lo dejó como revisión manual (I-07). El código no puede ver estos interruptores. La app entra con Google y con enlace mágico. No hay formulario de contraseña.

- [ ] Protección de contraseñas filtradas: en Authentication confirmas que el alta con contraseña está apagada. Si el interruptor de contraseñas filtradas existe, déjalo activo. No marques la casilla solo porque el código no muestra un campo de contraseña.
- [ ] Límites de Auth activos: correos por hora, OTP, verificaciones y refrescos de token no están en ilimitado. Anota los números que ves. Son distintos de los de Postgres (migración 0015): exportar 3 por hora, crear un enlace de hogar 8 por hora, aceptar un enlace 8 cada 15 minutos, escrituras 120 por minuto.
- [ ] Redirect URLs: solo `https://cash.halcon.dev/**` y las de desarrollo que todavía uses. Ningún dominio de más.
- [ ] Site URL del proyecto de Auth: `https://cash.halcon.dev`.
- [ ] Anota la expiración del JWT (I-07). Esta lista no pide cambiarla.
- [ ] CAPTCHA del registro (I-07): la pantalla de login no tiene widget de CAPTCHA. No lo actives en el panel hasta que la app lo tenga. Si el enlace mágico o Google empiezan a fallar justo después de activarlo, esa es la causa.

## Sin claves en el cliente

En la fase 0 no apareció la service role ni `CRON_SECRET` en el historial ni en el bundle. La anon key sí va al navegador: es pública y la frena RLS. `NEXT_PUBLIC_CONTACT_EMAIL` también es público a propósito.

- [ ] `pnpm check` pasa en esta versión.
- [ ] `pnpm build` pasa. Ese comando incluye `scripts/check-client-bundle.mjs`. Si el bundle llevara la service role, `CRON_SECRET` u otra llave de servidor, el build falla y Vercel no publica.
- [ ] En Vercel, `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` no tienen prefijo `NEXT_PUBLIC_`. No pegues sus valores en un issue, un chat ni un log compartido.

## SMTP propio y plantillas con el dominio correcto

El correo integrado de Supabase no alcanza para invitar a varias personas. Las plantillas tienen que llevar al dominio de la app.

- [ ] En Authentication, el SMTP propio está activo (host, usuario y remitente de un dominio que controlas), no solo el remitente integrado.
- [ ] Pediste un enlace mágico a un buzón que controlas. Llegó, el enlace abre `https://cash.halcon.dev`, e iniciar sesión funciona. El mensaje de la app es el mismo si el correo ya tenía cuenta o no.
- [ ] Las plantillas (enlace mágico y lo que use Google si aplica) muestran el dominio correcto, sin un enlace suelto a otro sitio, y el remitente coincide con el dominio del SMTP.

## Cron protegido

Tres rutas, las tres comparan `Authorization: Bearer <CRON_SECRET>` en tiempo constante. Sin secreto válido responden 401. Vercel envía esa cabecera solo en el deploy de producción. Horario en `vercel.json` (UTC): tasas `0 13 * * *`, purga `30 13 * * *`, vencimientos `45 13 * * *`. En Bogotá, sin horario de verano, eso es 08:00, 08:30 y 08:45.

- [ ] `CRON_SECRET` de Production es el que Vercel usa para esos cron. No lo mandes en el `curl`.
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://cash.halcon.dev/api/cron/rates` sin cabecera responde `401`. Con `Authorization: Bearer incorrecto` también. Repite la prueba de la petición sin cabecera en `/api/cron/purge-deleted` y `/api/cron/occurrences`.
- [ ] Tras una corrida programada, los logs de Vercel muestran las tres rutas en éxito. Si una falla, la respuesta es una clave genérica, no el texto de la base (0.14.6).

## cash.halcon.dev con HTTPS

- [ ] https://cash.halcon.dev abre con un certificado válido para ese nombre.
- [ ] http://cash.halcon.dev redirige a https.
- [ ] La respuesta de HTTPS trae `strict-transport-security`. En local la auditoría midió HSTS de dos años. Confírmalo en el host público.

## Mensaje de versión de prueba en el login

El texto es `auth.loginNotice`: "Versión de prueba. Usa cifras inventadas." En inglés: "Test version. Use made-up numbers."

- [ ] En https://cash.halcon.dev/login, sin sesión, esa frase se ve en el formulario.
- [ ] Después de pedir el enlace mágico, la frase sigue visible en la pantalla de "te enviamos un enlace".

## Si alguien pide borrar sus datos

El aviso publicado dice: entrar a Ajustes, elegir eliminar la cuenta, y que antes se puede exportar el CSV. El contacto es el correo de `NEXT_PUBLIC_CONTACT_EMAIL`. El borrador no fija un número de días. El plan de operación, hasta que la revisión legal lo escriba en el aviso, es este.

Qué hacer:

1. Si puede entrar: lo hace esa persona, en esa sesión. Ajustes, "Privacidad y datos", exportar CSV, "Eliminar mi cuenta", mantener presionado 2 segundos o escribir `ELIMINAR`.
2. Si escribe al correo de contacto: responde desde ese mismo buzón. Comprueba que el mensaje sale del correo de la cuenta. Pídele que entre y use el botón. No borres el usuario en el panel de Supabase como primer paso. Lo compartido solo se anonimiza dentro de `delete_account_data`, con la sesión de esa persona. Borrar el usuario de Auth a mano antes puede dejar el nombre en el hogar o romper filas que los demás necesitan.
3. Si el botón dice que hay saldo pendiente o que administra un hogar con más miembros, no hay atajo. Primero se liquida, o el otro miembro se va. El texto en pantalla ya dice eso.
4. Caso raro, ya descrito en el código: los datos se limpiaron pero el usuario de Auth sigue, y la pantalla muestra el error genérico. En los logs el contexto es `delete_account.admin_delete`. Ahí sí se borra en el panel solo ese usuario de Auth, no otro.

En cuánto tiempo:

- Por la app, termina en la misma sesión.
- Si la petición llega por correo y la persona no puede hacerlo sola, trátala como un reclamo de supresión de la Ley 1581 de 2012, artículo 15: quince días hábiles desde el día siguiente a recibirlo. Si no alcanzas, avisa el motivo y una fecha nueva, como máximo ocho días hábiles más. Dilo en la respuesta. Ese plazo no está impreso en el aviso. Quien revise el borrador decide si el texto legal debe decirlo antes de quitar "Borrador sujeto a revisión legal."

- [ ] Leíste este plan y sabes desde qué buzón vas a responder.
- [ ] Tienes a mano el correo de contacto y comprobaste que lees esa bandeja (casilla de correo de más arriba).

## Auditoría: cerrado y todavía abierto

Fuente: `docs/security/AUDIT.md`. No se reescribe en esta lista.

Cerrado en código, según ese documento: A-01 (0.14.4), B-02 (0.14.5), B-01 e I-01 (0.14.6), B-07 (0.14.7), M-04 (0.14.8). Esas casillas no se reabren aquí. M-04 solo protege en el proyecto real después de aplicar `0015_rate_limits.sql`.

Siguen abiertos allí y esta lista no los cierra: M-01, M-02, M-03, B-03, B-04, B-05, B-06, B-08, B-09, I-02, I-03, I-04, I-05 e I-06. I-07 es la revisión del panel cubierta en las secciones de MFA, backups y Auth.

- [ ] Leíste el resumen de `docs/security/AUDIT.md` y no vas a compartir el enlace creyendo que esos hallazgos abiertos ya están resueltos.
