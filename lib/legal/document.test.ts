// El aviso se arma en el orden de las claves, con listas y sin saltarse lo compartido.
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

import { legalBlocks } from "./document";

describe("legalBlocks", () => {
  it("agrupa dataN, noN, rightN y useN y deja sharedTitle con sharedBody", () => {
    const blocks = legalBlocks(Object.keys(es.legal.privacy));
    const data = blocks.find((block) => block.kind === "list" && block.keys[0] === "data1");
    const nos = blocks.find((block) => block.kind === "list" && block.keys[0] === "no1");
    const rights = blocks.find((block) => block.kind === "list" && block.keys[0] === "right1");
    expect(data).toEqual({
      kind: "list",
      keys: ["data1", "data2", "data3", "data4", "data5", "data6", "data7", "data8"],
    });
    expect(nos).toEqual({ kind: "list", keys: ["no1", "no2", "no3"] });
    expect(rights).toEqual({
      kind: "list",
      keys: ["right1", "right2", "right3", "right4", "right5"],
    });

    const sharedTitle = blocks.findIndex(
      (block) => block.kind === "heading" && block.key === "sharedTitle",
    );
    const sharedBody = blocks.findIndex(
      (block) => block.kind === "paragraph" && block.key === "sharedBody",
    );
    expect(sharedTitle).toBeGreaterThan(0);
    expect(sharedBody).toBe(sharedTitle + 1);
  });

  it("los términos agrupan useN y no meten noCharges en esa lista", () => {
    const blocks = legalBlocks(Object.keys(es.legal.terms));
    const use = blocks.find((block) => block.kind === "list");
    expect(use).toEqual({ kind: "list", keys: ["use1", "use2", "use3", "use4"] });
    expect(blocks.some((block) => block.kind === "heading" && block.key === "noChargesTitle")).toBe(
      true,
    );
  });

  it("es y en tienen las mismas claves en el mismo orden", () => {
    expect(Object.keys(es.legal.privacy)).toEqual(Object.keys(en.legal.privacy));
    expect(Object.keys(es.legal.terms)).toEqual(Object.keys(en.legal.terms));
  });
});
