/**
 * CSV built in the browser (spec D14): RFC 4180 quoting, CRLF rows, a header row from the column labels.
 * Team names are student-chosen, so a string cell that a spreadsheet would run as a formula (one starting
 * with =, +, -, @, a tab or a carriage return) gets a leading apostrophe; numbers stay numeric.
 */
export interface CsvColumn { key: string; label: string }

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const s = typeof value === 'string' && FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * A label as part of a file name: accents dropped, lower case, every other run of characters one hyphen
 * ("CSE 115A · Fall 2026" → "cse-115a-fall-2026", "Yazılım Mühendisliği" → "yazilim-muhendisligi"); "" when nothing is left.
 */
export function fileSlug(label: string): string {
  return label
    .replace(/ı/g, 'i') // the Turkish dotless i has no decomposition
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `downloadCsv(filename, csv)`: the roster export's Blob-and-link download, shared rather than copied. */
export { downloadCsv } from '@features/app/utils/exportClassCsv';
