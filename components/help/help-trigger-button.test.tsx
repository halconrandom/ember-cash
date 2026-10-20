// @vitest-environment jsdom
// Tests de HelpTriggerButton: etiqueta accesible, punto de "nuevo" y clic.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/intl";

import { HelpTriggerButton } from "./help-trigger-button";

afterEach(cleanup);

describe("HelpTriggerButton", () => {
  it("tiene la etiqueta accesible del botón de ayuda", () => {
    renderWithIntl(<HelpTriggerButton onOpen={() => {}} showDot={false} />);
    expect(screen.getByRole("button", { name: "Help" })).toBeTruthy();
  });

  it("muestra el punto solo cuando showDot es true", () => {
    const { rerender } = renderWithIntl(<HelpTriggerButton onOpen={() => {}} showDot={false} />);
    expect(screen.queryByText("New: help is here")).toBeNull();
    rerender(<HelpTriggerButton onOpen={() => {}} showDot />);
    expect(screen.getByText("New: help is here")).toBeTruthy();
  });

  it("llama a onOpen al tocarlo", () => {
    const onOpen = vi.fn();
    renderWithIntl(<HelpTriggerButton onOpen={onOpen} showDot={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
