import type { ApiRosterStudent } from '@/lib/api';
import type { Class } from '@/lib/classContext';

export interface ClassExportRow {
  first_name: string;
  last_name: string;
  roster_email: string;
  email: string;
  project: string;
}

const CSV_HEADERS = ['First Name', 'Last Name', 'Roster Email', 'Email', 'Project'] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rosterStudentToExportRow(student: ApiRosterStudent): ClassExportRow {
  const project =
    student.project?.trim() ||
    (student.projects?.length ? student.projects.join(', ') : '');

  return {
    first_name: student.first_name?.trim() ?? '',
    last_name: student.last_name?.trim() ?? '',
    roster_email: student.roster_email?.trim() ?? '',
    email: student.grepthink_email?.trim() ?? '',
    project,
  };
}

export function buildClassExportCsv(rows: ClassExportRow[]): string {
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) =>
      [row.first_name, row.last_name, row.roster_email, row.email, row.project]
        .map(escapeCsvCell)
        .join(','),
    ),
  ];
  return lines.join('\r\n');
}

export function buildExportFilename(classItem: Class): string {
  const term = (classItem.term ?? '').trim();
  let year = classItem.year;
  if (year == null && classItem.start_date) {
    year = new Date(classItem.start_date.slice(0, 10)).getFullYear();
  }
  const name = classItem.name.trim();
  const base = [term, year != null ? String(year) : '', name].filter(Boolean).join(' ');
  return base.replace(/[/\\:*?"<>|]/g, '-');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
