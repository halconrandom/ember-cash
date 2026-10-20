// @vitest-environment jsdom
// Tests de GlossaryTerm: abre al tocar, cierra con Escape o tocando fuera.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/intl";

import { GlossaryTerm } from "./glossary-term";

afterEach(cleanup);

describe("GlossaryTerm", () => {
  it("empieza cerrado y no muestra la definición", () => {
    renderWithIntl(<GlossaryTerm term="avalanche">Avalanche</GlossaryTerm>);
    expect(screen.getByRole("button", { name: "Avalanche" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("al tocarlo, muestra la definición de glossary.*", () => {
    renderWithIntl(<GlossaryTerm term="apr">APR</GlossaryTerm>);
    fireEvent.click(screen.getByRole("button", { name: "APR" }));
    expect(screen.getByRole("button", { name: "APR" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("note").textContent).toContain("annual percentage rate");
  });

  it("Escape la cierra", () => {
    renderWithIntl(<GlossaryTerm term="snowball">Snowball</GlossaryTerm>);
    fireEvent.click(screen.getByRole("button", { name: "Snowball" }));
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("tocar fuera la cierra", () => {
    renderWithIntl(
      <>
        <button type="button">fuera</button>
        <GlossaryTerm term="fiftyFifty">50/50</GlossaryTerm>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "50/50" }));
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "fuera" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
});
