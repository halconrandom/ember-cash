// Tests de los tokens de invitación.
import { describe, expect, it } from "vitest";

import {
  buildInviteUrl,
  extractInviteToken,
  generateInviteToken,
  hashInviteToken,
} from "./invites";

describe("invites", () => {
  it("genera tokens distintos de 43 caracteres base64url", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("calcula el mismo SHA-256 hex que Postgres", () => {
    // Valor obtenido en Supabase con:
    // select encode(sha256(convert_to('token-uno','UTF8')),'hex');
    expect(hashInviteToken("token-uno")).toBe(
      "10340d39a0d5b2f4fb6c14a76ab080e5c8e41a534041fa64cadf40bb8999c6bd",
    );
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("arma el link sin barras dobles", () => {
    expect(buildInviteUrl("http://localhost:3000/", "t")).toBe("http://localhost:3000/invite/t");
  });

  it("extrae el token de un link o del token suelto", () => {
    const token = generateInviteToken();
    expect(extractInviteToken(`https://ember.cash/invite/${token}`)).toBe(token);
    expect(extractInviteToken(`  ${token}  `)).toBe(token);
    expect(extractInviteToken(`http://localhost:3000/invite/${token}?x=1`)).toBe(token);
  });

  it("rechaza entradas que no son tokens", () => {
    expect(extractInviteToken("")).toBeNull();
    expect(extractInviteToken("hola")).toBeNull();
    expect(extractInviteToken("https://ember.cash/invite/corto")).toBeNull();
  });
});
