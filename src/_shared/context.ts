import { promises as fs } from 'node:fs';
import path from 'node:path';
import { slugify } from '../../agents/_shared/strings';

export interface OrgContextRow {
  'Target Company Name': string;
  Industry?: string;
  Size?: string;
  'Last Briefing Date'?: string;
  'Context Notes'?: string;
}

export async function loadOrgContext(csvPath: string): Promise<OrgContextRow[]> {
  const text = await fs.readFile(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = cells[idx] ?? '';
    });
    return row as unknown as OrgContextRow;
  });
}

export async function findOrgContextByEmail(
  csvPath: string,
  inviteeEmail: string
): Promise<OrgContextRow | null> {
  const rows = await loadOrgContext(csvPath);
  const all = await fs.readFile(csvPath, 'utf8');
  const hasEmailColumn = all.split(/\r?\n/)[0]?.includes('Invitee Electronic Address');
  if (hasEmailColumn) {
    const text = await fs.readFile(csvPath, 'utf8');
    const lineMatch = text.split(/\r?\n/).slice(1).find((l) => l.startsWith(inviteeEmail));
    if (lineMatch) {
      const cells = parseCsvLine(lineMatch);
      const header = parseCsvLine(text.split(/\r?\n/)[0]!);
      const row: Record<string, string> = {};
      header.forEach((k, i) => {
        row[k] = cells[i] ?? '';
      });
      return row as unknown as OrgContextRow;
    }
  }
  return null;
}

function parseCsvLine(line: string): string[] {
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

export async function findClientFile(
  rootDir: string,
  company: string,
  inviteeName: string
): Promise<string | null> {
  const target = slugify(company);
  const companies = await fs.readdir(rootDir);
  const companyMatch = companies.find((c) => slugify(c).includes(target) || target.includes(slugify(c)));
  if (!companyMatch) return null;

  const companyDir = path.join(rootDir, companyMatch);
  const stat = await fs.stat(companyDir);
  if (!stat.isDirectory()) return null;

  const files = await fs.readdir(companyDir);
  // Compare both the filename and the invitee name after slugification, so
  // a file named "Sarah Jenkins SaaS Performance Assessment.md" matches
  // invitee "Sarah Jenkins" regardless of whether spaces or dashes are used.
  const targetSlug = slugify(inviteeName);
  const match = files.find((f) => {
    const fSlug = slugify(f);
    return fSlug.includes(targetSlug) && fSlug.includes('saas-performance-assessment');
  });
  return match ? path.join(companyDir, match) : null;
}
