# Ember Cash: correcciones de Ivern (contraste, color semántico, monedas, motion)

Todos los ratios están calculados por Ivern con la fórmula WCAG 2.x a partir de los hex (script en /workspace/ivern/pal.py). Umbrales: texto normal 4.5:1, elementos gráficos y bordes de controles 3:1 (WCAG 1.4.11). Reglas de apple-design/emil citadas entre paréntesis. Son datos de ejemplo.

## 1. Tokens corregidos (reemplazan a los del DESIGN_SPEC donde se indica)

### Light

| Token                  | Antes              | Ahora                                                      | Ratio                           | Uso                                                                     |
| ---------------------- | ------------------ | ---------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| ember (500)            | #F26B1D            | #F26B1D (se mantiene solo para gráficos, iconos y anillos) | 3.05 vs blanco                  | NO usar como fondo de texto ni como texto                               |
| ember-fill             | (ember)            | #C6500B                                                    | blanco sobre él 4.61            | fondo botón primario                                                    |
| ember-fill-press       | -                  | #AF470A                                                    | blanco 5.63                     | hover/press del botón primario                                          |
| ember-grad-start / end | #FF8A3D to #D9540B | #C84F00 to #B24509                                         | blanco 4.59 a 5.60              | tarjeta hero y barras de pago; el texto blanco nunca cae bajo 4.5       |
| ember-text             | #D9540B            | #BD490A                                                    | 5.10 blanco, 4.68 sobre ember50 | enlaces ("Details", "All goals"), texto naranja pequeño, anillo de foco |
| text2                  | #6E6E73            | #56565C                                                    | 7.29 blanco, 6.69 canvas        | texto secundario                                                        |
| text3                  | #A1A1A6            | #6D6D71                                                    | 5.15 blanco, 4.73 canvas        | líneas "≈ US$", etiquetas, ejes. Antes 2.57                             |
| positive-text          | #1FA971            | #177B52                                                    | 5.26 blanco                     | +4.600.000, "On track"                                                  |
| negative-text          | #E5484D            | #C03C41                                                    | 5.30 sobre red_bg               | "Due Oct 22"                                                            |
| info-text              | #3B82F6            | #3069C7                                                    | 5.29 sobre blue_bg              | chips azules                                                            |
| violet-text            | #8B5CF6            | #784FD4                                                    | 5.43 sobre violet_bg            | chips Subscriptions                                                     |
| amber-text             | #F5A524            | #936316                                                    | 5.20 sobre amber_bg             | chips Food, "Behind". Antes 1.85                                        |
| pink-text              | #EC5A8F            | #C24A75                                                    | 4.64 blanco                     | chips Leisure                                                           |

Si prefieren conservar el naranja vivo #F26B1D en botones: usar texto #1D1D1F sobre él (5.53:1) en lugar de blanco. Mi recomendación es el naranja profundo con texto blanco, que se acerca al aspecto Apple y no depende de texto oscuro sobre marca.

Regla: texto de estado = tokens `-text` (sobre su `_bg`); fills de barras, anillos y puntos = tokens `-graphic` (>= 3:1 vs blanco):
positive-graphic #1EA26C (3.26), negative-graphic #E5484D (3.91), amber-graphic #C2821C (3.23), violet-graphic #8B5CF6 (4.23), blue-graphic #3B82F6 (3.68), pink-graphic #EC5A8F (3.27), teal-graphic #0F9E8E (3.33), olive-graphic #6F8F1E (3.73), slate-graphic #64748B (4.76).

### Dark (sobre surface #171719)

| Token                       | Valor                                                                                                                | Ratio                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| text2                       | #A1A1A8                                                                                                              | 6.97                                                         |
| text3                       | #8A8A90 (antes #6E6E76 = 3.54)                                                                                       | 5.22                                                         |
| ember-text                  | #FF9552                                                                                                              | 8.25                                                         |
| texto de chips sobre su _bg | positivo #3DD68C 8.39, negativo #FF6369 5.84, ámbar #FFB224 8.54                                                     | ok                                                           |
| expense-bar                 | #FF7A2E                                                                                                              | 6.88                                                         |
| income-bar                  | #A6EBCB (menta clara; #3DD68C junto al naranja daba solo 1.39 entre sí)                                              | 1.9 vs naranja (distinguible por luminosidad), 13.1 vs fondo |
| hero                        | NO usar el degradado claro #FF9552; usar el mismo degradado profundo que en light con texto blanco (#C2410C da 5.18) |                                                              |

## 2. Gráficos (WCAG 1.4.11)

- 6-month trend: ingresos `#177B52` (5.26 vs blanco), gastos `ember #F26B1D` (3.05). Antes durazno #FFCBA8 = 1.46:1 sobre blanco. Entre sí difieren en luminosidad (1.73:1), no solo en tono, para que no dependa de ver rojo/verde. Etiqueta directa del valor en la barra del mes activo y tooltip en hover.
- Donut: reemplazar por barras horizontales ordenadas de mayor a menor con valor y % al final (la leyenda ya lo tiene; NN/g desaconseja donuts: https://www.nngroup.com/articles/dashboards-preattentive/). Si se queda el donut, etiqueta directa en cada segmento.
- Tracks de progreso (#EBEBF0 = 1.19 vs blanco) son decorativos porque el valor está escrito al lado; el relleno sí debe cumplir 3:1 (ember 3.05 ok).
- Dark: track #3B3B40 en lugar de #2C2C32 (1.61 vs 1.29 sobre surface).

## 3. Color semántico, un significado por color

- Ember = marca y acción primaria SOLAMENTE. Quitarlo de: categoría Housing, miembro Isaac, barras de gasto en Household, píldora "Almost there" (usar positive-text con texto "Almost there" o neutro), "Payment due" del calendario (usar negative-text).
- Categorías: Housing teal #0F9E8E, Food amber #C2821C, Transport blue #3B82F6, Subscriptions violet #8B5CF6, Health olive #6F8F1E, Leisure pink #EC5A8F, Other slate #64748B. Siempre con etiqueta de texto (no solo color).
- Insignia de moneda USD: neutra, fondo #EEF1F6 y texto #475569 (6.69). El azul queda para Transport.
- Miembros de Household: Isaac ink #1D1D1F, Sofia slate #5F6B85 (distinguibles por luminosidad, sin chocar con categorías ni marca).
- Presupuestos: relleno neutro hasta 79 %, ámbar desde 80 %, rojo desde 100 %, con texto "96 % used". Hoy Food al 96 % se ve igual que lo normal.
- Estados de metas: On track = positive-text, Behind = amber-text, Almost there = positive-text. Un solo color por estado.
- Una sola acción primaria naranja por pantalla: en Household, "Settle up" pasa a botón secundario o "Add shared expense" pasa a secundario.
- Flechas de las tarjetas del dashboard: el icono de la tarjeta es neutro (sin flecha); la dirección y el color van solo en el distintivo de variación. Hoy Ingresos lleva flecha abajo y +4,2 % flecha arriba.

## 4. Montos y monedas, una regla

1. La moneda seleccionada va siempre arriba y grande. La original, si difiere, va debajo en text3 12 px ("original US$ 15.99").
2. Insignia COP/USD solo cuando la moneda de la transacción difiere de la moneda de la cuenta. Quitar la columna Currency de Transactions (el sufijo del monto ya lo dice).
3. Línea "≈" solo en totales, tarjetas hero y vista de detalle, no en cada fila de lista. En hover de la fila, tooltip con la conversión y la tasa/fecha.
4. Subscriptions: una misma columna no mezcla US$ y COP; mismo ítem, mismo monto en la tarjeta y en la lista lateral.
5. Tamaños mínimos de texto: 12 px. Las etiquetas de 10-11 px (Debts, Savings, calendario) suben a 12.
6. Nunca truncar importes ni fechas (break-ui). Probar con 0, 1, 1.000+ filas, importes negativos y de 12 dígitos.

## 5. Motion, alineado con frecuencia de uso (emil-design-eng) y apple-design

- Quitar: Number Ticker en cada cambio de moneda/mes (dejarlo solo en la primera carga del dashboard), entrada escalonada en cada visita, transición de página en la navegación lateral, Border Beam permanente del hero, hover lift en tarjetas no clicables, arrastrar para cerrar el modal en escritorio (basta Esc, clic fuera y botón).
- Conservar: `whileTap scale 0.97` en pointer-down 100 ms, modal 200-250 ms (el spec dice 0.4 s; es acción frecuente), tooltips con delay inicial y luego instantáneos, check de éxito al guardar, toast con "Deshacer" en lugar de confirmaciones, hold-to-confirm 2 s para borrados irreversibles.
- Curvas: ease-out `cubic-bezier(0.23,1,0.32,1)`; spring por defecto bounce 0, duración 0.4.
- Reduced motion, transparency y contrast: tal como está en el spec.

## 6. Cosas por añadir a los mockups

- Estados: foco (anillo 2 px `ember-text` #BD490A, offset 2; el ember #F26B1D da 2.80 sobre canvas), hover, press, deshabilitado, error de campo, vacío, carga (skeleton), toast con Deshacer.
- Calendario: día con 4+ eventos ("+2 más") y celda de hoy seleccionada a la vez.
- Modal de gasto: "Repeat" por defecto en "Never", no "Monthly".
- Modo oscuro de las otras nueve pantallas, con los tokens oscuros de arriba.
- Hoja de diseño: igualar tamaños con el spec (Title 1 26 Bold, Title 2 22 Bold; hoy la hoja dice 28 Bold y 22 Semibold) y ligar los colores a las variables (hoy no están ligados).
- Selector de mes: ocultarlo en Savings y Subscriptions, o indicar qué filtra.
- Tokens text3/text2 ahora son muy cercanos en claro; mantener jerarquía por tamaño y peso, no solo por gris.
