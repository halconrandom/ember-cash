// Cada help/<página>.es.json debe tener la misma forma que su .en.json: las
// mismas claves (incluidas las de cada entrada de `faq`), ninguna vacía.
import { describe, expect, it } from "vitest";

import { HELP_PAGES_READY, loadHelpContent } from "./content";

describe("help/*.json", () => {
  for (const page of HELP_PAGES_READY) {
    describe(page, () => {
      it("mismas claves que el inglés (purpose, see, do, y cada faq)", async () => {
        const [es, en] = await Promise.all([
          loadHelpContent(page, "es"),
          loadHelpContent(page, "en"),
        ]);
        expect(es.faq.length).toBe(en.faq.length);
        es.faq.forEach((item, i) => {
          expect(Object.keys(item).sort()).toEqual(Object.keys(en.faq[i]).sort());
        });
      });

      it("ningún texto está vacío", async () => {
        for (const content of await Promise.all([
          loadHelpContent(page, "es"),
          loadHelpContent(page, "en"),
        ])) {
          expect(content.purpose.trim()).not.toBe("");
          expect(content.see.trim()).not.toBe("");
          expect(content.do.trim()).not.toBe("");
          for (const item of content.faq) {
            expect(item.q.trim()).not.toBe("");
            expect(item.a.trim()).not.toBe("");
          }
        }
      });
    });
  }
});
