// El cron de las 13:45 UTC debe usar el día civil de la zona del perfil.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDays, todayIn } from "@/lib/transactions/dates";

import { HORIZON_DAYS } from "./schedule";

const ensureOccurrences = vi.fn(async () => 0);
const syncDebtRecurring = vi.fn(async () => undefined);
const dueFilters: { column: string; value: unknown }[] = [];

vi.mock("./ensure", () => ({ ensureOccurrences }));
vi.mock("./debts", () => ({ syncDebtRecurring }));

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () =>
            Promise.resolve({
              data: [{ id: PROFILE_ID, timezone: "America/Bogota" }],
              error: null,
            }),
        };
      }
      // Consulta de vencimientos de hoy: se registra cada .eq() para ver due_on.
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          dueFilters.push({ column, value });
          return query;
        },
        in: () => query,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: [] as unknown[], error: null }).then(resolve, reject),
      };
      return query;
    },
  }),
}));

const { runOccurrencesCron } = await import("./cron");

beforeEach(() => {
  ensureOccurrences.mockClear();
  syncDebtRecurring.mockClear();
  dueFilters.length = 0;
});

describe("cron a las 13:45 UTC", () => {
  it("trata hoy como el día de Bogotá", async () => {
    // 13:45 UTC son las 08:45 en Bogotá: el día civil es el de la zona del perfil.
    const now = new Date("2026-10-17T13:45:00.000Z");
    const today = todayIn("America/Bogota", now);
    expect(today).toBe("2026-10-17");

    const result = await runOccurrencesCron(now);

    expect(result).toEqual({ ok: true, inserted: 0, posted: 0, skipped: 0 });
    expect(syncDebtRecurring).toHaveBeenCalledWith(expect.anything(), {
      ownerId: PROFILE_ID,
      today,
    });
    expect(ensureOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      addDays(today, HORIZON_DAYS),
      {
        from: today,
        ownerId: PROFILE_ID,
      },
    );
    expect(dueFilters).toContainEqual({ column: "due_on", value: today });
  });

  it("a las 23:30 en Bogotá no corre el vencimiento en el día siguiente de UTC", async () => {
    const now = new Date("2026-10-16T23:30:00-05:00");
    expect(todayIn("UTC", now)).toBe("2026-10-17");

    await runOccurrencesCron(now);

    expect(dueFilters).toContainEqual({ column: "due_on", value: "2026-10-16" });
    expect(ensureOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      addDays("2026-10-16", HORIZON_DAYS),
      { from: "2026-10-16", ownerId: PROFILE_ID },
    );
  });
});
