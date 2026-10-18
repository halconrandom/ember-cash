// Las RPC que leen o escriben finanzas corren como quien llama (RLS), y el
// test SQL ya exige que un ajeno no vea las tablas de la exportación.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXPORT_TABLES } from "@/lib/export/backup";

describe("alcance de RPC y de la exportación", () => {
  it("save_transaction, post_occurrence y dashboard_totals son security invoker", () => {
    const save = readFileSync("supabase/migrations/0010_household_leave.sql", "utf8");
    const post = readFileSync("supabase/migrations/0011_manual_occurrences.sql", "utf8");
    const dash = readFileSync("supabase/migrations/0012_dashboard.sql", "utf8");
    expect(save).toMatch(/function public\.save_transaction[\s\S]*?security invoker/);
    expect(post).toMatch(/function public\.post_occurrence[\s\S]*?security invoker/);
    expect(dash).toMatch(/function public\.dashboard_totals[\s\S]*?security invoker/);
  });

  it("un ajeno no ve las tablas que exporta el CSV", () => {
    const sql = readFileSync("supabase/tests/rls_finance.sql", "utf8");
    for (const item of EXPORT_TABLES) {
      if (
        item.table === "profiles" ||
        item.table === "households" ||
        item.table.startsWith("household_")
      ) {
        continue;
      }
      expect(sql).toContain(`from public.${item.table}`);
    }
    expect(sql).toContain("C no ve deudas");
    expect(sql).toContain("C no ve liquidaciones");
    expect(sql).toContain("A no ve la transacción personal de B");
  });

  it("la ruta de salud no lee tablas", () => {
    const source = readFileSync("app/api/health/route.ts", "utf8");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain("createAdminClient");
  });
});
