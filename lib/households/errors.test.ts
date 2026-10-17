// Tests del mapeo de errores de las RPC de households.
import { describe, expect, it } from "vitest";

import { GENERIC_ERROR, householdErrorMessage } from "./errors";

describe("householdErrorMessage", () => {
  it("traduce los códigos conocidos", () => {
    expect(householdErrorMessage({ message: "invite_used" })).toMatch(/ya se usó/);
    expect(householdErrorMessage({ message: "household_full" })).toMatch(/máximo/);
  });

  it("usa el mensaje genérico para errores desconocidos o vacíos", () => {
    expect(householdErrorMessage({ message: "duplicate key value" })).toBe(GENERIC_ERROR);
    expect(householdErrorMessage(null)).toBe(GENERIC_ERROR);
  });
});
