# Ember Cash: onboarding + ayuda contextual (Ivern x Nova, cruzado por Ember)

Meta: dashboard con un dato real del usuario en 2-3 min. Todo saltable, progreso guardado (onboarding_step), claves i18n, copy en archivos separados.

## Wizard (máx 4 pasos + bienvenida)

0. Bienvenida: "Tu dinero, claro y en calma." Primario Empezar; secundario "Ya tengo cuenta". "Explorar con datos de ejemplo" y la etiqueta SAMPLE no se implementan (no hay modo demo; fase 17).
1. Moneda principal: COP/USD/EUR (EUR entra porque Kai ya lo está implementando), preseleccionada por locale, tasa real del día (nunca inventada). Sin explicar multimoneda más allá de una línea.
2. Primera cuenta + saldo actual (tipo, nombre, moneda, saldo opcional; tarjeta de crédito pide cupo y día de pago).
3. "¿Qué quieres controlar primero?": ahorros, deudas o suscripciones; crea UN elemento (si elige suscripciones, chips comunes: Arriendo, Internet, Celular, Gimnasio, Streaming).
4. Final: dashboard con ese dato, explicación corta de cómo leerlo y aviso del botón de ayuda. Tarjeta "Primeros pasos" con lo pendiente (registrar un gasto, meta de ahorro, deuda, invitar al hogar).
   Fuera del wizard: hogar/pareja (va en Primeros pasos), categorías personalizadas, notificaciones, importar datos; invitación PWA en la 2ª visita.
   Omitir: aplica defaults, sin modal. Repetir: Ajustes > Ayuda > "Repetir la introducción", precarga valores, nunca duplica ni borra.
   Motion/a11y: según Ivern (16 px + fade 200 ms ease-out, reduced-motion solo fade, foco al título, aria-live, errores con texto+icono).

## Botón de ayuda

Icono 44x44 siempre en el mismo sitio (escritorio barra superior junto al toggle de moneda, tecla "?"; móvil fila del subtítulo). Panel lateral 360 px no modal en escritorio, bottom sheet en móvil. Estructura: propósito (1-2 frases), Qué ves aquí (con "Mostrar" que resalta la sección), Qué puedes hacer (3-4 acciones), FAQ (2-3), pie con Repetir introducción. Popovers de jerga al tocar (Avalanche/Snowball, APR, SAMPLE, 50/50). Punto en la primera visita, nada automático que tape. Contenido en help/<ruta>.es.json.
Páginas: Panel, Transacciones, Ahorros, Deudas, Suscripciones, Calendario, Hogar, Ajustes.

## Métricas (Nova)

Eventos primero: % que termina el wizard y paso de abandono, % que crea un elemento en la 1ª sesión, tiempo al dashboard con datos, retorno a 7 días, aperturas de ayuda por página.

## Fases

F1 eventos + wizard. F2 ayuda en Panel, Deudas, Suscripciones. F3 ayuda en el resto + repetir tour + ajustes por métricas. (EUR ya incluido en el paso 1.)
