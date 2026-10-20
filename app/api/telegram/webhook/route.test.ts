// Secreto del webhook: sin configuración 404, firma mala 401, firma buena 200.
import { afterEach, describe, expect, it, vi } from "vitest";

const handleTelegramUpdate = vi.fn(async () => undefined);
vi.mock("@/lib/telegram/handle", () => ({ handleTelegramUpdate }));

const { POST } = await import("./route");

const SECRET = "a".repeat(32);
const TOKEN = "123456:test-token";

const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ORIGINAL_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function restore(
  name: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_WEBHOOK_SECRET",
  value: string | undefined,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  handleTelegramUpdate.mockClear();
  restore("TELEGRAM_BOT_TOKEN", ORIGINAL_TOKEN);
  restore("TELEGRAM_WEBHOOK_SECRET", ORIGINAL_SECRET);
});

function configure() {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
}

function call(header?: string, body = "{}") {
  return POST(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: header === undefined ? {} : { "x-telegram-bot-api-secret-token": header },
      body,
    }),
  );
}

describe("POST /api/telegram/webhook", () => {
  it("responde 404 si falta el token o el secreto y no atiende el update", async () => {
    const missing = await call(SECRET);
    expect(missing.status).toBe(404);
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    const onlyToken = await call(SECRET);
    expect(onlyToken.status).toBe(404);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("responde 401 si la firma no coincide, también cuando la longitud es distinta", async () => {
    configure();
    const wrong = await call("b".repeat(32));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ ok: false });
    const short = await call("corto");
    expect(short.status).toBe(401);
    const missing = await call();
    expect(missing.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("con el secreto responde 200 y atiende el update", async () => {
    configure();
    const res = await call(SECRET, JSON.stringify({ update_id: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handleTelegramUpdate).toHaveBeenCalledOnce();
  });
});
