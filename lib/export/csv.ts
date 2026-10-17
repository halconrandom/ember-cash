/**
 * CSV del respaldo.
 *
 * PostgREST entrega el CSV como texto, así que un bigint llega como dígitos
 * y no pasa por un número de JavaScript. Aquí se vuelve a escribir con las
 * celdas que Excel trataría como fórmula (=, +, -, @) convertidas en texto,
 * sin tocar los enteros ni los decimales.
 */

/** Parte un CSV (comillas dobles, comas y saltos de línea dentro de comillas). */
export function parseCsv(input: string): string[][] {
  const text = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (text.trim() === "") return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Entero o decimal: no es una fórmula, aunque empiece por menos. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Si la celda arranca como fórmula de una hoja de cálculo, la precede con
 * un apóstrofo para que se abra como texto. Los montos en unidades menores
 * se dejan igual.
 */
export function neutralizeCell(value: string): string {
  if (PLAIN_NUMBER.test(value)) return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function quoteCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Vuelve a armar el CSV. La primera fila es el encabezado y no se toca. */
export function serializeCsv(rows: string[][]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((row, index) => {
    const cells = index === 0 ? row : row.map(neutralizeCell);
    return cells.map(quoteCell).join(",");
  });
  return `\uFEFF${lines.join("\n")}\n`;
}
