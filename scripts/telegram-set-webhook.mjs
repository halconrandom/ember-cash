#!/usr/bin/env node
/**
 * Registra el webhook del bot en Telegram.
 *
 *   pnpm telegram:webhook
 *
 * Lee TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET del entorno o, si faltan,
 * de .env.local. No imprime el token, el secreto ni el cuerpo de la respuesta
 * (un error de red de fetch trae la URL, y la URL lleva el token).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEBHOOK_URL = "https://cash.halcon.dev/api/telegram/webhook";

if (
  (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) &&
  existsSync(join(ROOT, ".env.local"))
) {
  process.loadEnvFile(join(ROOT, ".env.local"));
}

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

if (token.length === 0 || secret.length < 32) {
  console.error("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET (mínimo 32 caracteres).");
  process.exit(1);
}

let response;
try {
  response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
    }),
  });
} catch {
  console.error("No se pudo registrar el webhook (sin red).");
  process.exit(1);
}

if (!response.ok) {
  console.error(`No se pudo registrar el webhook (HTTP ${response.status}).`);
  process.exit(1);
}

let payload;
try {
  payload = await response.json();
} catch {
  console.error("No se pudo registrar el webhook.");
  process.exit(1);
}

if (!payload || payload.ok !== true) {
  console.error("No se pudo registrar el webhook.");
  process.exit(1);
}

console.log(`Webhook registrado en ${WEBHOOK_URL}.`);
