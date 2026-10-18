// La exportación pide PostgREST con el token de la sesión. Cada token ve
// solo sus filas: el ZIP de una persona no trae las de otra.
import { describe, expect, it } from "vitest";

import { collectBackup } from "./backup";

function csvResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/csv" } });
}

describe("collectBackup y el alcance de la sesión", () => {
  it("el ZIP de A no incluye filas que solo vería B", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      seen.push(auth);
      const table = url.split("/rest/v1/")[1]?.split("?")[0] ?? "";
      if (auth === "Bearer token-de-a") {
        if (table === "transactions") return csvResponse("id,amount_minor\na-fila,100\n");
        if (table === "household_members") return csvResponse("user_id\na\n");
        return csvResponse("id\n");
      }
      if (table === "transactions") return csvResponse("id,amount_minor\nb-fila,999999\n");
      return csvResponse("id\nb-fila\n");
    };

    const { files } = await collectBackup({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon-publica",
      accessToken: "token-de-a",
      fetchImpl,
    });
    const text = files.map((file) => file.text).join("\n");
    expect(text).toContain("a-fila");
    expect(text).not.toContain("b-fila");
    expect(text).not.toContain("999999");
    expect(seen.every((header) => header === "Bearer token-de-a")).toBe(true);
    expect(text).not.toContain("service_role");
  });
});
