// Las RPC que leen o escriben finanzas corren como quien llama (RLS), y el
// test SQL ya exige que un ajeno no vea las tablas de la exportación.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXPORT_TABLES } from "@/lib/export/backup";

describe("alcance de RPC y de la exportación", () => {
  it("save_transaction, post_occurrence y dashboard_totals son security invoker", () => {
    // 0024 reemplaza el cuerpo de 0010. La función viva es esta.
    const save = readFileSync("supabase/migrations/0024_opening_balance.sql", "utf8");
    const post = readFileSync("supabase/migrations/0011_manual_occurrences.sql", "utf8");
    // 0022 reemplaza el cuerpo de 0021. La función viva es esta.
    const dash = readFileSync("supabase/migrations/0022_dashboard_totals_guard.sql", "utf8");
    expect(save).toMatch(/function public\.save_transaction[\s\S]*?security invoker/);
    expect(save).toMatch(/function public\.save_transaction[\s\S]*?set search_path = ''/);
    expect(save).toContain("opening_not_editable");
    expect(save).toContain("p_kind in ('expense', 'income')");
    expect(save).toContain("opening_has_splits");
    expect(save).toMatch(/function public\.account_balance[\s\S]*?security invoker/);
    expect(save).toMatch(/function public\.account_balance[\s\S]*?set search_path = ''/);
    expect(post).toMatch(/function public\.post_occurrence[\s\S]*?security invoker/);
    expect(dash).toMatch(/function public\.dashboard_totals[\s\S]*?security invoker/);
    expect(dash).toMatch(/set search_path = ''/);
    expect(dash).toContain("auth.uid()");
    expect(dash).toContain("%L");
    expect(dash).not.toMatch(/\|\|/);
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
