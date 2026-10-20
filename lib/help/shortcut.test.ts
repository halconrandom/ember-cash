// @vitest-environment jsdom
// Test de isTypingTarget: la tecla "?" no debe abrir la ayuda si el foco
// está en un input, un textarea o un elemento contenteditable.
import { describe, expect, it } from "vitest";

import { isTypingTarget } from "./shortcut";

describe("isTypingTarget", () => {
  it("un input o un textarea cuentan como escritura", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  });

  it("un elemento contenteditable=true cuenta como escritura", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(isTypingTarget(div)).toBe(true);
  });

  it("un hijo dentro de un contenteditable también cuenta (closest)", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const span = document.createElement("span");
    editable.appendChild(span);
    expect(isTypingTarget(span)).toBe(true);
  });

  it("un botón, un enlace o el documento no cuentan como escritura", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("a"))).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("un contenteditable=false no cuenta (hay que poder abrir la ayuda ahí)", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "false");
    expect(isTypingTarget(div)).toBe(false);
  });
});
