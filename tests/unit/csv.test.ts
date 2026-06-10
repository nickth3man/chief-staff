import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseCsv, appendRow, readAll } from '../../src/_shared/csv';

const tmpDir = path.join(process.cwd(), 'tests', '.tmp');

beforeEach(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('csv helpers', () => {
  it('parses simple CSV with quoted commas', async () => {
    const file = path.join(tmpDir, 'a.csv');
    await fs.writeFile(
      file,
      'a,b,c\n"x,1","y\n2",z\n',
      'utf8'
    );
    const rows = await readAll(file);
    expect(rows).toEqual([
      { a: 'x,1', b: 'y\n2', c: 'z' },
    ]);
  });

  it('appends rows with proper escaping', async () => {
    const file = path.join(tmpDir, 'b.csv');
    await fs.writeFile(file, 'col1,col2\n', 'utf8');
    await appendRow(file, { col1: 'hello, world', col2: 'simple' });
    await appendRow(file, { col1: 'with "quote"', col2: 'normal' });
    const text = await fs.readFile(file, 'utf8');
    expect(text).toContain('"hello, world"');
    expect(text).toContain('"with ""quote"""');
    const rows = await parseCsv(text);
    expect(rows).toHaveLength(2);
  });
});
