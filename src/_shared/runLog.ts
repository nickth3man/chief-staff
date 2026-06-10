import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { paths } from '../../config/paths';
import { appendRow } from './csv';
import { LiveRunLogger } from './liveLog';

export interface RunLog {
  runId: string;
  workflow: string;
  startedAt: string;
  endedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  notes?: string;
}

export function newRunId(): string {
  return uuidv4();
}

export async function writeRunLog(log: RunLog): Promise<string> {
  const file = path.join(paths.outbox.runs, `${log.runId}.json`);
  await fs.mkdir(paths.outbox.runs, { recursive: true });
  await fs.writeFile(file, JSON.stringify(log, null, 2), 'utf8');
  return file;
}

export async function appendRunIndex(log: RunLog): Promise<void> {
  const header = ['runId', 'workflow', 'startedAt', 'endedAt', 'status', 'costUsd'];
  const today = log.startedAt.slice(0, 10);
  await appendRow(
    path.join(paths.outbox.runs, 'index.csv'),
    {
      runId: log.runId,
      workflow: log.workflow,
      startedAt: log.startedAt,
      endedAt: log.endedAt ?? '',
      status: log.status,
      costUsd: log.costUsd.toFixed(6),
    },
    header
  );
  return;
}

export interface CostRow {
  date: string;
  workflow: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export async function appendCost(row: CostRow): Promise<void> {
  await fs.mkdir(paths.metrics.root, { recursive: true });
  const header = ['Date', 'Workflow', 'Model', 'TokensIn', 'TokensOut', 'CostUsd'];
  await appendRow(
    paths.metrics.cost,
    {
      Date: row.date,
      Workflow: row.workflow,
      Model: row.model,
      TokensIn: row.tokensIn,
      TokensOut: row.tokensOut,
      CostUsd: row.costUsd.toFixed(6),
    },
    header
  );
  void today();
  return;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Construct a `LiveRunLogger` for the given run. The caller is responsible
 * for `open()`-ing it, writing events, and calling `complete()` or `fail()`.
 *
 * This is a thin convenience wrapper; the runId / workflow names match the
 * existing `writeRunLog` / `appendRunIndex` audit trail, but the live file
 * lives in `paths.logs` (one file per run, JSONL format) — see
 * `src/_shared/liveLog.ts` for the full schema.
 */
export function createLiveLogger(runId: string, workflow: string): LiveRunLogger {
  return new LiveRunLogger(runId, workflow);
}
