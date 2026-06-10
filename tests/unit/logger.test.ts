import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LiveRunLogger } from '../../src/_shared/liveLog';

const tmpDir = path.join(process.cwd(), 'tests', '.tmp-logs');
const RUN_ID = 'test-run-123';

beforeEach(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function readLines(file: string): Promise<unknown[]> {
  const text = await fs.readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('LiveRunLogger', () => {
  it('open() creates the file at {logsDir}/{runId}.json', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    expect(logger.file).toBe(path.join(tmpDir, `${RUN_ID}.json`));
    await logger.open();
    const stat = await fs.stat(logger.file);
    expect(stat.isFile()).toBe(true);
    await logger.complete();
  });

  it('open() writes an initial init event', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    const lines = await readLines(logger.file);
    expect(lines).toHaveLength(1);
    const init = lines[0] as Record<string, unknown>;
    expect(init.runId).toBe(RUN_ID);
    expect(init.workflow).toBe('test');
    expect(init.step).toBe('init');
    expect(typeof init.ts).toBe('string');
    await logger.complete();
  });

  it('event() appends one JSON line per call, in order', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.event('step-1', { foo: 'bar' });
    await logger.event('step-2', { n: 42 });
    await logger.event('step-3');

    const lines = await readLines(logger.file);
    expect(lines).toHaveLength(4); // init + 3 events

    const steps = lines.map((l) => (l as Record<string, unknown>).step);
    expect(steps).toEqual(['init', 'step-1', 'step-2', 'step-3']);

    const e1 = lines[1] as Record<string, unknown>;
    expect(e1.foo).toBe('bar');
    const e2 = lines[2] as Record<string, unknown>;
    expect(e2.n).toBe(42);

    await logger.complete();
  });

  it('llmCall() records the LLM result, latency, model, and a contentPreview', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.llmCall(
      'openai/gpt-4o',
      { content: 'hello world', tokensIn: 10, tokensOut: 20, costUsd: 0.5 },
      123
    );

    const lines = await readLines(logger.file);
    const call = lines[1] as Record<string, unknown>;
    expect(call.step).toBe('llm-call');
    expect(call.model).toBe('openai/gpt-4o');
    expect(call.latencyMs).toBe(123);
    expect(call.tokensIn).toBe(10);
    expect(call.tokensOut).toBe(20);
    expect(call.costUsd).toBe(0.5);
    expect(call.contentPreview).toBe('hello world');
    expect(call.status).toBe('ok');
    await logger.complete();
  });

  it('llmCall() truncates very long content to ~500 chars', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    const long = 'x'.repeat(2000);
    await logger.llmCall(
      'm',
      { content: long, tokensIn: 0, tokensOut: 0, costUsd: 0 },
      1
    );

    const lines = await readLines(logger.file);
    const call = lines[1] as Record<string, unknown>;
    const preview = call.contentPreview as string;
    expect(preview.length).toBeLessThanOrEqual(503); // 500 + '...'
    expect(preview.endsWith('...')).toBe(true);
    expect(preview.length).toBeGreaterThan(500);
    await logger.complete();
  });

  it('llmCall() records an error when opts.error is set', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.llmCall(
      'm',
      { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
      50,
      { error: 'rate limited' }
    );

    const lines = await readLines(logger.file);
    const call = lines[1] as Record<string, unknown>;
    expect(call.status).toBe('error');
    expect(call.error).toBe('rate limited');
    await logger.complete();
  });

  it('complete() flushes a final "complete" event and closes the file', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.event('work', { x: 1 });
    await logger.complete({ summary: 'ok' });

    const lines = await readLines(logger.file);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.step).toBe('complete');
    expect(last.status).toBe('ok');
    expect(last.summary).toBe('ok');
    expect(logger.isClosed).toBe(true);
  });

  it('fail() writes a "failed" event with the error message', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.fail(new Error('boom'), { partial: true });

    const lines = await readLines(logger.file);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.step).toBe('failed');
    expect(last.status).toBe('error');
    expect(last.error).toBe('boom');
    expect(last.partial).toBe(true);
    expect(logger.isClosed).toBe(true);
  });

  it('fail() accepts non-Error throwables (e.g. strings)', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.fail('plain string');

    const lines = await readLines(logger.file);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.error).toBe('plain string');
    expect(logger.isClosed).toBe(true);
  });

  it('a second call to complete() does not double-close or double-write', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.complete({ once: true });
    await logger.complete({ twice: true });

    const lines = await readLines(logger.file);
    const completeCount = lines.filter((l) => (l as Record<string, unknown>).step === 'complete').length;
    expect(completeCount).toBe(1);
    const last = lines[lines.length - 1] as Record<string, unknown>;
    expect(last.once).toBe(true);
    expect(last.twice).toBeUndefined();
  });

  it('a second call to fail() after complete() is a no-op', async () => {
    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    await logger.complete();
    await logger.fail(new Error('after-complete'));

    const lines = await readLines(logger.file);
    const failedCount = lines.filter((l) => (l as Record<string, unknown>).step === 'failed').length;
    expect(failedCount).toBe(0);
  });

  it('open() truncates an existing file', async () => {
    const file = path.join(tmpDir, `${RUN_ID}.json`);
    await fs.writeFile(file, 'STALE PREVIOUS CONTENT\n', 'utf8');

    const logger = new LiveRunLogger(RUN_ID, 'test', '2026-06-01T00:00:00.000Z', tmpDir);
    await logger.open();
    const text = await fs.readFile(file, 'utf8');
    expect(text).not.toContain('STALE PREVIOUS CONTENT');
    const lines = await readLines(file);
    expect(lines[0]).toMatchObject({ step: 'init' });
    await logger.complete();
  });

  it('writing to a non-existent logs dir is created on open()', async () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c');
    const logger = new LiveRunLogger('run-x', 'test', undefined, nested);
    await logger.open();
    await logger.event('first');
    const stat = await fs.stat(logger.file);
    expect(stat.isFile()).toBe(true);
    await logger.complete();
  });
});
