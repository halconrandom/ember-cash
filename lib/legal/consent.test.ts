// Sin las dos filas de la versión vigente, la app no se usa.
import { describe, expect, it } from "vitest";

import { CONSENT_TYPES, hasCurrentConsent } from "./consent";
import { LEGAL_VERSION } from "./version";

const current = CONSENT_TYPES.map((type) => ({ type, version: LEGAL_VERSION }));

describe("hasCurrentConsent", () => {
  it("exige privacy y terms de la versión vigente", () => {
    expect(hasCurrentConsent(current)).toBe(true);
    expect(hasCurrentConsent([])).toBe(false);
    expect(hasCurrentConsent(current.slice(0, 1))).toBe(false);
  });

  it("una versión anterior no alcanza", () => {
    const old = CONSENT_TYPES.map((type) => ({ type, version: "2026-09-v1" }));
    expect(hasCurrentConsent(old)).toBe(false);
    expect(hasCurrentConsent([...old, ...current])).toBe(true);
  });

  it("la versión que se guarda es la constante del código", () => {
    expect(LEGAL_VERSION).toBe("2026-10-v1");
    expect(CONSENT_TYPES).toEqual(["privacy", "terms"]);
  });
});
