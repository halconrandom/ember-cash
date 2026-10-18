// security.txt lleva los cuatro campos y vence un año después de la compilación.
import { describe, expect, it } from "vitest";

import { SECURITY_TXT_COMPILED_AT, securityTxt, securityTxtExpires } from "./security-txt";

describe("securityTxt", () => {
  it("incluye contacto, vencimiento, idiomas y la URL canónica", () => {
    const text = securityTxt({
      contactEmail: "hola@ejemplo.com",
      canonical: "https://cash.halcon.dev/.well-known/security.txt",
      compiledAt: SECURITY_TXT_COMPILED_AT,
    });
    expect(text).toContain("Contact: mailto:hola@ejemplo.com");
    expect(text).toContain(`Expires: ${securityTxtExpires(SECURITY_TXT_COMPILED_AT)}`);
    expect(text).toContain("Preferred-Languages: es, en");
    expect(text).toContain("Canonical: https://cash.halcon.dev/.well-known/security.txt");
    expect(securityTxtExpires("2026-10-17T00:00:00.000Z")).toBe("2027-10-17T00:00:00.000Z");
  });
});
