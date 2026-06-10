import { promises as fs } from 'node:fs';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export async function readAll(filePath: string): Promise<Record<string, string>[]> {
  const text = await fs.readFile(filePath, 'utf8');
  return parseCsv(text);
}

export function parseCsv(text: string): Record<string, string>[] {
  const { header, records } = parseCsvRaw(text);
  if (header.length === 0) return [];
  return records.map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = cells[idx] ?? '';
    });
    return row;
  });
}

/**
 * Lower-level parser: tokenize the CSV text into rows, then split the first
 * row off as the header. Respects double-quoted cells, including newlines and
 * embedded `""` escapes.
 */
function parseCsvRaw(text: string): { header: string[]; records: string[][] } {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // ignore; \n handles record breaks
    } else if (ch === '\n') {
      current.push(cell);
      if (current.some((c) => c.length > 0)) rows.push(current);
      current = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  // flush trailing cell/record (no terminating newline)
  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    if (current.some((c) => c.length > 0)) rows.push(current);
  }
  const header = rows.shift() ?? [];
  return { header, records: rows };
}

export async function ensureFileWithHeader(filePath: string, header: string[]): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(filePath.split(/[\\/]/).slice(0, -1).join('/'), { recursive: true });
    await fs.writeFile(filePath, header.join(',') + '\n', 'utf8');
  }
}

export async function appendRow(filePath: string, row: Record<string, unknown>, header?: string[]): Promise<void> {
  if (header) {
    await ensureFileWithHeader(filePath, header);
  }
  const keys = header ?? Object.keys(row);
  const line = keys.map((k) => escapeCell(row[k])).join(',');
  await fs.appendFile(filePath, line + '\n', 'utf8');
}

export { parseLine, escapeCell };
