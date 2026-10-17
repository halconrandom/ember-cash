/**
 * Materializa ocurrencias en recurring_occurrences. Idempotente: la unique
 * (ítem, fecha) y las fechas guardadas en rescheduled_from impiden duplicar
 * o recrear un vencimiento que el usuario movió.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import type { RecurringFrequency, RecurringStatus } from "@/lib/db/types";

import { datesToInsert, occurrenceDates } from "./schedule";

type Client = SupabaseClient<Database>;

type ItemRow = {
  id: string;
  frequency: RecurringFrequency;
  interval: number;
  anchor_date: string;
  ends_on: string | null;
  status: RecurringStatus;
};

/**
 * Inserta las ocurrencias que faltan entre `from` y `until` para los ítems
 * activos. `ownerId` limita a un usuario (la pantalla); sin él, todos (el cron,
 * con la service role). Devuelve cuántas filas intentó insertar.
 */
export async function ensureOccurrences(
  supabase: Client,
  until: string,
  options: { from: string; ownerId?: string },
): Promise<number> {
  let itemsQuery = supabase
    .from("recurring_items")
    .select("id, frequency, interval, anchor_date, ends_on, status")
    .eq("status", "active");
  if (options.ownerId) itemsQuery = itemsQuery.eq("owner_id", options.ownerId);
  const { data: items, error } = await itemsQuery;
  if (error) throw new Error(`No se pudieron leer los recurrentes: ${error.message}`);
  if (!items || items.length === 0) return 0;

  const rows = items as ItemRow[];
  const ids = rows.map((item) => item.id);
  const { data: existing, error: existingError } = await supabase
    .from("recurring_occurrences")
    .select("recurring_item_id, due_on, rescheduled_from")
    .in("recurring_item_id", ids);
  if (existingError) {
    throw new Error(`No se pudieron leer los vencimientos: ${existingError.message}`);
  }

  const byItem = new Map<string, { dueOn: string; rescheduledFrom: string | null }[]>();
  for (const row of existing ?? []) {
    const list = byItem.get(row.recurring_item_id) ?? [];
    list.push({ dueOn: row.due_on, rescheduledFrom: row.rescheduled_from });
    byItem.set(row.recurring_item_id, list);
  }

  const inserts: { recurring_item_id: string; due_on: string }[] = [];
  for (const item of rows) {
    const scheduled = occurrenceDates(
      {
        frequency: item.frequency,
        interval: item.interval,
        anchorDate: item.anchor_date,
        endsOn: item.ends_on,
        status: item.status,
      },
      options.from,
      until,
    );
    for (const dueOn of datesToInsert(scheduled, byItem.get(item.id) ?? [])) {
      inserts.push({ recurring_item_id: item.id, due_on: dueOn });
    }
  }
  if (inserts.length === 0) return 0;

  const { error: insertError } = await supabase.from("recurring_occurrences").insert(inserts);
  if (!insertError) return inserts.length;
  // Una carrera (dos pantallas a la vez) choca con la unique: se reintenta
  // fila por fila y se ignora la que ya existe.
  if (insertError.code !== "23505") {
    throw new Error(`No se pudieron crear los vencimientos: ${insertError.message}`);
  }
  for (const row of inserts) {
    const { error: oneError } = await supabase.from("recurring_occurrences").insert(row);
    if (oneError && oneError.code !== "23505") {
      throw new Error(`No se pudieron crear los vencimientos: ${oneError.message}`);
    }
  }
  return inserts.length;
}
