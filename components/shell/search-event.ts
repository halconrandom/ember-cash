/**
 * La topbar del teléfono (docs/Phone/ember-cash-mobile-1-frames/m03) muestra
 * la búsqueda como un ícono. La fila de filtros vive en otra parte del árbol,
 * así que se avisan con este evento de ventana. No lleva datos.
 */
export const OPEN_SEARCH_EVENT = "ec-open-search";

/** Pide a la fila de filtros que muestre el buscador y le dé el foco. */
export function openTransactionSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
