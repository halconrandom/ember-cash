// Cron diario: usa el día civil de la zona del perfil, marca vencidos y
// nunca crea transacciones.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDays, todayIn } from "@/lib/transactions/dates";

import { HORIZON_DAYS } from "./schedule";

const ensureOccurrences = vi.fn(async () => 0);
const syncDebtRecurring = vi.fn(async () => undefined);
/** Llamadas a RPC y tablas tocadas por el cron (fuera de los módulos simulados). */
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const tables: string[] = [];

vi.mock("./ensure", () => ({ ensureOccurrences }));
vi.mock("./debts", () => ({ syncDebtRecurring }));

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tables.push(table);
      return {
        select: () =>
          Promise.resolve({
            data: [{ id: PROFILE_ID, timezone: "America/Bogota" }],
            error: null,
          }),
      };
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: 2, error: null });
    },
  }),
}));

const { runOccurrencesCron } = await import("./cron");

beforeEach(() => {
  ensureOccurrences.mockClear();
  syncDebtRecurring.mockClear();
  rpcCalls.length = 0;
  tables.length = 0;
});

describe("cron a las 13:45 UTC", () => {
  it("trata hoy como el día de Bogotá y marca vencidos antes de hoy", async () => {
    // 13:45 UTC son las 08:45 en Bogotá: el día civil es el de la zona del perfil.
    const now = new Date("2026-10-17T13:45:00.000Z");
    const today = todayIn("America/Bogota", now);
    expect(today).toBe("2026-10-17");

    const result = await runOccurrencesCron(now);

    expect(result).toEqual({ ok: true, inserted: 0, overdue: 2 });
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
    expect(rpcCalls).toEqual([
      { fn: "mark_overdue_occurrences", args: { p_owner: PROFILE_ID, p_today: today } },
    ]);
  });

  it("a las 23:30 en Bogotá no usa el día siguiente de UTC", async () => {
    const now = new Date("2026-10-16T23:30:00-05:00");
    expect(todayIn("UTC", now)).toBe("2026-10-17");
    await runOccurrencesCron(now);
    expect(rpcCalls[0].args.p_today).toBe("2026-10-16");
  });
});

describe("el cron nunca crea transacciones", () => {
  it("no llama post_occurrence ni toca transactions", async () => {
    await runOccurrencesCron(new Date("2026-10-17T13:45:00.000Z"));
    expect(rpcCalls.map((c) => c.fn)).not.toContain("post_occurrence");
    expect(rpcCalls.map((c) => c.fn)).not.toContain("save_transaction");
    expect(tables).not.toContain("transactions");
    expect(tables).not.toContain("transaction_splits");
  });
});
