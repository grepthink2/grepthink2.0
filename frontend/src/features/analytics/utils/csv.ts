/** CSV built in the browser (spec D14): RFC 4180 quoting, CRLF rows, a header row from the column labels. */
export interface CsvColumn { key: string; label: string }

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** `downloadCsv(filename, csv)`: the roster export's Blob-and-link download, shared rather than copied. */
export { downloadCsv } from '@features/app/utils/exportClassCsv';
