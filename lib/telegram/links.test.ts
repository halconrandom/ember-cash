// El enlace del navegador es https. tg:// solo va codificado en el hash.
import { describe, expect, it } from "vitest";

import { telegramLinkUrls } from "./links";

const CODE = "a".repeat(64);

describe("telegramLinkUrls", () => {
  it("abre el bot en la web sin usar tg:// como esquema", () => {
    const links = telegramLinkUrls("embercash_bot", CODE);
    expect(links?.appUrl).toBe(`https://t.me/embercash_bot?start=${CODE}`);
    expect(links?.webUrl.startsWith("https://web.telegram.org/a/#?tgaddr=")).toBe(true);
    expect(links?.webUrl.includes("tg://")).toBe(false);
    expect(decodeURIComponent(links?.webUrl.split("tgaddr=")[1] ?? "")).toBe(
      `tg://resolve?domain=embercash_bot&start=${CODE}`,
    );
  });

  it("rechaza un usuario o un código que no caben en el enlace", () => {
    expect(telegramLinkUrls("mal", CODE)).toBeNull();
    expect(telegramLinkUrls("embercash_bot", "corto")).toBeNull();
  });
});
