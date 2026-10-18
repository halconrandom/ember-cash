// security.txt responde en texto plano, sin sesión, con los cuatro campos.
import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /.well-known/security.txt", () => {
  it("publica contacto, vencimiento, idiomas y la URL de esta petición", async () => {
    const res = GET(new Request("https://cash.halcon.dev/.well-known/security.txt"));
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await res.text();
    expect(text).toContain("Contact: mailto:contacto@example.com");
    expect(text).toContain("Expires: 2027-10-17T00:00:00.000Z");
    expect(text).toContain("Preferred-Languages: es, en");
    expect(text).toContain("Canonical: https://cash.halcon.dev/.well-known/security.txt");
  });
});
