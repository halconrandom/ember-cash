# Ember Cash: copy de onboarding y ayuda contextual (es)

Autora: Leona. Tono claro, cercano y en calma. Sin emojis, sin guiones largos.
Supuestos a confirmar: "SAMPLE" = etiqueta de datos de ejemplo; "50/50" = reparto de gastos del hogar; APR = tasa efectiva anual de deudas. {placeholders} van tal cual.

## 1. Wizard (onboarding.*)

### 0. Bienvenida

- welcome.title: Tu dinero, claro y en calma.
- welcome.body: En un par de minutos verás tu primer dato real. Puedes saltar cualquier paso.
- welcome.primary: Empezar
- welcome.login: Ya tengo cuenta
- (fase 17) No hay modo demo ni la línea "Explorar con datos de ejemplo". No uses la clave welcome.sample.

### Comunes

- common.next: Continuar
- common.back: Atrás
- common.skip: Omitir por ahora
- common.skipAll: Saltar la introducción
- common.progress: Paso {step} de {total}
- common.saved: Guardamos tu avance.

### 1. Moneda principal

- currency.title: ¿En qué moneda piensas tu dinero?
- currency.help: Será la moneda de tus totales. Puedes registrar movimientos en otras cuando quieras.
- currency.cop: Peso colombiano (COP)
- currency.usd: Dólar (USD)
- currency.eur: Euro (EUR)
- currency.rate: Tasa de hoy: 1 {from} = {rate} {to}. Fuente: {source}.
- currency.rateUnavailable: No pudimos traer la tasa de hoy. Lo intentaremos de nuevo; tus montos no cambian.
- currency.error: Elige una moneda para seguir.

### 2. Primera cuenta

- account.title: Agrega tu primera cuenta
- account.help: Donde tienes tu plata: una cuenta de ahorros, efectivo o una tarjeta. El saldo es opcional.
- account.typeLabel: Tipo
- account.types.savings: Cuenta de ahorros
- account.types.checking: Cuenta corriente
- account.types.cash: Efectivo
- account.types.credit: Tarjeta de crédito
- account.types.wallet: Billetera digital
- account.nameLabel: Nombre
- account.namePlaceholder: Ej.: Ahorros Bancolombia
- account.currencyLabel: Moneda
- account.balanceLabel: Saldo actual (opcional)
- account.balancePlaceholder: 0
- account.limitLabel: Cupo total
- account.limitPlaceholder: Ej.: 3.000.000
- account.payDayLabel: Día de pago
- account.payDayPlaceholder: Ej.: 15
- account.payDayHelp: El día del mes en que vence el pago de la tarjeta.
- account.errors.name: Ponle un nombre a la cuenta.
- account.errors.balance: Escribe solo números. Puedes dejarlo vacío.
- account.errors.limit: El cupo debe ser un número mayor que cero.
- account.errors.payDay: Usa un día entre 1 y 31.
- account.errors.save: No pudimos guardar la cuenta. Revisa tu conexión e inténtalo otra vez.

### 3. ¿Qué quieres controlar primero?

- focus.title: ¿Qué quieres controlar primero?
- focus.help: Elige una cosa. Lo demás lo agregas cuando quieras.
- focus.savings: Ahorros
- focus.savingsHelp: Una meta y cuánto llevas.
- focus.debts: Deudas
- focus.debtsHelp: Cuánto debes y cuándo pagas.
- focus.subscriptions: Suscripciones y pagos fijos
- focus.subscriptionsHelp: Lo que se cobra cada mes.
- focus.error: Elige una opción o toca Omitir por ahora.

Ahorros:

- focus.goal.nameLabel: ¿Para qué ahorras?
- focus.goal.namePlaceholder: Ej.: Viaje a México
- focus.goal.targetLabel: Meta
- focus.goal.currentLabel: Lo que ya llevas (opcional)
- focus.goal.dateLabel: Fecha objetivo (opcional)
- focus.goal.errors.target: La meta debe ser mayor que cero.

Deudas:

- focus.debt.nameLabel: Nombre de la deuda
- focus.debt.namePlaceholder: Ej.: Crédito de libre inversión
- focus.debt.balanceLabel: Cuánto debes hoy
- focus.debt.rateLabel: Tasa de interés anual (opcional)
- focus.debt.paymentLabel: Cuota mensual (opcional)
- focus.debt.dueDayLabel: Día de pago (opcional)
- focus.debt.errors.balance: Escribe cuánto debes, mayor que cero.
- focus.debt.errors.rate: Usa un porcentaje entre 0 y 100.

Suscripciones:

- focus.sub.chipsLabel: Elige una o escribe la tuya
- focus.sub.chips: Arriendo, Internet, Celular, Gimnasio, Streaming
- focus.sub.nameLabel: Nombre
- focus.sub.namePlaceholder: Ej.: Internet
- focus.sub.amountLabel: Valor
- focus.sub.dayLabel: Día de cobro
- focus.sub.errors.amount: El valor debe ser mayor que cero.
- focus.sub.errors.day: Usa un día entre 1 y 31.

- focus.create: Guardar y ver mi panel

### 4. Final

- done.title: Listo. Este es tu panel.
- done.body: Arriba ves tu total en {currency}. Debajo, lo que acabas de agregar. Cada número se actualiza cuando registras algo.
- done.helpHint: Si algo no se entiende, toca el botón de ayuda. También puedes presionar la tecla ?.
- done.cta: Entendido

### Tarjeta Primeros pasos (firstSteps.*)

- title: Primeros pasos
- subtitle: {done} de {total} listos
- expense: Registra un gasto
- goal: Crea una meta de ahorro
- debt: Agrega una deuda
- household: Invita a alguien a tu hogar
- householdHelp: Comparte gastos y metas con tu pareja o con quien vivas.
- dismiss: Ocultar
- complete: Ya tienes lo básico. Aquí lo dejamos.

### Omitir y repetir

- skipped.toast: Sin problema. Usamos valores por defecto y puedes cambiarlos en Ajustes.
- replay.label: Repetir la introducción
- replay.help: Verás tus datos actuales. No se borra ni se duplica nada.

### Invitación PWA (2ª visita)

- pwa.title: Tenlo a un toque
- pwa.body: Añade Ember Cash a tu pantalla de inicio y ábrelo como una app.
- pwa.install: Añadir a inicio
- pwa.iosSteps: En Safari, toca Compartir y luego Añadir a pantalla de inicio.
- pwa.later: Ahora no

## 2. Panel de ayuda (help/<ruta>.es.json)

Comunes (help.common.*): button: Ayuda · close: Cerrar · whatYouSee: Qué ves aquí · whatYouCanDo: Qué puedes hacer · faq: Preguntas frecuentes · show: Mostrar · replay: Repetir la introducción · newDot: Nuevo: aquí tienes ayuda

### Panel

- purpose: Tu dinero en una mirada. Aquí ves cuánto tienes, qué viene y cómo vas.
- see: Tu total en la moneda principal. · Saldos por cuenta. · Próximos pagos. · Tus metas y deudas activas.
- do: Registrar un gasto o ingreso. · Cambiar la moneda con el selector de arriba. · Tocar cualquier tarjeta para ver el detalle.
- faq1.q: ¿Por qué mi total no cuadra con el banco? a: Solo suma lo que registraste aquí. Revisa que el saldo inicial de cada cuenta esté al día.
- faq2.q: ¿Qué tasa usan para convertir? a: La tasa real del día. Si no se pudo traer, usamos la última disponible y te lo indicamos.

### Transacciones

- purpose: Todo lo que entra y sale, en orden.
- see: La lista de movimientos por fecha. · Categoría, cuenta y moneda de cada uno. · Filtros arriba.
- do: Agregar un movimiento. · Editar o borrar uno tocándolo. · Filtrar por fecha, cuenta o categoría. · Buscar por nombre.
- faq1.q: ¿Puedo registrar en otra moneda? a: Sí. Elige la moneda al crearlo y lo convertimos para tus totales.
- faq2.q: Me equivoqué en un monto. a: Toca el movimiento, corrígelo y guarda. Los saldos se recalculan solos.

### Ahorros

- purpose: Tus metas y cuánto te falta para cada una.
- see: Cada meta con su barra de avance. · Lo ahorrado y lo que falta. · La fecha objetivo, si pusiste una.
- do: Crear una meta. · Sumar un aporte. · Cambiar la meta o la fecha. · Archivar una meta cumplida.
- faq1.q: ¿Un aporte sale de mi cuenta? a: Solo si lo registras desde una cuenta. Si no, queda como avance de la meta.
- faq2.q: ¿Puedo compartir una meta? a: Sí, si tienes hogar. Elige el hogar al crearla.

### Deudas

- purpose: Cuánto debes, a quién y en qué orden te conviene pagar.
- see: Cada deuda con saldo, tasa y cuota. · El total que debes. · El orden sugerido según el método que elijas.
- do: Agregar una deuda. · Registrar un pago. · Elegir método: Avalanche o Snowball. · Ver cuándo terminarías.
- faq1.q: ¿Cuál método me conviene? a: Avalanche suele pagar menos intereses. Snowball da victorias rápidas. Ambos funcionan si eres constante.
- faq2.q: No sé la tasa de mi deuda. a: Búscala en el extracto como tasa efectiva anual. Puedes dejarla vacía y agregarla luego.
- faq3.q: ¿Esto es asesoría financiera? a: No. Es una ayuda para ordenar tus números. La decisión es tuya.

### Suscripciones

- purpose: Lo que se cobra solo cada mes, para que nada te tome por sorpresa.
- see: Tus pagos fijos y su valor. · El día de cobro. · El total mensual.
- do: Agregar una suscripción. · Pausarla o borrarla. · Cambiar el valor o el día.
- faq1.q: ¿Ember Cash cobra o cancela por mí? a: No. No nos conectamos a tu banco. Solo te ayudamos a llevar la cuenta.
- faq2.q: ¿Y si se cobra cada año? a: Elige la frecuencia al crearla y la repartimos en tu vista mensual.

### Calendario

- purpose: Tus pagos y cobros del mes en un solo lugar.
- see: Los días con pagos marcados. · Deudas, suscripciones y tarjetas por fecha. · El total de cada día.
- do: Tocar un día para ver el detalle. · Cambiar de mes. · Agregar un pago desde una fecha.
- faq1.q: ¿De dónde salen estas fechas? a: De los días de pago que pusiste en deudas, tarjetas y suscripciones.
- faq2.q: Un pago no aparece. a: Revisa que tenga día de pago. Sin fecha no lo podemos ubicar.

### Hogar

- purpose: Comparte gastos y metas con las personas con las que vives.
- see: Los miembros de tu hogar. · Gastos compartidos y cómo se reparten. · Quién le debe a quién.
- do: Invitar a alguien por correo. · Elegir cómo repartir: 50/50 u otra proporción. · Marcar una cuenta como saldada.
- faq1.q: ¿Ven todos mis datos? a: Solo lo que compartes con el hogar. Lo demás sigue siendo tuyo.
- faq2.q: ¿Puedo salir de un hogar? a: Sí, desde aquí. Antes de salir, salda lo pendiente.
  (Confirmar con Kai: qué ve exactamente cada miembro.)

### Ajustes

- purpose: Tu cuenta y cómo se comporta la app.
- see: Moneda principal. · Idioma. · Categorías. · Tus datos y privacidad.
- do: Cambiar la moneda principal. · Exportar tus datos en CSV. · Repetir la introducción. · Eliminar tu cuenta.
- faq1.q: Si cambio la moneda, ¿pierdo algo? a: No. Tus movimientos quedan iguales; solo cambia cómo se muestran los totales.
- faq2.q: ¿Cómo borro todo? a: Exporta tus datos primero y luego toca Eliminar cuenta. No se puede deshacer.

## 3. Popovers de jerga (glossary.*)

- avalanche: Avalanche: pagas primero la deuda con la tasa más alta. Así sueles pagar menos intereses en total.
- snowball: Snowball: pagas primero la deuda más pequeña. Ganas impulso al cerrar deudas rápido.
- apr: APR o tasa efectiva anual: lo que te cuesta la deuda en un año, en porcentaje. Búscala en tu extracto.
- (fase 17) No hay etiqueta SAMPLE ni modo de datos de ejemplo. No uses la clave glossary.sample.
- fiftyFifty: 50/50 significa que cada uno paga la mitad. Puedes cambiar la proporción cuando quieran.
