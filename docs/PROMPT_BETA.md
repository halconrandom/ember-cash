Fase "Beta con amigos": mínimo legal y de seguridad para publicar Ember Cash como prueba. Lee CLAUDE.md primero y respeta todas sus reglas (español neutro, comentarios en el código, textos solo en messages/es.json y en.json, sin glows ni adornos, commit con versión y CHANGELOG sin push). Trabaja en sub-fases cortas; al terminar cada una, resume, muestra los tests y DETENTE hasta que yo diga "continúa". No toques el diseño fuera de lo que se pide. Nunca ejecutes pruebas destructivas ni escrituras de prueba contra el proyecto real de Supabase: los tests de base van solo contra el Postgres local.

CONTEXTO
Ember Cash es una app personal de finanzas (PWA, Supabase Auth + Postgres con RLS, hogar compartido, COP y USD) que quiero abrir a unos amigos para que la prueben. Es versión de prueba: sin cobros, sin conexión a bancos, sin analítica. Aplica la ley colombiana de protección de datos (Ley 1581 de 2012). Los textos legales son un borrador y requieren revisión de una persona antes de publicar: déjalos marcados con el aviso legal.draftNotice y no inventes datos legales (NIT, razón social, dirección). No hagas el manual interno de habeas data ni el registro ante la SIC en esta fase.

COPY LEGAL YA ESCRITO (no lo reescribas ni lo resumas)
Los textos están en docs/legal/legal.es.json y docs/legal/legal.en.json (los pongo yo en el repo antes de empezar; si no existen, DETENTE y avísame). Haz un merge profundo en messages/es.json y messages/en.json respetando las claves exactas: legal.*, auth.consent, auth.consentError, auth.loginNotice y account.*. Reglas de uso:
- Los marcadores {version}, {date} y {contactEmail} se pasan como valores de next-intl, nunca se escriben a mano.
- auth.consent usa etiquetas ricas <privacy> y <terms> (t.rich de next-intl) que renderizan enlaces a /privacidad y /terminos.
- Un test verifica que es.json y en.json tengan exactamente las mismas claves y que no queden claves sin usar ni usadas sin definir.
- Sin guiones largos en ningún texto nuevo. Si encuentras un error o ambigüedad en el copy, dímelo en vez de cambiarlo.

DECISIÓN DE DATOS COMPARTIDOS AL BORRAR UNA CUENTA (ya tomada)
Se borran todos los datos personales de la persona. Los gastos y liquidaciones del hogar donde participó se conservan anonimizados (aparece como "Usuario eliminado", sin nombre ni correo), porque los demás miembros los necesitan para sus cuentas. Eso ya está explicado en legal.privacy.sharedBody y account.deleteSharedNote.

SUB-FASE B1: CONSENTIMIENTO EN EL REGISTRO
- Checkbox obligatorio (auth.consent) en el registro por correo, y también en el primer ingreso de cuentas nuevas con Google y de cuentas existentes: si no hay consentimiento vigente, una pantalla de consentimiento bloquea la app hasta aceptarlo. Sin marcarlo se muestra auth.consentError y no se crea ni usa la cuenta.
- Tabla nueva `consents` (user_id, tipo privacy|terms, versión del texto, fecha y hora timestamptz). La versión del texto es una constante en el código (por ejemplo 2026-10-v1) que también se muestra con legal.versionLine. No guardes IP ni datos extra. RLS: el usuario solo ve y crea los suyos; nunca edita ni borra. Si cambia la versión, se vuelve a pedir.
- Mostrar auth.loginNotice en el login.
- Tests: no se usa la app sin consentimiento, se guarda la versión correcta, un usuario no lee ni modifica el consentimiento de otro (prueba SQL de RLS en el Postgres local).

SUB-FASE B2: PÁGINAS /privacidad Y /terminos Y security.txt
- /privacidad y /terminos son públicas (sin sesión), en es y en según el idioma, y construidas solo con las claves de legal.privacy y legal.terms, en el orden de las claves, con listas para los grupos dataN, noN, rightN y useN. Muestran legal.draftNotice y legal.versionLine. Enlaces desde el pie del login y desde Ajustes.
- {contactEmail} sale de la variable NEXT_PUBLIC_CONTACT_EMAIL (documentarla en .env.example y el README; si falta, la app falla al arrancar con mensaje claro).
- /.well-known/security.txt con Contact (mismo correo), Expires (un año desde la compilación), Preferred-Languages: es, en y Canonical.
- Contraste y accesibilidad como el resto de la app (títulos con jerarquía, ancho de lectura cómodo, funcionan en móvil).
- Tests: cargan sin sesión, existen en es y en, y security.txt tiene los campos obligatorios.

SUB-FASE B3: ELIMINAR CUENTA Y DATOS (hoy NO existe; hay que construirla)
- Ajustes, sección Privacidad y datos: el botón de exportar CSV ya existe (Ajustes, Respaldo): reutilízalo con account.exportNotice y account.exportButton. Nuevo botón "Eliminar mi cuenta" con confirmación en dos pasos (escribir ELIMINAR o mantener pulsado 2 s, igual que las otras acciones irreversibles) usando account.deleteTitle, account.deleteBody, account.deleteSharedNote, account.deleteConfirm y account.deleteCancel.
- Validación previa: si hay saldo pendiente con otro miembro, o la persona administra un hogar con más miembros, no se borra y se explica qué hacer (liquidar, quitar al otro miembro). Si es el único miembro del hogar, se borra el hogar entero.
- Se borra: perfil, transacciones personales, metas, deudas, suscripciones, presupuestos, cuentas, consentimientos, sesiones y el usuario de auth. Se conserva anonimizado lo compartido. Anonimiza sin romper las reglas existentes (repartos, liquidaciones, balance en cero, bloqueo de edición de gastos con ex miembros).
- Implementación: función SECURITY DEFINER con search_path fijo y auth.uid() verificado, o ruta de servidor que use la service role solo después de verificar la sesión con getUser. Idempotente y atómica. Migración nueva.
- Tests SQL en local: se borra todo lo personal, lo compartido queda anonimizado, el balance de quienes se quedan no cambia, falla con saldo pendiente, falla si administra un hogar con otro miembro, y un usuario no puede borrar a otro.

SUB-FASE B4: AISLAMIENTO ENTRE HOGARES Y SEGURIDAD
- Si no existen ya, escribe pruebas SQL de RLS con DOS hogares y un usuario sin hogar: lectura, inserción, edición, borrado y RPC cruzadas, incluidos intentos de suplantar household_id, user_id y paid_by, en todas las tablas y funciones. Si existen, confírmame que corren en un script documentado.
- Tests automáticos de que SUPABASE_SERVICE_ROLE_KEY y CRON_SECRET solo existen en el servidor, y que no hay claves en el cliente ni en el service worker.
- Solo la cookie de sesión de Supabase Auth: sin analítica, sin scripts ni fuentes de terceros, sin cookies adicionales (incluido el service worker). Test que falle si aparece un script de terceros. Por eso no se necesita banner de cookies.

SUB-FASE B5: LISTA DE VERIFICACIÓN PREVIA A COMPARTIR EL ENLACE
Crea docs/BETA_CHECKLIST.md con casillas marcables y cómo comprobar cada una: texto legal revisado por una persona, correo de contacto funcionando y probado, consentimiento guardándose, eliminar cuenta probado con una cuenta de prueba, RLS entre hogares probado, MFA activo en Supabase, GitHub y Vercel, backups de Supabase activos, protección de contraseñas filtradas y límites de Auth activos en el panel, sin claves en el cliente, SMTP propio funcionando y plantillas de correo con el dominio correcto, cron protegido, cash.halcon.dev con HTTPS, mensaje de versión de prueba visible en el login, y un plan simple si alguien pide borrar sus datos (qué hago y en cuánto tiempo). Versión con CHANGELOG, pnpm check, commit sin push y DETENTE.
