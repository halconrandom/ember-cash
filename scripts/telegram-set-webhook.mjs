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

// Comandos del menú (fases T3/T4), en español (predeterminado) e inglés.
const COMMANDS_ES = [
  { command: "ayuda", description: "Lista los comandos" },
  { command: "gasto", description: "Registra un gasto: /gasto 25000 mercado" },
  { command: "ingreso", description: "Registra un ingreso: /ingreso 1200000 salario" },
  { command: "sub", description: "Crea una suscripción: /sub 44900 cop Netflix mensual 15" },
  { command: "pagar", description: "Lista tus cobros vencidos o de hoy" },
  { command: "deuda", description: "Registra una deuda: /deuda 500000 Juan" },
  { command: "abono", description: "Elige una deuda abierta y paga un abono" },
  { command: "ahorro", description: "Elige una meta activa y registra un aporte" },
  { command: "deshacer", description: "Borra lo último que guardó el bot" },
];

const COMMANDS_EN = [
  { command: "ayuda", description: "List the commands" },
  { command: "gasto", description: "Record an expense: /gasto 25000 groceries" },
  { command: "ingreso", description: "Record an income: /ingreso 1200000 salary" },
  { command: "sub", description: "Create a subscription: /sub 44900 cop Netflix monthly 15" },
  { command: "pagar", description: "List your overdue or due-today charges" },
  { command: "deuda", description: "Record a debt: /deuda 500000 Juan" },
  { command: "abono", description: "Pick an open debt and pay towards it" },
  { command: "ahorro", description: "Pick an active goal and log a contribution" },
  { command: "deshacer", description: "Undo the last thing the bot saved" },
];

async function setCommands(commands, languageCode) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        languageCode ? { commands, language_code: languageCode } : { commands },
      ),
    });
  } catch {
    console.error(`No se pudo registrar el menú de comandos (${languageCode ?? "es"}, sin red).`);
    return false;
  }
  if (!res.ok) {
    console.error(`No se pudo registrar el menú de comandos (${languageCode ?? "es"}, HTTP ${res.status}).`);
    return false;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!body || body.ok !== true) {
    console.error(`No se pudo registrar el menú de comandos (${languageCode ?? "es"}).`);
    return false;
  }
  return true;
}

const okEs = await setCommands(COMMANDS_ES, undefined);
const okEn = await setCommands(COMMANDS_EN, "en");
if (okEs && okEn) {
  console.log("Menú de comandos registrado (es y en).");
} else {
  process.exit(1);
}
