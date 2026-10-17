/**
 * Respaldo de lo que el usuario puede ver (RLS). Cada tabla sale como CSV
 * pedido a PostgREST con Accept: text/csv, así los bigint no pasan por
 * number. La anon key y el access token del usuario: nunca la service role.
 *
 * Tope: 100 páginas de 1000 filas por tabla. Si se llena, el ZIP incluye
 * TRUNCATED.txt y esa tabla está incompleta.
 */
import { parseCsv, serializeCsv } from "./csv";
import { zipStore } from "./zip";

/** Orden de restauración: padres antes que hijos. */
export const EXPORT_TABLES = [
  { file: "profiles.csv", table: "profiles", order: "id.asc" },
  { file: "households.csv", table: "households", order: "id.asc" },
  {
    file: "household_members.csv",
    table: "household_members",
    order: "household_id.asc,user_id.asc",
  },
  { file: "household_departures.csv", table: "household_departures", order: "id.asc" },
  { file: "accounts.csv", table: "accounts", order: "id.asc" },
  { file: "goals.csv", table: "goals", order: "id.asc" },
  { file: "debts.csv", table: "debts", order: "id.asc" },
  { file: "recurring_items.csv", table: "recurring_items", order: "id.asc" },
  { file: "transactions.csv", table: "transactions", order: "id.asc" },
  {
    file: "transaction_splits.csv",
    table: "transaction_splits",
    order: "transaction_id.asc,user_id.asc",
  },
  { file: "goal_contributions.csv", table: "goal_contributions", order: "id.asc" },
  { file: "debt_payments.csv", table: "debt_payments", order: "id.asc" },
  { file: "recurring_occurrences.csv", table: "recurring_occurrences", order: "id.asc" },
  { file: "budgets.csv", table: "budgets", order: "id.asc" },
  { file: "settlements.csv", table: "settlements", order: "id.asc" },
] as const;

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 100;

export type BackupFile = { name: string; text: string };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Texto que viaja dentro del ZIP. Explica las unidades menores y el orden
 * para volver a cargar las filas a mano: la app no importa el archivo.
 */
export function backupReadme(truncated: readonly string[]): string {
  const cut =
    truncated.length > 0
      ? `\nIncompleto. Estas tablas llegaron al tope y faltan filas: ${truncated.join(", ")}.\nIncomplete. These tables hit the cap and are missing rows: ${truncated.join(", ")}.\n`
      : "";
  return `Ember Cash backup
${cut}
Los CSV usan las columnas de la base. Los montos (*_minor) son enteros en unidades menores, en la moneda de la columna currency. COP: pesos (0 decimales). USD: centavos (2 decimales). No los dividas ni los pases por un decimal binario. deleted_at vacío significa que la fila sigue activa.

The CSVs use the database columns. Amounts (*_minor) are integers in minor units, in the currency column. COP is pesos (0 decimals). USD is cents (2 decimals). Do not divide them or run them through a binary float. An empty deleted_at means the row is still active.

No hay importación automática. Para restaurar en un proyecto con las migraciones aplicadas, conserva los uuid y carga las filas en el orden de los archivos: ${EXPORT_TABLES.map((item) => item.file).join(", ")}. owner_id y user_id tienen que ser el id de la cuenta en Supabase Auth. Si la cuenta es nueva, esos id cambian y hay que reemplazarlos. Un archivo vacío significa que no había filas.

There is no automatic import. To restore into a project with the migrations applied, keep the uuids and load the rows in file order: ${EXPORT_TABLES.map((item) => item.file).join(", ")}. owner_id and user_id must be the Supabase Auth user id. A new account gets new ids, and those values have to be replaced. An empty file means there were no rows.

El respaldo de todo el proyecto (Auth incluida) está en el panel de Supabase: Database, Backups.
The full project backup, including Auth, is in the Supabase dashboard: Database, Backups.
`;
}

/** Baja una tabla paginada. Devuelve el CSV ya neutralizado y si se cortó. */
export async function fetchTableCsv(options: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  table: string;
  order: string;
  fetchImpl?: FetchLike;
}): Promise<{ csv: string; truncated: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let rows: string[][] = [];
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`/rest/v1/${options.table}`, options.supabaseUrl);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", options.order);
    const offset = page * PAGE_SIZE;
    const response = await fetchImpl(url.toString(), {
      headers: {
        apikey: options.anonKey,
        Authorization: `Bearer ${options.accessToken}`,
        Accept: "text/csv",
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      },
      cache: "no-store",
    });
    // 416: el offset ya no tiene filas.
    if (response.status === 416) break;
    if (!response.ok) {
      throw new Error(`No se pudo exportar ${options.table} (${response.status}).`);
    }
    const parsed = parseCsv(await response.text());
    if (parsed.length === 0) break;
    if (page === 0) rows = parsed;
    else rows.push(...parsed.slice(1));
    const dataRows = parsed.length - 1;
    if (dataRows < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { csv: serializeCsv(rows), truncated };
}

/** Arma los archivos del respaldo, README incluido. */
export async function collectBackup(options: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<{ files: BackupFile[]; truncated: string[] }> {
  const truncated: string[] = [];
  const files: BackupFile[] = [];
  for (const item of EXPORT_TABLES) {
    const result = await fetchTableCsv({ ...options, table: item.table, order: item.order });
    files.push({ name: item.file, text: result.csv });
    if (result.truncated) truncated.push(item.table);
  }
  const readme = backupReadme(truncated);
  const withReadme = [{ name: "README.txt", text: readme }, ...files];
  if (truncated.length > 0) {
    withReadme.push({
      name: "TRUNCATED.txt",
      text: `${truncated.join("\n")}\n`,
    });
  }
  return { files: withReadme, truncated };
}

/** ZIP listo para descargar. */
export async function buildBackupZip(
  options: {
    supabaseUrl: string;
    anonKey: string;
    accessToken: string;
    fetchImpl?: FetchLike;
  },
  date = new Date(),
): Promise<Uint8Array> {
  const { files } = await collectBackup(options);
  return zipStore(
    files.map((file) => ({ name: file.name, data: new TextEncoder().encode(file.text) })),
    date,
  );
}
