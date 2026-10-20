// jsdom no trae tipos propios. Solo hace falta la clase para el test de hidratación.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; pretendToBeVisual?: boolean });
    readonly window: Window & typeof globalThis;
  }
}
