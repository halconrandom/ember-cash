// Tests del mapeo de errores de las RPC de households a claves de mensajes.
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

import { HOUSEHOLD_ERROR_CODES, householdErrorKey } from "./errors";

describe("householdErrorKey", () => {
  it("devuelve la clave de los códigos conocidos", () => {
    expect(householdErrorKey({ message: "invite_used" })).toBe("invite_used");
    expect(householdErrorKey({ message: " household_full " })).toBe("household_full");
  });

  it("usa 'generic' para errores desconocidos o vacíos", () => {
    expect(householdErrorKey({ message: "duplicate key value" })).toBe("generic");
    expect(householdErrorKey(null)).toBe("generic");
  });

  it("cada clave tiene texto en los dos idiomas", () => {
    for (const key of [...HOUSEHOLD_ERROR_CODES, "generic"] as const) {
      expect(es.householdErrors[key], key).toBeTruthy();
      expect(en.householdErrors[key], key).toBeTruthy();
    }
  });
});
