// El enlace mágico no dice si el correo ya tiene cuenta.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

import { magicLinkFailure } from "./magic-link";

describe("magicLinkFailure", () => {
  it("trata igual una cuenta que no existe y una que ya existe", () => {
    const missing = magicLinkFailure({ status: 400, message: "User not found" });
    const exists = magicLinkFailure({ status: 400, message: "User already registered" });
    const signup = magicLinkFailure({ status: 422, message: "Signups not allowed" });
    expect(missing).toBe("sendFailed");
    expect(exists).toBe(missing);
    expect(signup).toBe(missing);
  });

  it("solo distingue el límite de envíos, y el éxito no es un error", () => {
    expect(magicLinkFailure({ status: 429, message: "email rate limit" })).toBe("rateLimited");
    expect(magicLinkFailure(null)).toBeNull();
  });
});

describe("textos de auth", () => {
  it("el login no tiene un mensaje distinto según exista el correo", () => {
    for (const messages of [es.login.errors, en.login.errors]) {
      expect(Object.keys(messages).sort()).toEqual(
        ["callback", "googleFailed", "invalidEmail", "link", "rateLimited", "sendFailed"].sort(),
      );
      for (const text of Object.values(messages)) {
        expect(text.toLowerCase()).not.toMatch(
          /no existe|ya está registrad|already registered|does not exist|user not found|not found/,
        );
      }
    }
  });

  it("la pantalla no pinta el mensaje crudo de Supabase", () => {
    const source = readFileSync("app/login/login-form.tsx", "utf8");
    expect(source).toContain("shouldCreateUser: true");
    expect(source).toContain("magicLinkFailure");
    expect(source).not.toContain("error.message");
  });
});
