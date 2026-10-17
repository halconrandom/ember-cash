// @vitest-environment jsdom
// Contorno del día elegido y fundido de 150 ms al cambiar de mes (spec §7).
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RateProvider } from "@/components/money/rate-provider";
import type { Rate } from "@/lib/money/convert";
import { renderWithIntl } from "@/test/intl";

import { CalendarMonthFade, CalendarView } from "./calendar-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/calendar",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/money/actions", () => ({ refreshRate: vi.fn(), saveDisplayCurrency: vi.fn() }));
vi.mock("./actions", () => ({
  rescheduleOccurrence: vi.fn(),
  markOccurrencePaid: vi.fn(),
}));

const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: "2026-10-16T12:00:00.000Z",
  source: "test",
};

afterEach(cleanup);

function outline() {
  return document.querySelectorAll(".ring-ember-text");
}

describe("contorno del día elegido", () => {
  it("es absoluto (no cambia el tamaño de la celda) y se queda en un solo día", () => {
    renderWithIntl(
      <RateProvider initialRate={RATE} initialDisplayCurrency="USD" persist={false}>
        <CalendarView
          month="2026-10"
          today="2026-10-16"
          initialDay="2026-10-16"
          events={[]}
          nextPayday={null}
          accounts={[]}
        />
      </RateProvider>,
    );

    expect(outline()).toHaveLength(1);
    const ring = outline()[0] as HTMLElement;
    expect(ring.className).toContain("absolute");
    expect(ring.className).toContain("inset-0");
    expect(ring.parentElement?.className).toContain("relative");
    expect(ring.parentElement?.className).not.toContain("ring-2");

    fireEvent.click(screen.getByRole("button", { name: "17" }));
    expect(outline()).toHaveLength(1);
  });
});

describe("fundido al cambiar de mes", () => {
  it("cruza los dos meses 150 ms y deja el nuevo encima", async () => {
    const { rerender } = renderWithIntl(
      <CalendarMonthFade month="2026-10">
        <p>October</p>
      </CalendarMonthFade>,
    );
    expect(screen.getByText("October")).toBeTruthy();
    expect(screen.queryByText("November")).toBeNull();

    rerender(
      <CalendarMonthFade month="2026-11">
        <p>November</p>
      </CalendarMonthFade>,
    );

    const oldLayer = screen.getByText("October").parentElement as HTMLElement;
    const newLayer = screen.getByText("November").parentElement as HTMLElement;
    // El mes nuevo va después en el DOM, así queda encima y recibe los clics.
    expect(oldLayer.compareDocumentPosition(newLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(screen.queryByText("October")).toBeNull();
    expect(screen.getByText("November")).toBeTruthy();
  });
});
