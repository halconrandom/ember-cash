// El bot propone, confirma y deshace. No muestra saldos ni guarda al escribir.
import { describe, expect, it, vi } from "vitest";

import es from "@/messages/es.json";

import { handleTelegramUpdate } from "./handle";
import type {
  ContextResult,
  DraftResult,
  OccurrenceDraftResult,
  SubscriptionDraftResult,
  TelegramGateway,
  TelegramSender,
} from "./types";

const DRAFT_ID = "00000000-0000-4000-8000-0000000000d1";
const OCC_ID = "00000000-0000-4000-8000-0000000000e1";

const LINKED: ContextResult = {
  ok: true,
  linked: true,
  locale: "es",
  enabled: ["COP", "USD", "EUR"],
  defaultCurrency: "COP",
  hasAccount: true,
};

const DRAFT: DraftResult = {
  ok: true,
  draftId: DRAFT_ID,
  kind: "expense",
  amountMinor: 25000n,
  currency: "COP",
  categoryKey: "food",
  description: "mercado",
  accountName: "Ahorros",
  occurredOn: "2026-10-20",
};

function message(text: string, id = 1001) {
  return { message: { text, from: { id }, chat: { id, type: "private" } } };
}

function callback(data: string, id = 1001) {
  return {
    callback_query: {
      id: "cb1",
      data,
      from: { id },
      message: { message_id: 7, chat: { id, type: "private" } },
    },
  };
}

const SUB_DRAFT: SubscriptionDraftResult = {
  ok: true,
  draftId: DRAFT_ID,
  name: "Netflix",
  amountMinor: 44900n,
  currency: "COP",
  frequency: "monthly",
  nextCharge: "2026-10-15",
};

const OCC_DRAFT: OccurrenceDraftResult = {
  ok: true,
  draftId: DRAFT_ID,
  name: "Internet",
  amountMinor: 80000n,
  currency: "COP",
  dueOn: "2026-10-20",
};

function gateway(partial: Partial<TelegramGateway> = {}): TelegramGateway {
  return {
    consumeLimit: vi.fn(async () => ({ ok: true as const, allowed: true })),
    link: vi.fn(async () => ({ ok: true as const })),
    context: vi.fn(async () => ({ ok: true as const, linked: false as const })),
    putDraft: vi.fn(async () => DRAFT),
    putSubscriptionDraft: vi.fn(async () => SUB_DRAFT),
    putOccurrenceDraft: vi.fn(async () => OCC_DRAFT),
    dueOccurrences: vi.fn(async () => ({ ok: true as const, items: [] })),
    commit: vi.fn(async () => ({ ok: true as const })),
    cancel: vi.fn(async () => ({ ok: true as const })),
    undo: vi.fn(async () => ({ ok: true as const })),
    ...partial,
  };
}

function sender(): TelegramSender & {
  send: ReturnType<typeof vi.fn>;
  answer: ReturnType<typeof vi.fn>;
  edit: ReturnType<typeof vi.fn>;
} {
  return {
    send: vi.fn(async () => undefined),
    answer: vi.fn(async () => undefined),
    edit: vi.fn(async () => undefined),
  };
}

describe("handleTelegramUpdate", () => {
  it("a quien no está vinculado solo le explica cómo vincularse", async () => {
    const db = gateway();
    const out = sender();
    await handleTelegramUpdate(message("gasté 25000 mercado"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.linkHelp);
    expect(db.putDraft).not.toHaveBeenCalled();
    expect(db.link).not.toHaveBeenCalled();
  });

  it("vincula con /start y el código", async () => {
    const code = "a".repeat(64);
    const db = gateway();
    const out = sender();
    await handleTelegramUpdate(message(`/start ${code}`), db, out);
    expect(db.link).toHaveBeenCalledWith(1001, 1001, code);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.linkedOk);
    expect(db.putDraft).not.toHaveBeenCalled();
  });

  it("no propone nada si se pasó del límite", async () => {
    const db = gateway({
      consumeLimit: vi.fn(async () => ({ ok: true as const, allowed: false })),
    });
    const out = sender();
    await handleTelegramUpdate(message("gasté 25000 mercado"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.rateLimited);
    expect(db.putDraft).not.toHaveBeenCalled();
    expect(db.context).not.toHaveBeenCalled();
  });

  it("responde con el resumen y los botones, sin guardar", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("gasté 25000 mercado"), db, out);
    expect(db.putDraft).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
    const text = String(out.send.mock.calls[0]?.[1]);
    expect(text).toContain("Gasto");
    expect(text).toContain("Comida y mercado");
    expect(text).toContain("Ahorros");
    expect(text.toLowerCase()).not.toContain("saldo");
    expect(out.send).toHaveBeenCalledWith(1001, text, [
      { label: "Guardar", data: `save:${DRAFT_ID}` },
      { label: "Cancelar", data: `cancel:${DRAFT_ID}` },
    ]);
  });

  it("Guardar crea el movimiento y quita los botones", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(callback(`save:${DRAFT_ID}`), db, out);
    expect(out.answer).toHaveBeenCalledWith("cb1");
    expect(db.commit).toHaveBeenCalledWith(1001, DRAFT_ID);
    expect(out.edit).toHaveBeenCalledWith(1001, 7, es.telegram.saved);
    expect(String(out.edit.mock.calls[0]?.[2]).toLowerCase()).not.toContain("saldo");
  });

  it("Cancelar borra el borrador", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(callback(`cancel:${DRAFT_ID}`), db, out);
    expect(db.cancel).toHaveBeenCalledWith(1001, DRAFT_ID);
    expect(out.edit).toHaveBeenCalledWith(1001, 7, es.telegram.cancelled);
  });

  it("/deshacer borra el último movimiento del bot", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("/deshacer"), db, out);
    expect(db.undo).toHaveBeenCalledWith(1001);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.undoOk);
    expect(db.putDraft).not.toHaveBeenCalled();
  });

  it("/ayuda lista los comandos sin necesitar vínculo", async () => {
    const db = gateway();
    const out = sender();
    await handleTelegramUpdate(message("/ayuda"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.help);
    expect(db.context).toHaveBeenCalledOnce();
  });

  it("/gasto fuerza el tipo de movimiento sin adivinar", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("/gasto 25000 mercado"), db, out);
    expect(db.putDraft).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "expense", amountMinor: 25000n, categoryKey: "food" }),
    );
  });

  it("/ingreso fuerza income aunque el texto no tenga ninguna pista", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("/ingreso 25000 mercado"), db, out);
    expect(db.putDraft).toHaveBeenCalledWith(expect.objectContaining({ kind: "income" }));
  });

  it("/sub propone la suscripción con Guardar y Cancelar", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("/sub 44900 cop Netflix mensual 15"), db, out);
    expect(db.putSubscriptionDraft).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Netflix", frequency: "monthly", dayOfMonth: 15 }),
    );
    const text = String(out.send.mock.calls[0]?.[1]);
    expect(text).toContain("Netflix");
    expect(out.send).toHaveBeenCalledWith(1001, text, [
      { label: "Guardar", data: `save:${DRAFT_ID}` },
      { label: "Cancelar", data: `cancel:${DRAFT_ID}` },
    ]);
  });

  it("confirmar una suscripción llama a commit igual que cualquier borrador", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(callback(`save:${DRAFT_ID}`), db, out);
    expect(db.commit).toHaveBeenCalledWith(1001, DRAFT_ID);
    expect(out.edit).toHaveBeenCalledWith(1001, 7, es.telegram.saved);
  });

  it("/pagar sin vencimientos pendientes lo dice y no ofrece botones", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(message("/pagar"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.noDue);
  });

  it("/pagar lista los vencimientos, uno por fila", async () => {
    const db = gateway({
      context: vi.fn(async () => LINKED),
      dueOccurrences: vi.fn(async () => ({
        ok: true as const,
        items: [
          { occurrenceId: OCC_ID, name: "Internet", amountMinor: 80000n, currency: "COP" as const, dueOn: "2026-10-20" },
        ],
      })),
    });
    const out = sender();
    await handleTelegramUpdate(message("/pagar"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.payPrompt, [
      { label: expect.stringContaining("Internet"), data: `pay:${OCC_ID}` },
    ]);
  });

  it("elegir un cobro de /pagar pide confirmación con Guardar y Cancelar", async () => {
    const db = gateway({ context: vi.fn(async () => LINKED) });
    const out = sender();
    await handleTelegramUpdate(callback(`pay:${OCC_ID}`), db, out);
    expect(db.putOccurrenceDraft).toHaveBeenCalledWith(1001, 1001, OCC_ID);
    expect(out.edit).toHaveBeenCalledWith(
      1001,
      7,
      expect.stringContaining("Internet"),
      [
        { label: "Guardar", data: `save:${DRAFT_ID}` },
        { label: "Cancelar", data: `cancel:${DRAFT_ID}` },
      ],
    );
  });

  it("pagar un cobro ajeno (no encontrado) no ofrece botones", async () => {
    const db = gateway({
      context: vi.fn(async () => LINKED),
      putOccurrenceDraft: vi.fn(async () => ({ ok: false as const, error: "not_found" as const })),
    });
    const out = sender();
    await handleTelegramUpdate(callback(`pay:${OCC_ID}`), db, out);
    expect(out.edit).toHaveBeenCalledWith(1001, 7, es.telegram.payNotFound);
  });

  it("/deshacer dice cuando algo ya no se puede deshacer de forma segura", async () => {
    const db = gateway({
      context: vi.fn(async () => LINKED),
      undo: vi.fn(async () => ({ ok: false as const, error: "cannot_undo" as const })),
    });
    const out = sender();
    await handleTelegramUpdate(message("/deshacer"), db, out);
    expect(out.send).toHaveBeenCalledWith(1001, es.telegram.cannotUndo);
  });

  it("ignora un grupo y no gasta el cupo", async () => {
    const db = gateway();
    const out = sender();
    await handleTelegramUpdate(
      {
        message: {
          text: "gasté 25000 mercado",
          from: { id: 1001 },
          chat: { id: -5, type: "group" },
        },
      },
      db,
      out,
    );
    expect(db.consumeLimit).not.toHaveBeenCalled();
    expect(out.send).not.toHaveBeenCalled();
  });
});
