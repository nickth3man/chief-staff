import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { handleTurn } from '../../orchestrator/orchestrator';
import { paths } from '@config/paths';
import { promptQueue } from '../promptQueue';
import { appendRunIndex, newRunId, writeRunLog } from '../../_shared/runLog';
import { readAll } from '../../_shared/csv';

export const api = new Hono();

api.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

api.post('/chat', async (c) => {
  const body = (await c.req.json()) as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    attachedFiles?: string[];
  };
  const messages = body.messages.map((m) => ({
    ...m,
    timestamp: new Date().toISOString(),
  }));
  const result = await handleTurn(messages, body.attachedFiles);
  return c.json(result);
});

api.get('/prompt', (c) => {
  return c.json({ prompt: promptQueue.current() });
});

api.post('/prompt/answer', async (c) => {
  const body = (await c.req.json()) as { answer: string };
  const ok = promptQueue.answer(body.answer);
  return c.json({ ok });
});

api.get('/files', async (c) => {
  const kind = c.req.query('kind');
  let dir = paths.outbox.root;
  if (kind === 'briefings') dir = paths.outbox.briefings;
  if (kind === 'audio') dir = paths.outbox.audio;
  if (kind === 'meeting-notes') dir = paths.outbox.meetingNotes;
  if (kind === 'meeting-docs') dir = paths.assets.meetingDocuments;
  if (kind === 'drafts') dir = paths.outbox.drafts;
  if (kind === 'runs') dir = paths.outbox.runs;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return c.json({
    dir,
    entries: entries.map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' })),
  });
});

api.get('/file', async (c) => {
  const p = c.req.query('path');
  if (!p) return c.json({ error: 'path required' }, 400);
  const abs = path.resolve(p);
  const allowedRoots = [
    paths.outbox.root,
    paths.assets.consultantX,
    paths.assets.transcripts,
    paths.assets.meetingDocuments,
  ];
  if (!allowedRoots.some((root) => abs.startsWith(root))) {
    return c.json({ error: 'path outside allowed roots' }, 403);
  }
  const body = await fs.readFile(abs, 'utf8');
  return c.body(body);
});

api.get('/csv', async (c) => {
  const which = c.req.query('which') ?? 'tasks';
  const map: Record<string, string> = {
    tasks: paths.outbox.tasks,
    kanban: paths.outbox.kanban,
    context: paths.outbox.context,
    feeds: paths.outbox.feedSummaries,
  };
  const file = map[which];
  if (!file) return c.json({ error: 'unknown csv' }, 400);
  try {
    const rows = await readAll(file);
    return c.json({ rows });
  } catch (err) {
    return c.json({ error: (err as Error).message, rows: [] }, 200);
  }
});

api.get('/runs', async (c) => {
  try {
    const rows = await readAll(path.join(paths.outbox.runs, 'index.csv'));
    return c.json({ rows });
  } catch {
    return c.json({ rows: [] });
  }
});

api.post('/runs/track', async (c) => {
  const body = (await c.req.json()) as { workflow: string; status: string; notes?: string };
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  await writeRunLog({
    runId,
    workflow: body.workflow,
    startedAt,
    status: 'completed',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    notes: body.notes,
  });
  await appendRunIndex({
    runId,
    workflow: body.workflow,
    startedAt,
    endedAt: new Date().toISOString(),
    status: 'completed',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    notes: body.notes,
  });
  return c.json({ runId });
});
