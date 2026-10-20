# Changelog

Todos los cambios relevantes de Ember Cash. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.25.0] - 2026-10-20

### Fase E6: modal de suscripción más compacto

- `subscription-modal.tsx` reorganizado según `docs/mockups/monedas/05_modal_suscripcion_*` (480 px, padding y radios del spec, pie fijo con divisor): mismos campos y misma validación de siempre (`validateRecurring`), sin agregar ninguno.
- Orden: Nombre (con el botón de ícono de 48×48 a la izquierda, en la misma fila) → Monto (`CurrencyAmountField`) → Frecuencia (segmented Mensual/Anual/Semanal + "Otra…", que despliega "Cada [n] [período]" reusando `frequency`/`interval`; "Una vez" entra por "Otra…") → Próximo cobro → Categoría. "Más opciones" (detalle y fecha de fin) es un disclosure cerrado por defecto: chevron abajo cerrado, arriba abierto, con `aria-expanded`.
- El selector de ícono y el de categoría salen del cuerpo del modal: ahora viven en `<PopoverSheet>` (nuevo, popover en escritorio / bottom sheet en móvil, mismo patrón que `<CurrencyPicker>`). La cuadrícula de íconos es de 6 columnas en escritorio y 5 en móvil, 48 px con gap 8; el elegido lleva contorno de acento, fondo suave y un check, y cada ícono tiene su `aria-label`.
- Validación al enviar y al salir de cada campo; al enviar con errores, el foco va al primero (para eso, `<Input>` ahora reenvía el `ref`, antes no se podía).
- El párrafo "Nada se registra solo…" baja a una línea sobre el pie; la ayuda de "Próximo cobro" queda en su propio texto.
- `enabled_currencies` (pendiente desde la fase E5): **no se quitó** la lectura/escritura con reserva de `lib/db/types.ts`/`lib/money/actions.ts`. Se intentó usar los tipos generados directamente y `pnpm typecheck` falló: `database.types.ts` en este repo todavía no trae esa columna (sin `enabled_currencies` en `Tables<"profiles">`). Falta `pnpm db:types` (después de `db:push`) en este entorno; en cuanto se regeneren los tipos, el cambio es mecánico.

## [0.24.0] - 2026-10-20

### Fase E5: selector de moneda unificado

- `<CurrencyPicker>` (nuevo, `components/ui/currency-picker.tsx`): popover de 280 px en escritorio (`role="listbox"`) y bottom sheet en móvil (mismo patrón que `<HelpPanel>`), con teclado completo (Enter/Espacio/Alt+↓ abre, flechas mueven, Enter elige, Esc cierra y devuelve el foco, una letra salta de moneda). Orden: recientes primero (`lib/money/last-currency.ts`, nuevo `readRecentCurrencies`/`recordRecentCurrency`/`orderCurrencyOptions`), luego alfabético. Por defecto solo lista `profiles.enabled_currencies` (vía `useRate()`); el chip de moneda activo lleva el anillo de acento mientras su popover está abierto (`data-[popup-open]:outline-focus-ring`).
- `<CurrencyAmountField>` (nuevo): reemplaza la píldora segmentada + campo de monto en deudas, metas, suscripciones y presupuestos del hogar. Un solo control de 48 px (botón de moneda de 72 px + divisor + input); cambiar de moneda nunca convierte el número escrito. Debajo, la línea de ayuda ("≈ monto · 1 X = Y Z" o "Sin tasa para X todavía") se recalcula en cada tecla pero solo se anuncia (`aria-live`) al perder el foco o cambiar de moneda. Cuentas usa `<CurrencyPicker>` directo (no lleva monto).
- Topbar: el toggle segmentado COP/USD/EUR se reemplaza por el chip "Ver en {moneda}" (`<DisplayCurrencyChip>`, nuevo), que abre `<CurrencyPicker>` con el título "Ver montos en"; en móvil se compacta al código. Al elegir, toast "Mostrando montos en {moneda}" y los montos hacen un cross-fade de 150 ms (nuevo en `<MoneyAmount>`, respeta `prefers-reduced-motion`) en vez de "tickear".
- Ajustes > Monedas (nuevo, `currency-setting.tsx`): "Moneda de visualización" (con la ayuda "Todos los totales se muestran en esta moneda.") y "Monedas que uso", con checkboxes que escriben `profiles.enabled_currencies` (nueva Server Action `saveEnabledCurrencies`); la de visualización no se puede desactivar.
- Chip de tasa de la topbar: muestra solo el par más usado hacia la moneda de visualización y, si hay más, "+{n}" en acento suave; la fecha pasa al tooltip (o a "Tasas · 20 oct" bajo 600 px). Un clic abre "Tasas de hoy": una fila por moneda activa, cada una con su propia fuente (TRM/BCE/open.er-api) y hora — no un pie común — y un enlace a "Cambiar moneda de visualización".
- `enabledCurrenciesOf()` (nuevo, `lib/db/types.ts`) lee `profiles.enabled_currencies` con una reserva segura mientras esa columna (fase E4, migración `0025`) no esté en `database.types.ts` (falta `pnpm db:types`, después de `db:push`).
- Todos los textos nuevos en es/en.

## [0.23.0] - 2026-10-20

### Fase E4: ARS y MXN, monedas generalizadas

- Catálogo: ARS (peso argentino) y MXN (peso mexicano), 2 decimales cada una (migración `0025_currencies_ars_mxn.sql`, **sin aplicar aún**: falta `pnpm db:push`). `profiles.display_currency` admite las 5; nueva `profiles.enabled_currencies text[]` (default `{COP, USD, EUR}`) con un trigger que valida cada código contra `currencies` (no puede ser un CHECK, por la subconsulta) y un CHECK de que `display_currency` esté entre las habilitadas. `dashboard_totals` deja de buscar un par directo (o su inverso) y triangula por USD para cualquier cruce.
- `lib/money/convert.ts`: `latestRateFor`/`rateAt` ya no dependen de que el cruce exacto esté guardado — si falta, lo derivan triangulando por USD (`usdPerUnit(A) / usdPerUnit(B)`), y solo si falta la pata de alguna de las dos monedas siguen devolviendo `null` (nunca una tasa inventada). `convert()` no cambió.
- `lib/money/rate-sources.ts` y `rates.ts`: cada moneda trae y guarda solo su pata a USD (COP de la TRM, EUR de Frankfurter/ECB, MXN de Frankfurter —el peso mexicano sí está en el BCE—, ARS de open.er-api —no está en el BCE, sin respaldo propio—); ya no se deriva ni se guarda EUR/COP. El cron guarda las 4 patas, cada una sin depender de que las otras se hayan traído bien.
- `lib/money`: el formato deja de usar símbolo (`US$`/`€`); el código ISO va siempre después del número ("20,00 USD", "125.000 COP"), con los separadores y decimales de siempre.
- Fuentes de cada moneda documentadas en `docs/DESIGN_SPEC.md` §4.
- Sin cambios de UI deliberados: lo que cambia visualmente (selectores de moneda ahora de 5 opciones, el nuevo formato sin símbolo) es consecuencia directa de generalizar `CURRENCY_CODES` y el formato, no un rediseño.
- Tests nuevos en Postgres local: conversión cruzada por USD (dashboard_totals con EUR y con MXN: USD→EUR, COP→MXN, ARS→COP), rechazo de moneda inexistente y validación de `enabled_currencies`.

## [0.22.3] - 2026-10-20

### Corregido

- `DateField` (selector de "Primera fecha" / "Termina" en Suscripciones y modales similares): en algunos navegadores, un clic en el `<input type="date">` invisible que cubre el campo no abría el selector nativo si no caía justo sobre su ícono interno. Ahora el clic llama a `showPicker()` explícitamente (con comprobación de soporte, sin cambiar nada más del campo).

## [0.22.2] - 2026-10-20

### Corregido (fila de "Próximos cobros", vuelta a 2 líneas de verdad)

- Quitado el `px-4` extra de la fila: el punto se alinea a la izquierda exactamente con "VENCIDOS" y con la tira de días; el botón de pago se alinea a la derecha con el total de la cabecera.
- La fila pasa de flexbox a un grid explícito de 2 filas × 3 columnas (`minmax(0,1fr) auto auto`, `gap-x-3 gap-y-0.5`, `items-baseline`): fila 1 = punto+nombre | monto convertido; fila 2 = meta (con la sangría del punto) | monto original; columna 3 = botón de pago con `row-span-2 self-center`. El nombre comparte línea base con el monto convertido, y la meta con el original.
- Quitado el resultado anterior (la meta a ancho completo bajo nombre y monto): ahora vive solo en su celda, con `whitespace-nowrap` y `truncate`.
- Nuevo `lib/i18n/format.ts`: `formatCompactDate` (expuesto como `useFormat().compactDate`) arma "17 oct" / "Oct 17" con `formatToParts`, descartando el "de" de `es-CO` sin tocar `DATE_STYLES.short` (que sigue igual en el resto de la app). Se usa en la meta de cada fila, el rótulo del día y el filtro de la tira de 7 días.
- Monto: número en 15 semibold y código de moneda en text2 de peso normal, igual que el total de la cabecera (mismas partes que `MoneyAmount` separa internamente).

## [0.22.1] - 2026-10-20

### Corregido (fila de "Próximos cobros", sin cambios de lógica)

- La fila ahora mide como máximo 2 líneas: línea 1 con el punto de color pegado al nombre (inline, 8 px, gap 8) y el monto + botón de pago a la derecha; línea 2 con la meta, alineada con el texto del nombre, ocupando el ancho completo bajo el nombre y el monto.
- La meta nunca se parte (`whitespace-nowrap`, `truncate` como último recurso). Texto más corto en vencidos: "Hace 3 días · 17 oct" (ya sin la palabra "Vencido", que el encabezado del grupo y el ícono ya dicen).
- Monto: `shrink-0 whitespace-nowrap`, el número baja a 15 semibold y la moneda queda en text2 de peso normal, igual que el total de la cabecera (mismo patrón de `MoneyAmount`: número y unidad por separado).
- Botón de pago: 36 px visuales dentro de 44 px de área táctil, con margen negativo para no robarle ancho a la fila, y gap de 8 con el monto.

## [0.22.0] - 2026-10-20

### Rediseñado: tarjeta "Próximos cobros" en Suscripciones

- Cabecera: título y, a la derecha, el total real del periodo (14 días) con `MoneyAmount variant="total"`, sin línea secundaria.
- La lista se agrupa en Vencidos / Hoy / Próximos (en vez de la píldora "Vencida" suelta); los grupos vacíos no se muestran. Encabezados con `role="heading" aria-level={3}`, filas en `ul`/`li`. Máximo 5 filas visibles; de ahí en más, un enlace "Ver todos (n)" a `/calendar`.
- Cada fila: ícono/punto a la izquierda; nombre (truncate) y una sola meta que combina fecha relativa y absoluta ("Hoy · 20 oct", "Vencido hace 3 días · 17 oct"); a la derecha el monto en la moneda de visualización y, solo si la original difiere, esa cifra debajo (ya sin la palabra "original" ni la píldora de moneda). Nunca se trunca un monto ni una fecha.
- Vencido: meta en rojo semántico con un ícono de exclamación (nuevo en el registro: `exclamation` / `CircleAlert`); sin chip, sin fondo rojo, sin barra lateral. "Hoy" en texto principal con peso medio.
- Tira de 7 días sin scroll: inicial del día, número y un punto de 4 px solo si hay cobros. Hoy ya no lleva un círculo relleno: el número pasa al color de acento con subrayado. Tocar un día filtra la lista a esa fecha ("Mostrando 24 oct · Quitar filtro"); tocarlo de nuevo quita el filtro. El total de la cabecera sigue siendo el del periodo completo.
- El enlace "Marcar como pagado" de las filas se reemplaza por un botón de icono circular (solo en Vencidos y Hoy; 32 px visual, 44 px de área táctil, sin naranja) que llama a la misma acción (`markOccurrencePaid`) sin abrir ningún diálogo; con toast de confirmación y el foco a la fila siguiente. Sin deshacer: la acción no tenía uno ya construido y no se inventó uno nuevo (deshacerla dejaría la ocurrencia marcada como pagada sin su transacción). La tarjeta de cada suscripción (a la izquierda) sigue igual, con su propio botón que abre el diálogo de siempre.

No se pudo probar en un navegador real en este entorno (sin herramienta de captura/automatización disponible); se verificó con `pnpm build` y revisión de código.

## [0.21.2] - 2026-10-20

### Corregido (botón de ayuda "?")

- El botón de ayuda ya no es una pastilla con fondo/borde (tenía otra altura que el chip de tasa y el selector de moneda, y el "?" no quedaba centrado). Ahora es un botón fantasma (sin fondo ni borde en reposo) con el ícono `help` (interrogation / `CircleHelp` de lucide-react, 20 px, `text-ink-2`), área táctil de 44x44 con `inline-flex items-center justify-center` para centrarlo igual que los demás controles de la barra.
- Hover: fondo redondo `bg-seg-track` (el mismo tono del selector COP/USD/EUR) y el ícono pasa a `text-ink`. Foco: el anillo estándar del proyecto (regla global de `:focus-visible`, sin clases extra). Sigue con `press-scale` (ya respeta `prefers-reduced-motion`).
- `aria-label`/`title` ahora dicen "Ayuda (?)" / "Help (?)" (`help.common.buttonTooltip`, nuevo en es/en).
- El punto de primera visita mide 8 px y queda en la esquina superior derecha del ícono, en posición absoluta dentro del botón.

## [0.21.1] - 2026-10-20

### Arreglado (visual, sin cambiar lógica)

- Suscripciones: en cada tarjeta y en "Próximos cobros", el nombre y el monto ya van en la misma fila (nombre con `truncate`, monto con `shrink-0 whitespace-nowrap`); las píldoras (Mensual/Vencida/Pausada) y el "Próximo …" bajan a su propia fila con `flex-wrap`, así que ya no se apilan ni se parten en dos líneas. El pie de cada tarjeta ("Cancelar" / "Marcar como pagado") queda con la misma altura en todas, incluida la pausada: cuando no hay cobro pendiente, el botón se reserva invisible (`invisible`, sin foco) en vez de desaparecer. "Marcar como pagado" ya no se parte en ningún lado (`whitespace-nowrap`).
- Botón de ayuda "?": mismo tratamiento que los demás controles de la barra (`border-border bg-surface`, como el chip de tasa), con hover, foco y `press-scale` iguales a los otros botones (ya respeta `prefers-reduced-motion`, que es una regla global). El punto de primera visita sigue dentro del propio botón, en posición absoluta.

## [0.21.0] - 2026-10-20

### Añadido (fase F3: ayuda en el resto de páginas y repetir la introducción)

- Botón y panel de ayuda (mismo componente de F2) ahora en Transacciones, Ahorros, Calendario, Hogar y Ajustes, además de Panel, Deudas y Suscripciones: `HELP_PAGES_READY` ya tiene las 8 páginas de `docs/onboarding/spec.md`. Copy nuevo en `help/<página>.{es,en}.json` (transactions, savings, calendar, household, settings), igual que F2.
- Ajustes > Ayuda > "Repetir la introducción" y el mismo botón en el pie del panel de ayuda (antes deshabilitado) abren `/onboarding?replay=1&step=0`.
- `wizard-actions.ts`: con `replay=1` (campo oculto en cada formulario del wizard) las acciones ya no tocan `profiles.onboarding_step` (ese campo quedó en "terminado" de verdad; el paso del replay viaja en la URL, `?step=N`) y `saveFocus` nunca pisa `onboarded_at` si ya existe. "Omitir" en replay solo cierra, sin emitir `onboarding_skipped` (no es un abandono real). Nada nuevo se duplica: `saveFirstAccount`/`saveFocus` ya reutilizaban por nombre + moneda desde F1; eso ya bastaba para no crear una segunda cuenta, meta, deuda o suscripción.
- `lib/onboarding/replay.ts`: la cuenta, la meta, la deuda o la suscripción que ya existen (en ese orden), para precargar el wizard — moneda, tipo, nombre y montos ya escritos cuando se repite la introducción.
- Hogar: popover de jerga para "reparto equitativo 50/50" (`glossary.fiftyFifty`), en el subtítulo de "Gastos compartidos", con el mismo `<GlossaryTerm>` de Deudas (Avalanche/Snowball/APR).
- Revisadas las métricas de F1 (`docs/onboarding/metrics.sql`): `public.events` todavía no existe en el Supabase real (sus migraciones no se han llevado a producción con `db:push`), así que no hay ninguna fila que analizar aún. No se encontró ningún paso de abandono con datos reales — no hay datos, punto. Nota agregada en el propio archivo; no se cambió ninguna regla de UX a partir de esto.
- La tecla "?" se verificó explícitamente: no abre la ayuda con el foco en un input, un textarea o un contenteditable. La comprobación se extrajo a `lib/help/shortcut.ts` (antes en línea dentro de `topbar.tsx`) para poder probarla sola.

## [0.20.0] - 2026-10-20

### Añadido (fase F2: botón de ayuda contextual)

- Botón de ayuda (44x44, "?") en Panel, Deudas y Suscripciones: en escritorio junto al selector de moneda de la topbar; en móvil en la fila del título/subtítulo. Tecla "?" lo abre (salvo con el foco en un campo de texto).
- Panel lateral de 360 px, no modal, en escritorio (el resto de la página sigue interactiva, sin velo); bottom sheet modal (foco atrapado, Escape cierra) bajo 600 px — mismo `Dialog` de Base UI que `<Modal>`, con `modal` según el ancho. Estructura: propósito, "Qué ves aquí" con "Mostrar" (desplaza y resalta la sección de la página con un contorno temporal, sin tapar nada), "Qué puedes hacer", preguntas frecuentes (acordeón `<details>`, accesible sin JS) y, en el pie, "Repetir la introducción" (deshabilitado hasta la fase F3).
- Contenido por página en `help/<página>.es.json` y `help/<página>.en.json` (`lib/help/content.ts`, cargado con `import()` dinámico: no entra al paquete principal), con la copia de Leona tal cual (`docs/onboarding/copy.md`) y su traducción al inglés. Solo Panel, Deudas y Suscripciones por ahora (`HELP_PAGES_READY`); el resto llega en la fase F3. Prueba de paridad es/en (`lib/help/messages.test.ts`), igual que `messages/*.json`.
- Punto indicador (azul, nunca naranja: el ember es solo marca/acción) la primera vez que se visita cada página, hasta que se abre su ayuda; se recuerda con `localStorage` (`lib/help/seen.ts`). Cada apertura registra el evento `help_opened` (ya cerrado desde la fase F1).
- Popovers de jerga (`components/help/glossary-term.tsx`, `glossary.*`): Avalanche y Snowball junto al selector de método, y APR en su dato, en Deudas. Se abren al tocar, cierran con Escape o tocando fuera; no atrapan el foco.
- Tests: `glossary-term.test.tsx` (abre, Escape, tocar fuera), `help-trigger-button.test.tsx` (etiqueta, punto, clic) y `lib/help/content.test.ts` (páginas listas y carga real de los 6 archivos).

## [0.19.2] - 2026-10-20

### Corregido (F1.2: `0024` no reescribe filas)

- `0024_opening_balance.sql` ya no convierte movimientos existentes. En el proyecto real `0023` no corrió, así que no hay saldos del wizard, y la heurística (descripción igual al nombre de la cuenta) podía tomar un ingreso real. La migración solo deja el esquema: `kind = 'opening'`, el disparador que impide editarlo y las exclusiones de totales, repartos y `save_transaction`. No está aplicada en Supabase.

## [0.19.1] - 2026-10-20

### Corregido (F1.1: el saldo inicial no entra en el mes)

- El wizard ya no guarda el saldo inicial como ingreso (`other_income`) ni como gasto de tarjeta (`other`). Migración `0024_opening_balance.sql`: el movimiento es `kind = 'opening'`, sin categoría, sin pagador y sin repartos. `dashboard_totals`, los presupuestos, la lista del hogar y `household_member_settled` solo suman `expense` e `income`, así que queda fuera igual que una transferencia.
- La cuenta sigue sin columna de saldo (0003). `account_balance` lo calcula con las transacciones. En una tarjeta ese monto es deuda que ya existía; en el resto, dinero en la cuenta. No cambia los ingresos ni los gastos del mes.
- `save_transaction` no lo crea ni lo edita. Un disparador solo deja cambiar `deleted_at`. El wizard lo inserta directo y la lista de transacciones no lo abre como un ingreso.
- `migrate_wizard_opening_balances` convierte las filas que el wizard de F1 ya pudo guardar en local: misma descripción que la cuenta, sin nota y pagadas por el dueño. Si hay dos, se queda con la más antigua.

## [0.19.0] - 2026-10-20

### Añadido (fase F1: onboarding)

- Migración `0023_onboarding.sql`: tabla `events` (`user_id`, `name`, `props`, `created_at`) con RLS (cada quien inserta y ve las suyas), sello de dueño y hora, y el disparador `zz_rate_limit_write`. Sin scripts de terceros. `profiles.onboarding_step`, `dashboard_hint_dismissed_at` y `first_steps_dismissed_at`, con permiso de UPDATE. En `accounts`, `credit_limit_minor` y `payment_day` solo si la cuenta es tarjeta.
- `docs/onboarding/metrics.sql`: porcentaje que termina, paso de abandono, elemento en la primera sesión, mediana al panel con datos y retorno a 7 días. Se corre como dueño de la tabla: no hay una vista para `authenticated`.
- El `/onboarding` que ya existía pasa a ser el wizard (bienvenida, moneda, primera cuenta, un elemento). Omitir aplica la moneda del idioma, marca `onboarded_at` y no abre un modal. El paso 4 es una pista en el panel, más la tarjeta Primeros pasos. Los textos salen de `docs/onboarding/copy.md`. No hay modo de datos de ejemplo.
- El saldo inicial de la cuenta se guarda con `save_transaction` (la tabla no tiene saldo). En una tarjeta es un gasto; en el resto, un ingreso. Por eso ese movimiento entra en los totales del mes.
- Tests de los pasos, de omitir, de retomar y de los eventos, contra Postgres local.

## [0.18.1] - 2026-10-20

### Corregido (revisión de `dashboard_totals`, fase E3)

- Migración `0022_dashboard_totals_guard.sql`: antes de armar el SQL dinámico, la moneda se busca en `currencies` y se rechaza con `unknown_display_currency` (22023) si no está; a `format()` entra el `code` del catálogo, no el texto del llamador. Las fechas se castean a `date` antes de interpolar y el literal del SQL vuelve a castearse (`::date`). El hogar se copia a una variable `uuid`. Siguen iguales el resultado para COP/USD/EUR, `auth.uid()` dentro de la función, `security invoker` y `search_path` vacío. Los literales van por `format()` con `%L`.
- Test `supabase/tests/dashboard_totals_guard.sql`: moneda `USD'); drop table x;--`, una llamada que marcaría un canario si el texto se concatenara, fechas inválidas (y una fecha con el mismo drop) y un hogar que no es uuid. Todas fallan sin tocar la tabla temporal `x`. `lib/security/rpc-scope.test.ts` mira esta migración.

## [0.18.0] - 2026-10-19

### Añadido (fase E3: dashboard en la moneda de visualización)

- Migración `0021_dashboard_display_currency.sql`: `dashboard_totals` (0012) ahora recibe `p_display_currency` y devuelve cada fila ya convertida (`converted_minor`), con la tasa de `exchange_rates` vigente en la fecha de **esa** fila (la última disponible si no hay una de ese día exacto). Si el par no tiene ninguna tasa, esa parte no se inventa: queda aparte en `uncovered_minor` (en la moneda de origen), y `total_minor` (sin convertir, por moneda de origen) se conserva para el desglose del sheet de `<MoneyAmount variant="total">`.
- La función pasa de `language sql` a `language plpgsql` con `execute format(...)` sobre literales: con parámetros, una función SQL simple no se puede "inlinear" (tiene CTEs) y Postgres le daba un plan genérico fijo que, con el dataset sintético de 200.000 filas de 0012, elegía buscar la tasa fila por fila y tardaba minutos. El SQL armado con los valores ya puestos (sin riesgo de inyección: son literales tipados vía `%L`) fuerza un plan nuevo a la medida de cada llamada.
- La tasa de cada fila se busca una sola vez por combinación (moneda de origen, fecha) distinta del rango —no una vez por fila— y se cruza con las transacciones por igualdad (hash join), no por fila. Con el mismo dataset de 200.000 filas: ~310-330 ms (antes 37 ms sin convertir monedas). No hizo falta un índice nuevo: `exchange_rates_pair_as_of_idx` (0003) ya cubre esa búsqueda.
- `lib/dashboard/aggregate.ts`: `monthTotals`, `spendingByCategory` y `trend` ya no reciben `rates` ni convierten en el cliente (lo hace la base); solo suman `row.converted` y marcan `partial` si alguna fila quedó `uncovered`. Nueva `originBreakdown()` agrupa `row.amount` por moneda de origen, para el `breakdown` del sheet. El `sumIn` genérico (metas, deudas, suscripciones) sigue igual: no viene de `dashboard_totals`.
- `lib/dashboard/queries.ts`: `getAggregates` lee `profiles.display_currency` (ya cacheado por `getCurrentProfile`) y lo pasa a la RPC.
- Las tarjetas de balance, ingresos y gastos (`stat-cards.tsx`) pasan `breakdown` a `<MoneyAmount variant="total">`: ahora sí se puede tocar "Convertido con tasas del día" y ver el desglose por moneda de origen (capacidad agregada en E2, sin usarla todavía).
- El chip de filtro por moneda original en Transacciones (`filter-bar.tsx`) pasa de COP/USD a las 3 monedas (`CURRENCY_CODES`), con el mismo `<SelectChip>`.
- `lib/db/database.types.ts` se actualiza a mano con la nueva firma de `dashboard_totals` (no se corrió `db:types`: esta fase no toca el Supabase real).
- Tests: `supabase/tests/dashboard_totals.sql` (las 3 monedas, un día sin tasa que usa la última disponible, un par sin ninguna tasa, y lo mismo visto desde otra moneda elegida) contra Postgres local; `lib/dashboard/aggregate.test.ts` reescrito para filas ya convertidas.

## [0.17.0] - 2026-10-19

### Añadido (fase E2.1: cierra EUR en los selectores binarios)

- Metas, deudas, suscripciones/recurrentes y la cuenta creada desde el modal de transacción usan el mismo segmented de 3 monedas (COP/USD/EUR) que ya tenía `transaction-modal`. Se quita el resguardo "si displayCurrency es EUR cae a USD" de `goal-modal.tsx`, `debt-modal.tsx`, `subscription-modal.tsx` y `transaction-modal.tsx`: el valor por defecto vuelve a ser `displayCurrency`, o la última moneda usada en ese formulario (`lib/money/last-currency.ts`, nuevo módulo compartido con `CURRENCY_OPTIONS`, `readLastCurrency` y `writeLastCurrency`, reemplaza el código que antes vivía solo en `transaction-modal.tsx`).
- `lib/goals/schema.ts`, `lib/debts/schema.ts`, `lib/recurring/schema.ts` y `lib/accounts/actions.ts` validan las 3 monedas (`z.enum(CURRENCY_CODES)`, antes `z.enum(["COP", "USD"])`); `account-create-form.tsx` pasa de un `<SelectField>` binario al mismo segmented de 3 monedas.
- Revisado: `lib/debts/payoff.ts` (avalancha/bola de nieve), `lib/goals/status.ts` y `lib/recurring/schedule.ts`/`state.ts` nunca miran la moneda (solo bigint y fechas): ya funcionaban con EUR sin tocarlos.
- `subscriptions-view.tsx` agrega el conteo "N en EUR" al desglose (antes solo COP/USD).
- Revisada la lista completa de `["COP", "USD"]` fijos o comparaciones binarias de moneda: no queda ninguna fuera de la página de ejemplo `/dev/design-system` y el chip "Moneda: Todas/COP/USD" de filtros de Transactions (ambos documentados aparte, pendientes de su propio diseño).
- Verificado: el `<Modal>` del desglose de totales ya se comporta como bottom sheet en móvil (menos de 600 px) por construcción — es el mismo componente que usan todos los modales de la app, con grabber, esquinas redondeadas arriba y gesto de arrastre. No hizo falta ajustarlo.
- Tests: `lib/goals/schema.test.ts`, `lib/debts/schema.test.ts` (meta y deuda en EUR) y `lib/recurring/schema.test.ts`, nuevo (recurrente en EUR, y que COP/USD sigan funcionando); `lib/dashboard/aggregate.test.ts` agrega un caso con displayCurrency = EUR y gastos en las 3 monedas (con y sin la tasa EUR/USD, para confirmar `partial`).

## [0.16.0] - 2026-10-19

### Añadido (fase E2: UI de 3 monedas)

- `DESIGN_SPEC.md` §4 reescrito con la regla de Ivern para 3 monedas (displayCurrency COP/USD/EUR, línea secundaria, insignia neutra, tasa de la fecha del movimiento, chip de tasas, accesibilidad).
- `displayCurrency` pasa de COP/USD a **COP/USD/EUR** en todo el cliente: `<RateProvider>` ahora guarda `rates: Rate[]` (todas las tasas conocidas, no solo una) y el selector de la topbar (`DisplayCurrencyToggle`) tiene las 3 opciones.
- Migración `0020_profile_eur_display.sql`: el CHECK de `profiles.display_currency` (de `0001_auth_households.sql`) solo dejaba COP/USD; sin esto, elegir EUR en el selector guardaba bien en la app pero fallaba al llegar a la base. Prueba: `supabase/tests/profile_eur_display.sql`.
- `<MoneyAmount>` se reescribe con `variant="row" | "total"` (antes `kind`): fila muestra el original con una insignia neutra solo si difiere, sin `≈`; total no lleva línea de conversión, sino un texto "Convertido con tasas del día" que abre un sheet (reusa `<Modal>`) con el desglose por moneda de origen. `otherCurrency()` se elimina de `lib/money/convert.ts` (y de los 4 sitios que la usaban como parche de E1).
- `lib/money/convert.ts` agrega `latestRateFor` y `rateAt` (tasa más reciente o vigente a una fecha, para cualquier par, a partir de una lista de tasas) — los usan `<MoneyAmount>`, el chip de tasas, `lib/dashboard/aggregate.ts`, `lib/household/balance.ts` y `lib/household/budget.ts`, generalizados de una sola tasa a una lista (hacían falta hasta 2 tasas distintas para sumar 3 monedas en una).
- `goal-card.tsx`: la meta siempre se muestra en su propia moneda; si difiere de displayCurrency, una sola línea "≈ … ahorrado" (solo lo ahorrado).
- `transaction-modal.tsx`: segmented de 3 monedas (por defecto, la última usada en ese tipo, en `localStorage`); la línea de conversión se recalcula en cada tecla sin animación, con los casos "misma moneda", "tasa faltante" y "campo vacío" (nunca "≈ 0"), extraídos a la función pura `lib/transactions/conversion-line.ts`; cambiar de moneda nunca convierte el monto escrito y se anuncia con `aria-live="polite"`.
- Presupuestos y liquidación parcial (`household/budget-modal.tsx`, `household/actions.ts`) aceptan las 3 monedas (en E1 habían quedado binarios).
- Metas, deudas, recurrentes y la cuenta que se crea desde el modal de transacción siguen con selector binario COP/USD (sin diseño propio para EUR todavía): si `displayCurrency` es EUR, su valor por defecto cae a USD en vez de proponer una moneda que su propio selector no ofrece.
- `lib/money/format.ts` formatea EUR igual que USD (prefijo `€`, 2 decimales).
- Revisado el cron de tasas (E1): ya registra con `logServerError` cada par que falla, aunque los otros dos funcionen; no hizo falta cambiarlo.
- Textos nuevos en `messages/es.json` y `messages/en.json` (money, transactions.modal, savings, rateChip).
- Tests: `lib/transactions/conversion-line.test.ts` (los 4 casos del modal), `components/money/money-amount.test.tsx` reescrito para 3 monedas, y ajustes en los tests de `convert`, `rates`, `aggregate` y `balance` para la nueva firma con `rates: Rate[]`.

## [0.15.0] - 2026-10-19

### Añadido (fase E1: EUR)

- EUR es moneda válida en toda la base: migración `0019_eur_currency.sql` la agrega a `currencies` (2 decimales). Como `currency` referencia ese catálogo por FK, cuentas, transacciones, deudas, recurrentes, metas, presupuestos y liquidaciones la aceptan sin tocar su definición. Prueba: sección 9 de `supabase/tests/rls_finance.sql`.
- Tasas de cambio para los 3 pares (alcanza uno por par; `convert()` usa la inversa cuando hace falta):
  - USD/COP: TRM oficial (como hoy), con open.er-api.com de respaldo.
  - EUR/USD: Frankfurter (`api.frankfurter.app`, Banco Central Europeo), con open.er-api.com de respaldo (reciprocal de su tasa USD→EUR).
  - EUR/COP: derivada (EUR/USD × USD/COP); no se deriva si falta cualquiera de los dos. Nunca se inventa una tasa: si una fuente falla se prueba la siguiente, y si todas fallan se conserva la última conocida.
  - `lib/money/rate-sources.ts` y `lib/money/rates.ts` se generalizan a cualquier par (antes, solo USD/COP). El cron (`/api/cron/rates`) ahora trae y guarda los 3 pares cada vez; responde 502 solo si fallan los 3.
- `lib/money/convert.ts` pierde `otherCurrency()` (asumía exactamente 2 monedas). Los 4 sitios de UI que lo usaban (`components/money/money-amount.tsx`, `goal-card.tsx`, `transaction-modal.tsx`) quedan con un `otherCurrency()` local idéntico al de antes (binario COP/USD): el significado de "la otra moneda" con 3 monedas es una decisión de diseño que no corresponde a esta fase de datos.
- Por lo mismo, los presupuestos (`household/budget-modal.tsx`, `household/actions.ts`) y la liquidación parcial siguen aceptando solo COP/USD en la UI y su validación, aunque la base ya admite EUR.
- No se agregó ningún campo de "tasa usada" a ninguna fila: hoy ningún movimiento cruza monedas al guardar (todo exige una sola moneda o convierte solo al mostrar). Queda para la fase que introduzca el primer movimiento cross-currency real.

## [0.14.15] - 2026-10-18

### Cambiado

- `lib/db/database.types.ts` incluye `member_write_bypassed`, la función de la migración `0018`.

## [0.14.14] - 2026-10-17

### Corregido (M-03: repartos, aportes y liquidaciones dentro del hogar)

- Un miembro ya no puede, por la API, crear, editar ni borrar los repartos de una transacción que no es suya, un aporte a nombre de otra persona, ni una liquidación en la que no es quien paga ni quien recibe. Migración `0018_member_write_scope.sql`. Quien guarda su propio gasto compartido sigue creando el reparto de los dos (`save_transaction`).
- Siguen igual el escape de `delete_account_data`, salir o quitar a un miembro, y el candado de un gasto con un ex miembro (solo categoría y nota).
- Prueba: `supabase/tests/member_write_scope.sql`.

## [0.14.13] - 2026-10-17

### Cambiado (beta, cierre)

- `/privacidad` y `/terminos` ya no muestran la franja de borrador. Se quitó `legal.draftNotice`.
- El login ya no muestra el aviso de versión de prueba. Se quitó `auth.loginNotice`. Del aviso y de los términos salieron los apartados que solo pedían cifras inventadas o decían que era una beta. En los términos queda la frase de que se ofrece tal cual, sin garantía.
- `docs/security/AUDIT.md` cierra cada hallazgo: corregido, aceptado con razón o pendiente. M-02 y M-03 siguen pendientes.
- `docs/BETA_CHECKLIST.md` queda en el aislamiento de 0.14.12 y marca solo lo que prueba `household_isolation.sql`.

## [0.14.12] - 2026-10-17

### Añadido (beta, B4: aislamiento entre hogares y seguridad)

- `supabase/tests/household_isolation.sql` (Postgres local): DOS hogares reales sin relación (cada uno con dueño y miembro) más un usuario sin hogar, cubriendo transacciones, repartos, liquidaciones, invitaciones, lectura de `households`/`household_members` y lo que exporta `lib/export/backup.ts` (mismas tablas, bajo RLS con la anon key y el access token del usuario, igual que la ruta real).
- Suplantación probada también por RPC, no solo con insert/update directo: `save_transaction` con un `household_id` ajeno o un `paid_by` de otro hogar; `leave_household` y `remove_household_member` llamados contra un hogar al que quien llama nunca perteneció.
- Dos tipos de ex miembro, en los dos hogares: salida voluntaria (`leave_household`, queda con su nombre real) y borrado de cuenta (`delete_account_data`, queda reasignado al usuario fantasma, sin nombre). Se confirma que el usuario fantasma —compartido por todos los borrados de cuenta de toda la app— nunca es miembro de ningún hogar, así que no puede servir de puente de visibilidad entre hogares sin relación.
- B-07 (`docs/security/AUDIT.md`) reconfirmado con los dos hogares y los ex miembros de este archivo: `household_has_member` y `transaction_has_former_member` siguen dando la misma respuesta para "de otro hogar" y "no existe" (la prueba a fondo de `security definer` y `search_path` fijo ya vive en `supabase/tests/definer_scope.sql`).
- Ajuste de sesión `ember.account_deletion` (0017): se confirma por introspección de `pg_proc` que ninguna función de `public` lo enciende salvo `delete_account_data`, y que no existe ningún `public.set_config` que PostgREST pudiera exponer como RPC (`set_config` vive en `pg_catalog`, fuera de lo que PostgREST traduce desde una petición HTTP). Como defensa en profundidad, se fuerza el ajuste a mano con una sesión autenticada normal (el rol `authenticated` sí puede ejecutar ese `set_config`: no es un privilegio especial) y se confirma que RLS, al ser independiente de ese ajuste, sigue bloqueando la lectura y la escritura cruzada entre hogares igual que siempre.

## [0.14.11] - 2026-10-17

### Añadido (beta, B3: eliminar cuenta y datos)

- Ajustes, sección "Privacidad y datos": recuerda exportar el CSV (texto legal `account.exportNotice`/`exportButton`) y un botón "Eliminar mi cuenta" que abre la confirmación con el texto legal (`account.deleteTitle`, `deleteBody`, `deleteSharedNote`). Dos formas equivalentes de confirmar, iguales a las de otras acciones irreversibles: mantener presionado 2 s, o escribir "ELIMINAR" ("DELETE" en inglés).
- RPC `delete_account_data` (`supabase/migrations/0017_account_deletion.sql`), `security definer` con `search_path` fijo, sin parámetros (solo actúa sobre `auth.uid()`, nunca sobre un id que mande el cliente). Valida todo antes de tocar nada:
  - si administra un hogar con más miembros, se bloquea (`owns_household_with_members`), sea cual sea el saldo;
  - si en un hogar con otro miembro el saldo no está en cero, se bloquea (`balance_not_settled`);
  - si es el único miembro de un hogar, el hogar entero se borra (en cascada);
  - si es miembro (nunca dueño) de un hogar con otro miembro y el saldo está en cero, lo compartido de ese hogar (cuentas, metas, recurrentes, presupuestos, transacciones, repartos, liquidaciones, aportes) se reasigna a un usuario fantasma fijo y sale del hogar; el hogar y su historial siguen intactos para quien se queda.
- Usuario fantasma ("Usuario eliminado"): una cuenta real de Supabase Auth, creada una sola vez con la Admin API (nunca con SQL directo sobre `auth.users`), sin contraseña y con un correo del dominio reservado `.invalid` (nunca resuelve). `deleted_account_sentinel` guarda su id en una sola fila (truco de tabla singleton). `household_departures.deleted_account` marca esa salida para que la pantalla de Hogar muestre "Usuario eliminado" en vez del nombre.
- Después de que la RPC confirma `ok:true`, una Server Action borra la cuenta de verdad con la Admin API (`createAdminClient`, server-only, después de verificar la sesión con `getUser`), que en cascada se lleva el perfil y todo lo personal que quedaba (transacciones, metas, deudas, cuentas, presupuestos, recurrentes, consentimientos).
- Por qué hace falta el usuario fantasma: `owner_id` es inmutable (trigger `forbid_column_change`, por diseño) y `transaction_splits.user_id` es parte de su llave primaria, así que una fila compartida no puede quedar "sin dueño". Tres candados que ya existían (`forbid_column_change`, `lock_former_member_transaction/splits/settlement`, `enforce_write_rate_limit`) ahora revisan primero un ajuste de sesión (`ember.account_deletion`, local a la transacción) que solo `delete_account_data` enciende, reasigna y apaga antes de devolver el resultado; ninguna otra vía puede activarlo.
- Tests en Postgres local (`supabase/tests/account_deletion.sql`): sin usuario fantasma se detiene; sin sesión se detiene; dueño de un hogar con otro miembro se bloquea aunque el saldo esté en cero; saldo pendiente se bloquea y nada cambia; nadie puede borrar a otro (la función no recibe ningún id); único miembro borra el hogar entero; con saldo en cero se reasigna todo (transacciones, repartos, meta compartida, liquidaciones) al fantasma y el saldo de quien se queda no cambia; 225 filas en una sola llamada no chocan con el límite de 120 escrituras por minuto; las funciones siguen siendo `security definer` (las que ya lo eran) con `search_path` fijo.

## [0.14.10] - 2026-10-17

### Añadido (beta, B2: aviso y términos)

- `/privacidad` y `/terminos` son públicas, en el idioma de la cookie, con el texto legal en el orden de las claves. Muestran el aviso de borrador y la versión `2026-10-v1`.
- El pie del login y Ajustes enlazan esas páginas. `{contactEmail}` sale de `NEXT_PUBLIC_CONTACT_EMAIL`. Si falta o no es un correo, la app no arranca.
- `/.well-known/security.txt` publica Contact, Expires (un año desde el 2026-10-17), Preferred-Languages y Canonical.

## [0.14.9] - 2026-10-17

### Añadido (beta, B1: consentimiento)

- Casilla obligatoria en el login, para el correo y para Google. Sin marcarla no se envía el enlace ni se abre Google, y se muestra el error del texto legal.
- Si la cuenta ya existe (o acaba de entrar con Google) y no tiene el consentimiento de la versión vigente, una pantalla bloquea la app hasta aceptarlo. La exportación tampoco se entrega.
- Tabla `consents`: tipo (`privacy` o `terms`), versión del texto y fecha. Cada quien solo ve y crea los suyos. No se edita, no se borra y no se guarda la IP.
- La versión del texto es `2026-10-v1`. Si cambia, se vuelve a pedir. Hay que aplicar la migración (`pnpm db:push`) para que guardar funcione en el proyecto.

## [0.14.8] - 2026-10-17

### Seguridad (auditoría, M-04: límites)

- Tabla `rate_limits` y función `consume_rate_limit` (security definer, `search_path` fijo). Exportar: 3 por hora. Crear un enlace: 8 por hora. Aceptar un enlace: 8 cada 15 minutos, en la misma tabla. Escrituras: 120 por minuto, también si llegan directo a la base.
- La exportación responde 429 con `Retry-After` y un texto en es y en. El resto de acciones muestra ese texto cuando la base rechaza la fila.
- El cron de purga borra los intentos de más de un día.
- Los límites de login, enlace mágico y OTP se configuran en el panel de Supabase Auth (no salen del repo).

## [0.14.7] - 2026-10-17

### Corregido (auditoría, B-07)

- `household_has_member` y `transaction_has_former_member` siguen siendo `security definer` con `search_path` fijo. Comprueban `auth.uid()` y, si el hogar o la transacción no son del usuario, responden `false`, lo mismo que si el id no existiera.
- Test SQL con dos hogares en Postgres local.

## [0.14.6] - 2026-10-17

### Cambiado (auditoría, fase 2: fugas)

- Las rutas cron, la exportación y el dashboard responden una clave genérica. El detalle queda en `lib/log/server.ts`, que no imprime el objeto de error ni montos, correos ni tokens.
- `next.config.ts` apaga `X-Powered-By` y deja explícito que no se publican source maps del navegador.
- El enlace mágico muestra el mismo resultado si el correo ya tenía cuenta o no. El fallo de envío ya no pide revisar el correo.
- El service worker se prueba con fetches reales: no guarda `/api`, auth ni datos financieros.

## [0.14.5] - 2026-10-17

### Seguridad (auditoría, fase 1: secretos)

- No hay llaves que rotar: la fase 0 no encontró ningún secreto real en el historial, el bundle, `NEXT_PUBLIC_*` ni la caché del service worker.
- `CRON_SECRET` exige al menos 32 caracteres (B-02). La variable de Vercel tiene que cumplirlo o el build falla. El README pide `openssl rand -hex 32` (64 caracteres).
- La validación del entorno se detiene si alguna `NEXT_PUBLIC_*` se llama como un secreto o contiene una llave de servidor de Supabase (JWT `service_role` o `sb_secret_`), y si la anon key es en realidad la service role. El error nombra la variable sin mostrar su valor.
- `pnpm build` corre `scripts/check-client-bundle.mjs`: busca en `.next/static` y `public/` el valor real de la service role y de `CRON_SECRET` y patrones de llaves. Si encuentra algo, el build falla y Vercel no publica.
- Hook de pre-commit sin dependencias nuevas (`.githooks/pre-commit`, activado por `prepare` al hacer `pnpm install`). Frena archivos `.env*` (salvo `.env.example`), llaves y líneas con secretos.
- `.gitignore`: `*.key`, `*.p12`, `*.pfx`, credenciales JSON y los ZIP de respaldo.
- Tests: detector de secretos, validación del entorno (nombres, valores, largo de `CRON_SECRET`, que el error no muestre el valor) y frontera servidor/cliente. Se comprobó a mano que el hook y el chequeo del bundle fallan con un secreto falso.

## [0.14.4] - 2026-10-17

### Corregido (auditoría, fase 0.5: A-01)

- Los tests de base de datos ya no tocan el proyecto real de Supabase.
  - `scripts/db-tests.mjs` corre con `psql` contra `TEST_DATABASE_URL`, nunca con `supabase db query --linked`.
  - `scripts/db-test-url.mts` aborta con un mensaje claro si falta la variable, si el host no es `localhost`, `127.0.0.1` o `::1`, si la URL menciona Supabase o si la base no termina en `_test`.
  - `pnpm test:db:fresh` borra y crea de nuevo solo esa base local. Antes borraba las tablas de `public` en producción dentro de una transacción con ROLLBACK.
- README: la descripción de `test:db:fresh` decía "base local" y no lo era. Ahora hay una sección "Pruebas de base de datos" con la instalación de Postgres 17 en Mac (Homebrew) y Windows y cómo crear la base de pruebas. CLAUDE.md: probar las migraciones en local antes de `db:push`.

### Añadido

- `supabase/tests/local-bootstrap.sql`: roles `anon`, `authenticated` y `service_role`, el esquema `auth` con `auth.users` y `auth.uid()` (lee `request.jwt.claim.sub` o `request.jwt.claims`), y los permisos por defecto de Supabase en `public`. Las migraciones se aplican tal cual, sin Docker.
- `TEST_DATABASE_URL` en `.env.example`.
- Tests de la guardia de la URL. Contra Postgres 17 local pasan los 9 archivos SQL, por separado (`test:rls`) y juntos (`test:db:fresh`).

## [0.14.3] - 2026-10-17

### Añadido

- `docs/security/AUDIT.md`: fase 0 de la auditoría de seguridad (solo lectura, sin cambios en el código). No hay secretos en el historial ni en el cliente, ni acceso entre hogares o usuarios. Hallazgos: 1 alta (los tests de base de datos corren contra el proyecto real), 4 medias (`connect-src` con comodín, cookies de sesión sin `httpOnly`, integridad dentro de un hogar, falta de límites), 9 bajas y 7 informativas, cada una con su fase de corrección.

## [0.14.2] - 2026-10-17

### Corregido

- En el teléfono, "Continuar con Google" (y cualquier botón) no respondía al toque: React no hidrataba, el botón quedaba como HTML sin `onClick` y el segundo toque solo hacía zoom. Había dos causas, reproducidas emulando un iPhone con toques reales:
  - **Desarrollo por la red local** (`http://192.168.x.x:3000`): Next 16 bloquea `/_next/hmr` para orígenes que no son localhost y el cliente de desarrollo no arrancaba. Se agregó `allowedDevOrigins` con los rangos de red privada y `*.local` (solo afecta a `pnpm dev`).
  - **Producción**: la CSP con nonce y `'strict-dynamic'` bloqueaba los `<script>` del esqueleto que Next prerenderiza con `cacheComponents` (13 de 23 sin nonce, incluido el arranque de Turbopack). La guía de CSP de Next 16 dice que PPR y nonce son incompatibles. La CSP pasa a `script-src 'self' 'unsafe-inline'` sin nonce ni hash, y se mantienen las demás directivas (`object-src 'none'`, `base-uri`, `frame-ancestors`, `form-action`, `connect-src` solo a Supabase). El proxy ya no genera nonce.
- `touch-action: manipulation` en botones, enlaces, chips y controles: sin zoom por doble toque y sin la espera de 300 ms; el pellizco sigue funcionando. El resaltado al tocar ya era transparente (preflight de Tailwind v4).
- Highlight (píldora del sidebar) y Tooltip reaccionan al hover solo con mouse. En iOS un toque dispara `pointerenter` y, si el DOM cambia antes del clic, Safari toma el primer toque como hover.
- Revisado sin cambios: el meta viewport ya era `width=device-width, initial-scale=1` y los campos ya usaban 16 px en el teléfono.

### Añadido

- Tests: la CSP no lleva nonce, hash ni `strict-dynamic`; un toque no mueve el Highlight ni abre el Tooltip, el mouse sí; el botón es `type="button"` con `onClick` directo; el CSS tiene `touch-action` y los 16 px.

## [0.14.1] - 2026-10-17

### Cambiado

- Desarrollo y producción usan el mismo proyecto de Supabase. El README ya no pide enlazar un proyecto y volver a enlazar otro.
- `pnpm db:push` pide escribir el ref del proyecto enlazado antes de aplicar migraciones.
- `pnpm db:seed:demo` se niega a correr contra ese proyecto. `supabase/seed.sql` aborta si se ejecuta.

## [0.14.0] - 2026-10-17

### Añadido (fase 14: producción, seguridad y respaldo)

- README con la lista de variables de producción (Vercel, entorno Production, proyecto de Supabase distinto al de desarrollo) y los tres cron de `vercel.json`: tasas a las 13:00 UTC, borrado definitivo a las 13:30 y ocurrencias a las 13:45.
- `supabase/tests/rls_enabled.sql` falla si alguna tabla de `public` no tiene RLS, o si `anon` o `authenticated` tienen `BYPASSRLS`. Se corre con `pnpm test:rls` y, ya enlazado el proyecto de producción, con `pnpm exec supabase db query --linked -f supabase/tests/rls_enabled.sql`.
- Cabeceras de seguridad (nosniff, DENY, referrer, Permissions-Policy, COOP, CORP, HSTS) y CSP por petición: scripts con nonce y el hash del arranque de tema, sin `unsafe-inline` en scripts.
- Aceptar una invitación admite 8 intentos por persona cada 15 minutos (`invite_rate_limited`). El intento se guarda aunque el enlace no sirva.
- Ajustes, Acerca de: atribución "Uicons designed by Flaticon from Flaticon", con enlaces, como pide la licencia gratuita.
- Ajustes, Respaldo: botón Exportar CSV. Descarga un ZIP con un CSV por tabla (montos en unidades menores). El texto de la pantalla y el `README.txt` del archivo explican cómo restaurar. No hay importación automática.

### Cambiado

- `getServerEnv()` vive en `lib/env-server.ts`. El módulo que importa el cliente no nombra la service role ni `CRON_SECRET`.
- `accept_invite` devuelve jsonb. Un enlace inválido ya no lanza excepción: si lo hiciera, la base desharía el conteo del límite.

## [0.13.0] - 2026-10-17

### Añadido (fase 13: responsive, PWA y accesibilidad)

- Tres anchos, según `docs/Phone/ember-cash-mobile-1-frames/` y `docs/Phone/full/`. Bajo 600 px la navegación es una barra inferior de 5 pestañas con etiqueta. De 600 a 1023 px, un rail de 96 px con los 7 destinos y Ajustes. Desde 1024 px sigue la sidebar de 248 px y el contenido llega a 1128 px.
- En teléfono y tablet la topbar lleva el título, el selector de moneda y el botón circular. La tasa y el mes van en filas propias. El interruptor Personal / Compartido del shell solo se ve en escritorio; en Hogar sigue en la página.
- Pantalla Más, con conteos reales de deudas, suscripciones y miembros. Esas rutas, y Ajustes, dejan activa la pestaña Más.
- Bajo 600 px el modal es un bottom sheet: grabber, esquinas de 28 px y arrastre (goma a partir de 160 px, cierra si baja más de 96). Se cierra también con la X, Esc o el velo. Desde 600 px el modal sigue centrado, con escala y opacidad en 220 ms y sin arrastre.
- En pantallas angostas las transacciones son una lista (categoría y cuenta bajo el nombre). El calendario bajo 600 px muestra hasta 3 puntos con forma; desde 600 px siguen los chips y el contorno animado.
- PWA: manifest, íconos, `apple-touch-icon` y service worker. La caché `ember-static-v1` solo guarda el cascarón offline y recursos estáticos. No guarda navegaciones, RSC, `/api/`, `/auth/` ni orígenes cruzados. Si no hay red, la navegación cae en `public/offline.html`.
- Objetivos táctiles de al menos 44 px, inputs a 16 px en el teléfono, `viewport-fit=cover` y `theme-color` por esquema.

## [0.12.0] - 2026-10-17

### Añadido (fase 12: animaciones)

- Movimiento de la spec §7. `MotionConfig reducedMotion="user"` en los proveedores.
- Solo en la primera carga de cada pantalla (`lib/motion/first-view.ts`): el Number Ticker de los totales, el llenado de barras y anillos, y la entrada de las listas. Al volver a la pantalla, todo aparece al instante.
- Presión a escala 0.97 (botones y `.press-scale`). Con `prefers-reduced-motion` esa escala no se aplica.
- Highlight (`layoutId`) en el ítem activo del sidebar, los controles segmentados y el contorno de la categoría elegida.
- Modal: el velo se desvanece y la superficie escala de 0.96 a 1 con opacidad en 220 ms; el cierre recorre el mismo camino. Se cierra con Esc, el velo o la X.
- Animated List en transacciones, suscripciones y próximos pagos. Una fila que llega o se va se acomoda con `layout`, sin revelar la lista de a una.
- Sliding Number en la línea de conversión del modal de transacción: ruedan las cifras y el resto del texto queda fijo.
- Calendario: el contorno del día elegido se desliza entre celdas (`layoutId` por mes, absoluto, sin cambiar el tamaño de la celda). Al cambiar de mes hay un fundido cruzado de 150 ms; los dos meses ocupan la misma celda para no duplicar la altura.
- Con movimiento reducido no hay desplazamientos ni dibujado del anillo. El ticker y el Sliding Number muestran el valor final; la opacidad puede fundirse. Tests del calendario, del movimiento reducido y de abrir y cerrar el modal.

## [0.11.2] - 2026-10-17

### Cambiado

- Token nuevo `--budget-warn-bar` para la barra ámbar del presupuesto compartido (de 80 % al límite): en claro #936316 (el mismo `amber-text`), en oscuro #FFB224 (el ámbar de siempre). Solo lo usa esa barra; los distintivos y demás usos del ámbar no cambian.
- En claro, esa barra pasa de 2,72 a 4,38 contra su pista y da 5,20 contra la tarjeta. En oscuro sigue en 6,18 y 9,93.
- Se quitó el test PENDIENTE. Los pares nuevos pasan con ≥3:1, y un test fija que las barras gris y roja no cambiaron (claro 4,34 y 3,29; oscuro 3,25 y 3,84 contra la pista).

## [0.11.1] - 2026-10-17

### Añadido

- Test del estado de error del dashboard (`app/(app)/(shell)/_dashboard/slots.test.tsx`), con `dashboard_totals` simulada como caída:
  - solo las 5 tarjetas que dependen de esa consulta (balance, ingresos, gastos, categorías y tendencia) muestran "Reintentar";
  - próximos pagos, metas, deudas y suscripciones siguen con sus datos;
  - "Reintentar" vuelve a pedir la página;
  - si solo fallan las metas, solo esa tarjeta queda en error;
  - un `redirect` interno de Next no se traga.
- Contraste de los estados del presupuesto compartido (pendiente de la fase 10):
  - en oscuro pasan los tres (barra contra pista: ámbar 6,18, rojo 3,84 y gris 3,25; contra la tarjeta, 9,93, 6,17 y 5,22);
  - en claro pasan el rojo (3,29), el gris (4,34) y los textos;
  - la barra ámbar en claro da 2,72 contra su pista (menos de 3:1) y queda en un test PENDIENTE hasta decidir cómo corregirla.

### Cambiado

- Las tarjetas del dashboard (slots) pasan a `_dashboard/slots.tsx` para poder probarlas, porque un `page.tsx` solo puede exportar la página. No cambia nada visible.

## [0.11.0] - 2026-10-17

### Añadido (fase 11: dashboard)

- Dashboard con datos reales, según el scope, la moneda elegida y el mes de la topbar:
  - balance del mes (hero), ingresos y gastos, con la variación contra el mes anterior;
  - gastos por categoría en barras ordenadas con su color;
  - tendencia de 6 meses (verde y naranja gráfico, valor directo y tooltip);
  - próximos pagos de 7 días, desde los vencimientos (incluye los vencidos y los mínimos de deuda);
  - metas de ahorro, deudas y suscripciones.
- Cada tarjeta enlaza a su pantalla: Transacciones filtrada por mes, tipo o categoría, Calendario, Ahorros, Deudas y Suscripciones. "Agregar" abre el modal de transacciones en el dashboard. El interruptor Personal / Compartido aparece también aquí.
- Migración `0012_dashboard.sql`: RPC `dashboard_totals`, que suma en la base por mes, tipo, categoría y moneda (sin borradas ni transferencias). Una sola llamada por petición alimenta las cinco tarjetas de dinero. No hizo falta un índice nuevo: con 200.000 transacciones sintéticas el plan usa `transactions_owner_occurred_idx` (o `transactions_household_occurred_idx` en un hogar) y tarda 37 ms.
- Cada tarjeta tiene su propio estado de carga (Suspense con su esqueleto), de error (con "Reintentar"; las demás siguen) y vacío (cuenta nueva sin datos).
- `lib/dashboard/aggregate.ts` (funciones puras) con tests: COP y USD mezclados, mes sin datos, variación contra un mes anterior vacío (devuelve null, no divide por cero), balance anterior negativo, orden de categorías, 6 meses que cruzan el año y eje del gráfico.
- Token `--hero-chip` (distintivo dentro del hero, texto blanco, en el test de contraste). Estilo de fecha `monthShort` y formato compacto (`f.compact`). `MoneyAmount` acepta `unitClassName` y `suffixClassName`.

## [0.10.2] - 2026-10-17

### Cambiado (regla de suscripciones de la fase 9)

- Se elimina el registro automático. El modal de suscripciones ya no tiene "Registrar sola" ni la cuenta asociada. Migración `0011_manual_occurrences.sql`: se borra la columna `recurring_items.auto_post`.
- El cron `/api/cron/occurrences` ya no crea transacciones. Deja al día los pagos de deuda, materializa vencimientos y marca como "Vencida" (`overdue`, estado nuevo) los que tienen fecha pasada y nadie confirmó (RPC `mark_overdue_occurrences`, solo para la service role). Los vencimientos ya atrasados se marcaron en la migración.
- En Suscripciones y en el calendario, el cobro de hoy aparece como "Por pagar" y uno pasado sin confirmar como "Vencida". "Marcar como pagado" abre un modal con la fecha real de pago (por defecto hoy, no puede ser futura) y la cuenta. Es lo único que crea la transacción, y en el calendario se marca de a un vencimiento. Una vencida también se puede reprogramar y vuelve a quedar programada.
- `post_occurrence` exige un usuario: sin `auth.uid()` falla con `not_authenticated`, y la service role ya no puede ejecutarla. Recibe la fecha real de pago (`p_paid_on`); el reparto en un hogar usa esa fecha.
- Salir del hogar (0.10.1) ya no apaga nada, así que se quitaron el aviso de suscripciones sin cobro automático y la columna `household_departures.auto_post_disabled`. La columna `notice_dismissed_at` queda sin uso.
- Tests: el cron nunca crea transacciones (Vitest, sin llamadas a `post_occurrence` ni a la tabla `transactions`); en SQL, sin usuario no se registra nada, la service role no ejecuta `post_occurrence`, marcar vencidas no crea transacciones ni toca a otros dueños, una vencida se paga con la fecha real y `auto_post` ya no existe. Estado visible en `lib/recurring/state.ts`, con tests.

## [0.10.1] - 2026-10-17

### Añadido (fase 10.1: salir del hogar)

- RPC `leave_household` (la persona sale) y `remove_household_member` (quien administra quita a otra persona). Las dos exigen que el neto de esa persona sea 0 en todas las monedas (`balance_not_settled`). Quien administra no puede salir (`owner_cannot_leave`). "Salir del hogar" y "Quitar" en el modal de miembros, en dos pasos, con el motivo traducido si hay saldo pendiente. Quien sale vuelve al scope Personal.
- El historial queda tal cual: gastos, repartos, liquidaciones y aportes conservan su usuario. Tabla `household_departures` (con RLS) guarda el nombre, y el hogar muestra a esa persona como "Nombre (ex miembro)".
- Lo que el ex miembro creó en el hogar se queda en el hogar. A sus suscripciones compartidas se les apaga el cobro automático, y el hogar muestra un aviso que cualquier miembro puede cerrar.
- Un gasto compartido con reparto o pagador de un ex miembro queda bloqueado: monto, moneda, fecha, pagador, cuenta, tipo, descripción, borrado y reparto. Solo se pueden editar la categoría y la nota (el modal deshabilita lo demás y lo explica). Una liquidación con un ex miembro no se edita ni se borra. Lo hacen cumplir triggers en la base; `save_transaction` no rehace el reparto de un gasto bloqueado. La purga de lo ya borrado sigue funcionando.
- Tests en `supabase/tests/household_leave.sql`: no se puede salir con saldo (tampoco con saldo en USD ni con una liquidación parcial), con saldo en cero sí; el historial se conserva; el ex miembro deja de ver los datos del hogar; los gastos con su reparto quedan bloqueados salvo categoría y nota; se apaga el cobro automático; quien administra no puede salir; un miembro no puede quitar a otro; borrar el hogar sigue funcionando en cascada.

### Corregido

- `post_occurrence` (migración `0010_household_leave.sql`) reparte como `save_transaction`: solo entre quienes ya eran miembros en la fecha del vencimiento; si nadie cumple, todo para quien paga. Rechaza un pagador que ya no es miembro (`payer_not_member`). Tests iguales a los de `save_transaction`.

## [0.10.0] - 2026-10-17

### Añadido (fase 10: hogar y gastos compartidos)

- Interruptor Personal / Compartido en el shell (Transacciones, Ahorros, Suscripciones, Calendario y Hogar). Cambia el scope de toda la app. Sin hogar, Compartido abre un modal para crear uno (y pasar a Compartido) o unirse con el enlace de invitación. La tarjeta de usuario muestra el hogar cuando el scope es Compartido.
- Pantalla Hogar: tarjetas de miembros (lo pagado en gastos compartidos del mes, su porcentaje y el reparto 50/50) y Liquidar cuentas (quién le debe a quién, con el equivalente en la otra moneda). Gastos compartidos del mes con filtro por quién pagó y el reparto de cada uno. Presupuesto compartido con sus estados: gris por debajo de 80 %, ámbar de 80 % al límite y rojo por encima ("103 % usado, sobre el presupuesto"). Meta compartida con los aportes por miembro e historial de liquidaciones. "Agregar gasto compartido" abre el modal de transacciones con "Pagó".
- `lib/household/balance.ts`: balance por moneda (gastos, ingresos compartidos y liquidaciones), conversión con la tasa más reciente y transferencias mínimas. Tests con varias combinaciones, montos impares, COP y USD mezclados, tres miembros, liquidación parcial, total y pago de más. También `lib/household/budget.ts` (porcentaje y estado) y `split.ts` (etiqueta 50 / 50), con tests.
- Liquidar: Total guarda una liquidación por moneda con saldo (el servidor recalcula el balance) y deja el balance en 0 con cualquier tasa. Parcial guarda un monto en la moneda elegida, hasta lo que se debe. Las dos se deshacen desde el toast.
- Presupuestos compartidos por categoría y mes: crear, editar, quitar (con Deshacer) y copiar los de un mes anterior.
- Invitar y ver miembros desde Hogar, con el flujo de la fase 2.
- Migración `0009_household_rules.sql`: `save_transaction` reparte solo entre los miembros que ya eran del hogar en la fecha del gasto (un gasto anterior queda entero para quien pagó; el miembro nuevo igual lo ve). `budgets.month` (primer día del mes) y los índices únicos pasan a ser por categoría y mes. Tests en `supabase/tests/household_rules.sql`.

### Cambiado

- `ProgressBar` acepta el color del relleno (`barClassName`).

## [0.9.1] - 2026-10-17

### Añadido

- Tests del día 31 (febrero, abril y bisiesto), de las 23:30 en Bogotá (el vencimiento no pasa al día siguiente de UTC) y del cron a las 13:45 UTC (hoy es el día de Bogotá).

## [0.9.0] - 2026-10-17

### Añadido (fase 9: suscripciones y calendario)

- Motor de fechas en `lib/recurring`: semanal, mensual y anual, con intervalo y `ends_on`. Un mensual anclado al 31 cae el último día de los meses más cortos; un anual del 29 de febrero cae el 28 cuando el año no es bisiesto. Las fechas usan la zona del perfil (`America/Bogota` por defecto). `ensureOccurrences` materializa 90 días hacia adelante y es idempotente (unique por ítem y fecha, y no recrea una fecha movida). Tests de fin de mes, bisiestos, pausa y cancelación.
- `GET /api/cron/occurrences`, protegido con `CRON_SECRET`, a diario (08:45 en Bogotá). Materializa vencimientos y, si `auto_post` está activo, registra la transacción del día solo para suscripciones. Las facturas y los días de cobro quedan pendientes. Los pagos mínimos de deuda también quedan pendientes.
- Pantalla Suscripciones: total mensual, total anual, activas y próximo cobro; filtro Todas / Mensuales / Anuales; cobros de 14 días. Crear, editar, pausar y cancelar (cancelar se deshace con el toast).
- Pantalla Calendario: mes de lunes a domingo, tres tipos (pago por vencer, día de cobro, recurrente), "+N más", panel del día con "Marcar como pagado" y "Reprogramar" (mueve solo esa ocurrencia y guarda `rescheduled_from`). Resumen del mes y próximo día de cobro. El total del día va en la moneda elegida.
- El campo Repetir del modal de transacciones (Nunca, Semanal, Mensual, Anual) crea el recurrente al guardar una transacción nueva. Una transferencia no se repite.
- El pago mínimo de una deuda abierta genera ocurrencias `debt_payment` y aparecen en el calendario. Registrar el pago en Deudas marca el vencimiento de ese mes.
- RPC `post_occurrence`: crea la transacción del vencimiento (y el reparto, si es del hogar) y lo marca pagado en la misma transacción de base de datos. Columna `subtitle` en los recurrentes.

## [0.8.2] - 2026-10-17

### Cambiado

- La barra de porcentaje pagado de las deudas usa, en oscuro, el naranja gráfico #FF7A2E (token `--debt-bar`); en claro sigue con ember-fill #C6500B.
- El test pendiente de contraste pasa a ser normal: #FF7A2E sobre la pista #3B3B40 da 4,28:1 (y 6,17:1 sobre surface2), por encima de 3:1.
- Excepción anotada en DESIGN_SPEC.md, junto a la regla del naranja como dato.

## [0.8.1] - 2026-10-17

### Cambiado

- La barra de porcentaje pagado de las deudas usa ember-fill (#C6500B en claro y oscuro), según el uso del naranja como dato de DESIGN_SPEC §1, en lugar de verde.
- Test de contraste: ember-fill sobre su pista y sobre el fondo de la fila. En claro cumple (3,88 y 4,24); en oscuro cumple contra la fila (3,48) pero queda en 2,41 contra la pista #3B3B40, por debajo de 3:1. Se documenta como pendiente.

## [0.8.0] - 2026-10-17

### Añadido (fase 8: deudas)

- Pantalla Deudas (04/14-debts.png): resumen (saldo total, mínimos mensuales, interés del mes, fecha libre de deudas), lista ordenable por vencimiento, saldo o interés, con saldo, tasa, pago mínimo, porcentaje pagado, próximo vencimiento (en rojo si faltan 10 días o menos) y "original" para deudas en otra moneda.
- Crear y editar deudas (moneda, principal original, tasa anual EA o nominal, pago mínimo, día de pago). Registrar pagos separa interés (estimado y editable) y capital, y puede crear la transacción vinculada.
- `lib/debts/payoff.ts`: simulador puro (avalancha y bola de nieve, pago extra opcional, presupuesto con efecto bola de nieve). Tasa mensual (1 + EA)^(1/12) − 1 o nominal/12, guardada con 12 decimales; interés redondeado a la unidad menor con mitades lejos de cero; aritmética entera. Detecta cuando los pagos no cubren los intereses y no entra en bucle. Tests con casos verificados a mano.
- Gráfica "Plan de pago" con selector avalancha / bola de nieve y tarjeta "Paga X extra al mes" (meses e interés ahorrados; monto sugerido editable).
- Borrado irreversible: mantener 2 s (puntero o Enter/Espacio) o dos pasos, con 6 s para deshacer (deleted_at) y borrado definitivo al vencer; el cron de purga también limpia deudas.

### Cambiado

- Los porcentajes de progreso se redondean al más cercano, como en los frames (6,8 de 12 → 57 %), sin mostrar 100 % antes de completar.

## [0.7.0] - 2026-10-17

### Añadido (fase 7: ahorros)

- Pantalla Ahorros (03/13-savings.png): tarjetas de total ahorrado, aportes mensuales y progreso total; una tarjeta por meta con anillo de progreso, ahorrado, objetivo, equivalente, mensual, restante y fecha objetivo; tarjeta punteada para crear. Subtítulo con el número de metas y el progreso total; "Nueva meta" en la topbar.
- Crear y editar metas (nombre, ícono, objetivo y moneda, fecha objetivo y aporte mensual opcionales) y registrar aportes en la moneda de la meta, opcionalmente vinculados a una transacción.
- `lib/goals/status.ts`: estado calculado (nunca guardado). "Casi lista" con 95 % o más; si no, se compara lo ahorrado con lo esperado en línea recta entre started_on y target_date. Tests para cada estado, fechas pasadas, sin fecha y fechas invertidas.
- Reglas de moneda: una meta en otra moneda se muestra convertida con "original US$ 640,00 de US$ 1.200,00"; en la misma moneda, con "≈" en la otra. Sin tasa, el original queda como principal.
- Archivar meta con toast y Deshacer; estados vacío, cargando y error.
- Primitivas: anillo y barra de progreso, campo de fecha compartido; `<MoneyAmount>` acepta sufijo ("/mes") y tamaño de la línea secundaria.
- Validación zod de metas y aportes (sin retiros: el aporte debe ser mayor que 0 y no futuro).

## [0.6.0] - 2026-10-17

### Añadido (fase 6: transacciones)

- Scope de datos (Personal por defecto, cookie `ec-scope` validada contra la membresía) que respetan todas las consultas de cuentas y transacciones. El interruptor visible llega en la fase 10.
- Pantalla Transacciones (02-transactions.png): lista agrupada por día (Hoy, Ayer, fecha), búsqueda, filtros de categoría, cuenta, moneda original y rango de fechas (este mes por defecto), pestañas Todas / Ingresos / Gastos, paginación del servidor ("Mostrando 9 de 42"), tooltip de conversión por fila y estados vacío, cargando y error. Selector de mes y "Agregar transacción" en la topbar; el subtítulo cuenta las transacciones.
- Modal agregar/editar (07/17-add-transaction.png): Gasto / Ingreso / Transferencia, monto grande con COP/USD y su conversión, categorías en chips, fecha, cuenta, "Pagó" (solo en un hogar), notas y validación ("Escribe un monto mayor que 0"). Las transferencias mueven dinero entre cuentas y no cuentan como ingreso ni gasto.
- Borrado con toast de 6 s y Deshacer (`deleted_at`); borrado definitivo al vencer el toast y cron diario `/api/cron/purge-deleted` para los que queden.
- Migración `0007_save_transaction.sql`: RPC `save_transaction` (SECURITY INVOKER) que guarda la transacción y, si es compartida, sus repartos en partes iguales en una sola transacción; tests en `supabase/tests/save_transaction.sql`.
- Cuentas en Ajustes: crear, renombrar, archivar y desarchivar. El modal ofrece crear una si no hay ninguna.
- Server Actions con validación zod (el mismo esquema que el formulario); sin service role en el cliente.
- Primitivas: chip de selección, campo de selección, buscador, área de texto y modal (Base UI Dialog).
- Tests: validación del formulario, agrupación por día, filtros, fechas, Deshacer restaura, purga.

### Cambiado

- `<MoneyAmount>` muestra el número en negrita y "COP" más pequeño, con signo y color para ingresos/gastos.
- El control segmentado es un poco más angosto (como en los frames).
- `rls_finance.sql` ya no asume que `exchange_rates` está vacía.

## [0.5.0] - 2026-10-17

### Añadido (fase 5: dinero y tasa de cambio)

- `lib/money`: tipo `Money` (`amountMinor: bigint` + moneda), suma, resta, comparación, formato exacto con Intl según el exponente (COP 0, USD 2) y parseo del input según el idioma.
- Conversión `convert(money, to, rate)` con bigint y redondeo de mitades lejos de cero; `totalIn` suma por moneda y convierte una vez con la tasa más reciente.
- `GET /api/cron/rates` protegida con `CRON_SECRET`: TRM oficial (datos.gov.co) con respaldo open.er-api; valida forma y rango y guarda en `exchange_rates` con `fetched_at` y `source`. Si ambas fuentes fallan responde 502 y conserva la última tasa. Cron diario en `vercel.json`.
- Chip de tasa en la topbar con la tasa real y sus 4 estados: fresca, vieja (más de 24 h, ámbar, clic refresca), actualizando (conserva el ancho; lo convertido baja al 60 %) y error (Reintentar; la última tasa queda en el tooltip). Sin la etiqueta SAMPLE. Sin red pasa a error.
- Selector COP/USD en la topbar que guarda `profiles.display_currency`.
- Componentes `<MoneyAmount>` (fila con "original US$ 2,99" cuando la moneda difiere; total con "≈" en la otra moneda; tooltip con tasa y fecha), `<CurrencyFilter>` ("Moneda: Todas / COP / USD", por moneda original) y `<CurrencyBadge>` neutra.
- Tests: 0, 1, 12 dígitos, negativos, redondeo COP y USD, ida y vuelta, parseo, fuentes de la tasa, ruta del cron, los 4 estados del chip y las reglas de `<MoneyAmount>`.

### Cambiado

- El formato de dinero sale de `lib/i18n/format.ts` y pasa a `lib/money/format.ts` (exacto, con bigint); `useFormat().money` recibe un `Money`.
- `tsconfig` apunta a ES2022 (literales bigint).

## [0.4.1] - 2026-10-16

### Añadido

- Internacionalización con next-intl: español (por defecto) e inglés, sin prefijos en la URL. Todas las cadenas de la UI pasan a `messages/es.json` y `messages/en.json` (shell, login, onboarding, invitación, hogar, ajustes, primitivas y `/dev/design-system`). Secciones en español: Panel, Transacciones, Ahorros, Deudas, Suscripciones, Calendario, Hogar y Ajustes.
- Migración `0006_profile_locale.sql` (el número 0005 ya estaba usado): `profiles.locale` ('es' | 'en', por defecto 'es'), con tests en `supabase/tests/profile_locale.sql`. Selector de idioma en Ajustes; el idioma del perfil se aplica al entrar desde otro dispositivo.
- Formatos según el idioma (`lib/i18n/format.ts`, `useFormat`): números y fechas con es-CO / en-US; el dinero sigue la spec (COP sin decimales, USD con 2, US$ delante y COP detrás).
- Tests: paridad de claves y variables entre idiomas, formatos, textos en español de las primitivas.
- Regla en CLAUDE.md: ninguna cadena de UI en el código; cada texto va en es y en en.

### Cambiado

- La etiqueta del ítem activo del sidebar usa ember-text, como dice DESIGN_SPEC §1 (5.10:1 en claro, 8.25:1 en oscuro; par agregado al test de contraste).
- Los errores de las RPC de hogares se traducen por clave (`householdErrorKey`).
- Textos en español neutro: "enlace" en vez de "link", "hogar" en vez de "household", bienvenida sin marca de género.

## [0.4.0] - 2026-10-16

### Añadido (fase 4: sistema de diseño y shell)

- Tokens de la spec (claro y oscuro) como variables CSS y tema de Tailwind: colores, escala tipográfica Inter (mínimo 12 px, tracking por tamaño), radios, sombras. Los valores que la spec no lista (toast, deshabilitado, control segmentado) se muestrearon de `19-states.png` / `20-states-dark.png`.
- Tema claro/oscuro/sistema por clase, sin parpadeo (script inline + cookie), sincronizado con `profiles.theme`; selector en Settings.
- `prefers-reduced-motion` (MotionConfig y CSS), `prefers-reduced-transparency` y `prefers-contrast: more`. Anillo de foco único de 2 px con offset 2 (#BD490A / #FF9552).
- `@flaticon/flaticon-uicons` 3.3.1 y componente `<Icon>` como único punto de acceso, con equivalencias en lucide-react.
- Shell según `01-dashboard.png`: sidebar de 248 px con nombres visibles, topbar de 72 px, tarjeta de usuario con engranaje. Rutas vacías: Dashboard, Transactions, Savings, Debts, Subscriptions, Calendar, Household y Settings.
- Primitivas con todos sus estados: botones, campos, chips y badges, control segmentado, filas, navegación, estado vacío, skeleton, toast con Undo (6 s, pausa con hover/foco), tooltip, chip de tasa de cambio y borrado irreversible (mantener 2 s con puntero o teclado, y dos pasos).
- `/dev/design-system` (solo en desarrollo) con todo en claro y oscuro.
- Tests: contraste de tokens (port de `docs/contrast.py`, leyendo `globals.css`), tamaño mínimo de 12 px, registro de íconos, borrado irreversible, toast y `cn` con la escala tipográfica.
- Logo del paquete `docs/design/logos` como componente y favicon (`app/icon.svg`).
- Frames de diseño, logos, `contrast.py` y `pal.py` en `docs/`.

### Cambiado

- La UI del household (fase 2) pasa de la página principal a `/household`; login, onboarding e invitación usan las primitivas nuevas. Se eliminan `components/provisional/`.
- `cn` se configura con la escala tipográfica propia para no descartar tamaños al combinarlos con colores.

## [0.3.2] - 2026-10-16

### Cambiado

- Migración `0005_transfer_splits.sql`: el trigger diferido de repartos excluye las transferencias (`kind = 'transfer'`). Una transferencia, personal o compartida, no lleva repartos ni se le exige que sumen; si trae repartos falla con `transfer_has_splits`. El trigger de `transactions` ahora también se dispara al cambiar `kind`.
- Tests: transferencia sin repartos pasa (compartida y personal), con repartos falla, convertir en transferencia un gasto con repartos falla y el gasto compartido sigue exigiendo que los repartos sumen.

## [0.3.1] - 2026-10-16

### Añadido

- Migración `0004_finance_validations.sql`:
  - CHECK en `debt_payments`: `interest_minor + principal_minor = amount_minor`.
  - Constraint trigger diferido (`DEFERRABLE INITIALLY DEFERRED`) en `transaction_splits` y `transactions`: en una transacción compartida la suma de `share_minor` debe ser igual a `amount_minor`; una transacción personal no lleva repartos. Se comprueba al hacer COMMIT, así que la transacción y sus repartos se pueden crear en sentencias separadas dentro de la misma transacción de base de datos.
- Tests para ambos casos (suma correcta pasa, suma incorrecta falla) en `supabase/tests/rls_finance.sql`.

### Cambiado

- Esquema sin cambios en importes: cada fila guarda el importe en su moneda original y la conversión se hace al leer (decisión confirmada; la sección 8 del spec no se modifica).

## [0.3.0] - 2026-10-16

### Añadido (fase 3: modelo financiero)

- Migración `0003_finance_model.sql` (el nombre `0002` ya lo usaba `0002_revoke_handle_new_user.sql`): `currencies` (COP 0, USD 2), `categories` fijas y sembradas, `exchange_rates`, `accounts`, `transactions`, `transaction_splits`, `goals`, `goal_contributions`, `debts`, `debt_payments`, `recurring_items`, `recurring_occurrences`, `budgets` y `settlements`. Todo importe es `*_minor bigint` en la moneda original de la fila.
- RLS en todas las tablas: lo personal solo lo ve y edita su owner; lo compartido, cualquier miembro del household. `owner_id` y `settlements.created_by` son inmutables; las referencias a otras filas (cuenta, meta, deuda, recurrente, transacción) deben ser visibles para quien escribe; `paid_by`, los repartos, los aportes y las liquidaciones solo pueden nombrar miembros del household.
- Catálogos y `exchange_rates` de solo lectura para usuarios (escribe el service role). Se revocan `TRUNCATE`, `REFERENCES` y `TRIGGER` a `authenticated` en todas las tablas, también las de `0001`.
- Tests SQL en `supabase/tests/rls_finance.sql` y runner `scripts/db-tests.mjs` (`pnpm test:rls`, `pnpm test:db:fresh`).
- Tipos de la base en `lib/db/database.types.ts`, expuestos con alias y uniones literales en `lib/db/types.ts`.

## [0.2.0] - 2026-10-16

### Añadido (fase 2: auth y households)

- Migración `0001_auth_households.sql`: `profiles` (con trigger que lo crea al registrarse), `households`, `household_members` y `household_invites` (solo se guarda el hash SHA-256 del token, vence a 7 días). RLS en todas las tablas, privilegios de columna recortados, `is_household_member` / `is_household_owner` SECURITY DEFINER, y RPC `create_household`, `accept_invite` (un solo uso, máximo 2 miembros vía `max_household_members()`) y `get_household_members`.
- Columna `profiles.onboarded_at` para saber si el usuario terminó el onboarding (la opción "Usar solo yo" no deja rastro en otras tablas).
- Migración `0002_revoke_handle_new_user.sql`: quita el permiso de ejecutar el trigger por RPC (lo señaló `supabase db advisors`).
- Tests RLS en `supabase/tests/rls_households.sql` (`pnpm test:rls`) con usuarios A, B y C.
- `/login` (Google y link mágico), `/auth/callback`, `/auth/confirm`, `/auth/signout`, `proxy.ts` que refresca la sesión, grupo protegido `(app)`, `/onboarding` y `/invite/[token]`. El owner genera links de invitación desde la página principal.
- Tipos de la base en `lib/supabase/database.types.ts` (`pnpm db:types`) y scripts `db:push` y `test:rls`.
- Tokens de diseño provisionales en `app/globals.css` y `components/provisional/` (los reemplaza la fase 4).

## [0.1.0] - 2026-10-16

### Añadido (fase 1: base del proyecto)

- Proyecto Next.js 16.4.2 (App Router) con TypeScript estricto, Tailwind v4, pnpm, ESLint, Prettier y Vitest.
- shadcn/ui inicializado; `motion` y `lucide-react` instalados.
- Supabase: `supabase init`, carpeta `supabase/migrations` vacía y clientes `@supabase/ssr` en `lib/supabase/client.ts` y `lib/supabase/server.ts`.
- `lib/env.ts`: validación de variables de entorno con zod al arrancar, con mensaje claro si falta alguna. `.env.example` como plantilla.
- Página inicial "Ember Cash" y ruta `GET /api/health`.
- Script `pnpm check` (lint, typecheck y tests), README con pasos para Mac y Windows, y `CLAUDE.md` con las reglas del proyecto.
