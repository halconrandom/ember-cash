// El respaldo pagina el CSV, neutraliza fórmulas y no pide la service role.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectBackup, PAGE_SIZE } from "./backup";
import { parseCsv } from "./csv";

function csvResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/csv" } });
}

describe("collectBackup", () => {
  it("une páginas, deja el entero intacto y marca la fórmula", async () => {
    const header = "amount_minor,description";
    const first = Array.from({ length: PAGE_SIZE }, (_, index) => `${index},compra`).join("\n");
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const range = new Headers(init?.headers).get("range") ?? "";
      calls.push(`${url} ${range}`);
      if (!url.includes("/transactions")) return csvResponse("id\n");
      if (range.startsWith("0-")) return csvResponse(`${header}\n${first}\n`);
      if (range.startsWith(`${PAGE_SIZE}-`)) return csvResponse(`${header}\n25000,=hola\n`);
      return csvResponse("", 416);
    };

    const { files, truncated } = await collectBackup({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon",
      accessToken: "token",
      fetchImpl,
    });

    const transactions = files.find((file) => file.name === "transactions.csv");
    const rows = parseCsv(transactions?.text ?? "");
    expect(rows[1]?.[0]).toBe("0");
    expect(rows.at(-1)).toEqual(["25000", "'=hola"]);
    expect(truncated).toEqual([]);
    expect(files[0]?.name).toBe("README.txt");
    expect(files[0]?.text).toContain("unidades menores");
    expect(calls.some((url) => url.includes("/rest/v1/transactions"))).toBe(true);
    expect(calls.some((url) => url.includes("service_role"))).toBe(false);
  });
});

describe("el módulo de respaldo", () => {
  it("no menciona la service role", () => {
    const source = readFileSync("lib/export/backup.ts", "utf8");
    expect(source).not.toContain("SERVICE_ROLE");
    expect(source).not.toContain("createAdminClient");
  });
});
