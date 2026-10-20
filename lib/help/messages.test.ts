// Cada help/<página>.es.json debe tener la misma forma que su .en.json: las
// mismas claves (incluidas las de cada entrada de `faq`), ninguna vacía.
import { describe, expect, it } from "vitest";

import en from "@/help/debts.en.json";
import es from "@/help/debts.es.json";
import dbEn from "@/help/dashboard.en.json";
import dbEs from "@/help/dashboard.es.json";
import subEn from "@/help/subscriptions.en.json";
import subEs from "@/help/subscriptions.es.json";
import { HELP_PAGES_READY, type HelpContent } from "./content";

const PAGES: Record<string, { es: HelpContent; en: HelpContent }> = {
  dashboard: { es: dbEs, en: dbEn },
  debts: { es, en },
  subscriptions: { es: subEs, en: subEn },
};

describe("help/*.json", () => {
  it("hay un archivo por cada página lista de esta fase", () => {
    expect(Object.keys(PAGES).sort()).toEqual([...HELP_PAGES_READY].sort());
  });

  for (const [page, { es: pageEs, en: pageEn }] of Object.entries(PAGES)) {
    describe(page, () => {
      it("mismas claves que el inglés (purpose, see, do, y cada faq)", () => {
        expect(pageEs.faq.length).toBe(pageEn.faq.length);
        pageEs.faq.forEach((item, i) => {
          expect(Object.keys(item).sort()).toEqual(Object.keys(pageEn.faq[i]).sort());
        });
      });

      it("ningún texto está vacío", () => {
        for (const content of [pageEs, pageEn]) {
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
