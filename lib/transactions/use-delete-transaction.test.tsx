// @vitest-environment jsdom
// Test del borrado con Deshacer: Deshacer restaura la transacción; si nadie
// deshace en 6 s, se borra de forma definitiva.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { renderWithIntl as render } from "@/test/intl";

const actions = vi.hoisted(() => ({
  deleteTransaction: vi.fn(),
  restoreTransaction: vi.fn(),
  purgeTransaction: vi.fn(),
}));
vi.mock("@/app/(app)/(shell)/transactions/actions", () => actions);
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { useDeleteTransaction } = await import("./use-delete-transaction");

const ID = "11111111-1111-4111-8111-111111111111";

function DeleteButton() {
  const remove = useDeleteTransaction();
  return (
    <button type="button" onClick={() => void remove(ID)}>
      borrar
    </button>
  );
}

function setup() {
  render(
    <ToastProvider>
      <DeleteButton />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("borrar con Deshacer", () => {
  it("borra en suave y Deshacer restaura la transacción", async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByText("borrar")));
    expect(actions.deleteTransaction).toHaveBeenCalledWith(ID);
    expect(screen.getByText("Transaction deleted")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect(actions.restoreTransaction).toHaveBeenCalledWith(ID);
    expect(screen.getByText("Transaction restored")).toBeTruthy();

    // Después de deshacer, vencer el plazo no borra nada.
    await act(async () => vi.advanceTimersByTime(7000));
    expect(actions.purgeTransaction).not.toHaveBeenCalled();
  });

  it("sin Deshacer, a los 6 s el borrado es definitivo", async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByText("borrar")));
    await act(async () => vi.advanceTimersByTime(5999));
    expect(actions.purgeTransaction).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(actions.purgeTransaction).toHaveBeenCalledWith(ID);
    expect(actions.restoreTransaction).not.toHaveBeenCalled();
  });

  it("si el borrado falla avisa y no ofrece Deshacer", async () => {
    actions.deleteTransaction.mockResolvedValue({ ok: false });
    setup();
    await act(async () => fireEvent.click(screen.getByText("borrar")));
    expect(screen.getByText("Couldn't delete. Try again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
