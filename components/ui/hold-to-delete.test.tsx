// @vitest-environment jsdom
// Tests del borrado irreversible: mantener 2 s (puntero y teclado), cancelar
// al soltar o con Esc, y la confirmación en dos pasos con ventana de 4 s.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/test/intl";

import { HoldToDeleteButton, TwoStepDeleteButton } from "./hold-to-delete";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HoldToDeleteButton", () => {
  it("con puntero: confirma solo después de 2 s sostenidos", () => {
    const onConfirm = vi.fn();
    render(<HoldToDeleteButton itemName="debt" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: /hold to delete/i });

    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(1999));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("soltar antes de tiempo cancela", () => {
    const onConfirm = vi.fn();
    render(<HoldToDeleteButton onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: /hold to delete/i });

    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.pointerUp(button, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(5000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("con teclado: Enter sostenido 2 s confirma; Esc o soltar cancela", () => {
    const onConfirm = vi.fn();
    render(<HoldToDeleteButton onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: /hold to delete/i });

    fireEvent.keyDown(button, { key: "Enter" });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.keyDown(button, { key: "Escape" });
    act(() => vi.advanceTimersByTime(3000));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: " " });
    act(() => vi.advanceTimersByTime(800));
    fireEvent.keyUp(button, { key: " " });
    act(() => vi.advanceTimersByTime(3000));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: "Enter" });
    // La repetición automática de la tecla no reinicia la cuenta.
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("describe la acción para lectores de pantalla", () => {
    render(<HoldToDeleteButton itemName="debt" onConfirm={() => undefined} />);
    const button = screen.getByRole("button", { name: /hold to delete/i });
    const hint = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Hold Enter for 2 seconds to delete debt");
  });

  it("en español usa los textos de messages/es.json", () => {
    render(<HoldToDeleteButton itemName="la deuda" onConfirm={() => undefined} />, "es");
    const button = screen.getByRole("button", { name: /mantén para borrar/i });
    const hint = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Mantén Enter durante 2 segundos para borrar la deuda");
  });
});

describe("TwoStepDeleteButton", () => {
  it("el primer clic arma, el segundo dentro de 4 s confirma", () => {
    const onConfirm = vi.fn();
    render(<TwoStepDeleteButton label="Delete debt" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete debt" }));
    expect(screen.getByRole("button", { name: "Press again to confirm" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole("button", { name: "Press again to confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("después de 4 s vuelve al estado inicial sin confirmar", () => {
    const onConfirm = vi.fn();
    render(<TwoStepDeleteButton label="Delete debt" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete debt" }));
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByRole("button", { name: "Delete debt" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
