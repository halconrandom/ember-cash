// @vitest-environment jsdom
// Tests del toast con Undo: dura 6 s, Undo restaura, y expirar confirma.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/test/intl";

import { ToastProvider, useToast } from "./toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.show({ message: "Transaction deleted", onUndo, onExpire })}
    >
      delete
    </button>
  );
}

function setup() {
  const onUndo = vi.fn();
  const onExpire = vi.fn();
  render(
    <ToastProvider>
      <Trigger onUndo={onUndo} onExpire={onExpire} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("delete"));
  return { onUndo, onExpire };
}

describe("toast con Undo", () => {
  it("Undo llama a la restauración y no expira", () => {
    const { onUndo, onExpire } = setup();
    expect(screen.getByText("Transaction deleted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    act(() => vi.advanceTimersByTime(7000));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("en español el botón dice Deshacer", () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} onExpire={() => undefined} />
      </ToastProvider>,
      "es",
    );
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("sin Undo, expira a los 6 s", () => {
    const { onUndo, onExpire } = setup();
    act(() => vi.advanceTimersByTime(5999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("se pausa mientras el puntero está encima", () => {
    const { onExpire } = setup();
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.pointerEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(10000));
    expect(onExpire).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(3000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
