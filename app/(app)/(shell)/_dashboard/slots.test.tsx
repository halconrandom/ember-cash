// @vitest-environment jsdom
// Estado de error del dashboard: si dashboard_totals falla, solo las tarjetas
// que dependen de esa consulta muestran "Reintentar"; las demás siguen.
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateProvider } from "@/components/money/rate-provider";
import type { Rate } from "@/lib/money/convert";
import en from "@/messages/en.json";
import { renderWithIntl } from "@/test/intl";

const refresh = vi.fn();

// Lecturas del dashboard: cada test decide cuál falla.
const queries = vi.hoisted(() => ({
  getAggregates: vi.fn(),
  getUpcomingPayments: vi.fn(),
  getGoalsSummary: vi.fn(),
  getDebtsSummary: vi.fn(),
  getSubscriptionsSummary: vi.fn(),
}));
vi.mock("@/lib/dashboard/queries", () => queries);
vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: async () => ({ timezone: "America/Bogota", onboarded_at: "2026-01-01" }),
  requireUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/lib/scope/server", () => ({ getScope: async () => ({ kind: "personal" }) }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: keyof typeof en.dashboard) => en.dashboard[key],
}));
// Hooks del router (la tarjeta de error llama a refresh); unstable_rethrow es el real.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
// Server Actions que importan los componentes: no se ejecutan aquí.
vi.mock("@/lib/money/actions", () => ({ refreshRate: vi.fn(), saveDisplayCurrency: vi.fn() }));
vi.mock("../calendar/actions", () => ({ markOccurrencePaid: vi.fn() }));

const { CategorySlot, DebtsSlot, GoalsSlot, StatSlot, SubscriptionsSlot, TrendSlot, UpcomingSlot } =
  await import("./slots");

const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: new Date().toISOString(),
  source: "test",
};

const searchParams = Promise.resolve({ month: "2026-10" });

/** Resuelve todos los slots y los dibuja juntos, como la página. */
async function renderDashboard() {
  const slots = await Promise.all([
    StatSlot({ searchParams, card: "balance" }),
    StatSlot({ searchParams, card: "income" }),
    StatSlot({ searchParams, card: "expenses" }),
    CategorySlot({ searchParams }),
    TrendSlot({ searchParams }),
    UpcomingSlot(),
    GoalsSlot(),
    DebtsSlot(),
    SubscriptionsSlot(),
  ]);
  return renderWithIntl(
    <RateProvider initialRates={[RATE]} initialDisplayCurrency="COP" persist={false}>
      {slots.map((slot, i) => (
        <section key={i} data-testid={`slot-${i}`}>
          {slot}
        </section>
      ))}
    </RateProvider>,
  );
}

const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  queries.getAggregates.mockResolvedValue([]);
  queries.getUpcomingPayments.mockResolvedValue({ items: [], total: 0 });
  queries.getGoalsSummary.mockResolvedValue({ count: 0, top: [] });
  queries.getDebtsSummary.mockResolvedValue({
    count: 0,
    balances: [],
    originals: [],
    paid: [],
    minimums: [],
    nextDue: null,
    top: [],
  });
  queries.getSubscriptionsSummary.mockResolvedValue({ count: 0, monthly: [], icons: [] });
  refresh.mockClear();
  consoleError.mockClear();
});

afterEach(cleanup);

describe("dashboard con dashboard_totals caído", () => {
  it("solo las 5 tarjetas de dinero muestran Reintentar; las otras 4 siguen", async () => {
    queries.getAggregates.mockRejectedValue(new Error("dashboard_totals: timeout"));
    await renderDashboard();

    const retries = screen.getAllByRole("button", { name: en.dashboard.retry });
    expect(retries).toHaveLength(5);
    // Las afectadas: balance, ingresos, gastos, categorías y tendencia.
    for (const [i, title] of [
      [0, en.dashboard.balance],
      [1, en.dashboard.income],
      [2, en.dashboard.expenses],
      [3, en.dashboard.byCategory],
      [4, en.dashboard.trend],
    ] as const) {
      const slot = screen.getByTestId(`slot-${i}`);
      expect(within(slot).getByRole("alert").textContent).toContain(title);
      expect(within(slot).getByText(en.dashboard.cardError)).toBeTruthy();
    }
    // Las demás se dibujan con sus datos (aquí, sus estados vacíos) y sin error.
    for (const [i, text] of [
      [5, en.dashboard.upcomingEmpty],
      [6, en.dashboard.goalsEmpty],
      [7, en.dashboard.debtsEmpty],
      [8, en.dashboard.subscriptionsEmpty],
    ] as const) {
      const slot = screen.getByTestId(`slot-${i}`);
      expect(within(slot).getByText(text)).toBeTruthy();
      expect(within(slot).queryByRole("button", { name: en.dashboard.retry })).toBeNull();
    }
    // El fallo queda en el log del servidor.
    expect(consoleError).toHaveBeenCalled();
  });

  it("Reintentar vuelve a pedir la página", async () => {
    queries.getAggregates.mockRejectedValue(new Error("caído"));
    await renderDashboard();
    fireEvent.click(screen.getAllByRole("button", { name: en.dashboard.retry })[0]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("si falla otra lectura (metas), solo esa tarjeta queda en error", async () => {
    queries.getGoalsSummary.mockRejectedValue(new Error("goals caído"));
    await renderDashboard();
    const retries = screen.getAllByRole("button", { name: en.dashboard.retry });
    expect(retries).toHaveLength(1);
    expect(within(screen.getByTestId("slot-6")).getByRole("alert").textContent).toContain(
      en.dashboard.goals,
    );
    expect(
      within(screen.getByTestId("slot-3")).getByText(en.dashboard.byCategoryEmpty),
    ).toBeTruthy();
  });

  it("los errores internos de Next (redirect) no se tragan", async () => {
    let redirectError: unknown;
    try {
      redirect("/login");
    } catch (error) {
      redirectError = error;
    }
    queries.getAggregates.mockRejectedValue(redirectError);
    await expect(StatSlot({ searchParams, card: "balance" })).rejects.toBe(redirectError);
  });
});
