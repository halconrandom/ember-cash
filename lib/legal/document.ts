/**
 * Parte el aviso o los términos en el orden de las claves.
 * dataN, noN, rightN y useN se agrupan en una lista. El resto queda como
 * título, encabezado o párrafo. No reordena ni resume el texto.
 */

export type LegalBlock =
  | { kind: "title"; key: string }
  | { kind: "heading"; key: string }
  | { kind: "paragraph"; key: string }
  | { kind: "list"; keys: string[] };

const LIST_ITEM = /^(data|no|right|use)\d+$/;

/** Bloques en el mismo orden que las claves del mensaje. */
export function legalBlocks(keys: readonly string[]): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let index = 0;
  while (index < keys.length) {
    const key = keys[index] ?? "";
    const item = key.match(LIST_ITEM);
    if (item) {
      const prefix = item[1];
      const list: string[] = [];
      while (index < keys.length) {
        const next = keys[index] ?? "";
        const match = next.match(LIST_ITEM);
        if (!match || match[1] !== prefix) break;
        list.push(next);
        index += 1;
      }
      blocks.push({ kind: "list", keys: list });
      continue;
    }
    if (key === "title") blocks.push({ kind: "title", key });
    else if (key.endsWith("Title")) blocks.push({ kind: "heading", key });
    else blocks.push({ kind: "paragraph", key });
    index += 1;
  }
  return blocks;
}
