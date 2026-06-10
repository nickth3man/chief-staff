import { promises as fs } from 'node:fs';
import path from 'node:path';
import { paths } from '@config/paths';
import { fetchAllFeeds } from './fetch';
import { scoreChunk } from './score';
import { chunk, dedupe, filterRecent, mergeScores } from '../../../agents/curation/_shared/chunker';
import { appendRow } from '../../_shared/csv';
import { writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger } from '../../_shared/runLog';
import type { LiveRunLogger } from '../../_shared/liveLog';
import { WORKFLOW_KNOBS, MODELS } from '@config/workflows';
import type { FeedItem, ScoredItem } from '@apptypes/curation';

export interface CurationRunOptions {
  configPath: string;
  /** Optional caller-supplied run id (e.g. from the orchestrator) for log correlation. */
  runId?: string;
}

const FEED_SUMMARIES_HEADER = [
  'Title',
  'Score',
  'Action',
  'Category',
  'Summary',
  'So what?',
  'Who cares?',
  'What now?',
  'Prompts Referenced',
  'Original Prompts',
  'Evidence Type',
  'Has Numbers?',
  'Has Real Use Case?',
  'Has Clear Action?',
  'Source Link',
  'Secondary Source',
  'Notes',
  'Timestamp',
  'Shelf life?',
];

export async function runCuration(opts: CurationRunOptions): Promise<ScoredItem[]> {
  const runId = opts.runId ?? newRunId();
  const startedAt = new Date().toISOString();
  const live: LiveRunLogger = createLiveLogger(runId, 'curation');
  await live.open();
  await writeRunLog({
    runId,
    workflow: 'curation',
    startedAt,
    status: 'running',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  });

  try {
    const configRaw = await fs.readFile(opts.configPath, 'utf8');
    const config = JSON.parse(configRaw) as { feeds: string[] };
    const feeds = dedupe(config.feeds);
    console.log(`[curation] ${feeds.length} unique feeds`);
    await live.event('config-loaded', { feeds: feeds.length });

    const allItems = await fetchAllFeeds(feeds, WORKFLOW_KNOBS.wf2.fetchCapPerFeed);
    console.log(`[curation] fetched ${allItems.length} items`);
    await live.event('feeds-fetched', { items: allItems.length });

    const recent = filterRecent(allItems, WORKFLOW_KNOBS.wf2.timeWindowHours);
    console.log(`[curation] ${recent.length} items in last ${WORKFLOW_KNOBS.wf2.timeWindowHours}h`);
    await live.event('feeds-filtered', {
      recent: recent.length,
      windowHours: WORKFLOW_KNOBS.wf2.timeWindowHours,
    });

    const chunks = chunk(recent, WORKFLOW_KNOBS.wf2.chunkSize);
    console.log(`[curation] ${chunks.length} chunks of size ≤${WORKFLOW_KNOBS.wf2.chunkSize}`);
    await live.event('chunks-built', {
      chunks: chunks.length,
      chunkSize: WORKFLOW_KNOBS.wf2.chunkSize,
    });

    const scoredChunks = await Promise.all(
      chunks.map((c, i) => scoreChunk(c, { logger: live, phase: `chunk-${i + 1}` }))
    );
    const scored = mergeScores(scoredChunks);
    console.log(`[curation] scored ${scored.length} items`);
    await live.event('scored', { items: scored.length });

    await fs.mkdir(path.dirname(paths.outbox.feedSummaries), { recursive: true });
    for (const row of scored) {
      await appendRow(paths.outbox.feedSummaries, row as unknown as Record<string, unknown>, FEED_SUMMARIES_HEADER);
    }
    await live.event('feed-summaries-written', {
      path: paths.outbox.feedSummaries,
      rows: scored.length,
    });

    await renderDigestHtml(scored);
    await live.event('digest-rendered', { path: paths.outbox.feedDigest });

    const costEstimate = scored.length * 0.001;
    const endedAt = new Date().toISOString();
    await writeRunLog({
      runId,
      workflow: 'curation',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
      notes: `itemsScored=${scored.length}; chunks=${chunks.length}`,
    });
    await appendRunIndex({
      runId,
      workflow: 'curation',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
    });
    await appendCost({
      date: new Date().toISOString().slice(0, 10),
      workflow: 'curation',
      model: MODELS.wf2.llm,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
    });

    await live.complete({
      itemsScored: scored.length,
      chunks: chunks.length,
      costUsd: costEstimate,
    });

    return scored;
  } catch (err) {
    await writeRunLog({
      runId,
      workflow: 'curation',
      startedAt,
      endedAt: new Date().toISOString(),
      status: 'failed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      notes: err instanceof Error ? err.message : String(err),
    });
    await live.fail(err);
    throw err;
  }
}

async function renderDigestHtml(items: ScoredItem[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const high = items.filter((i) => i.Score >= 8);
  const med = items.filter((i) => i.Score >= 4 && i.Score < 8);
  const card = (it: ScoredItem) => `
    <div class="card ${it.Score >= 8 ? 'high-score' : 'med-score'}">
      <div class="score-badge">SCORE: ${it.Score.toFixed(1)} / 10</div>
      <h2 class="title">
        <a href="${it['Source Link'] ?? '#'}" target="_blank">${escapeHtml(it.Title)}</a>
      </h2>
      <div class="meta">Category: ${escapeHtml(it.Category)} | Action: ${it.Action} | Shelf life: ${it['Shelf life?']}</div>
      <p><strong>Summary:</strong> ${escapeHtml(it.Summary)}</p>
      <div class="rubric">
        <div><h4>So What?</h4>${escapeHtml(it['So what?'] ?? '')}</div>
        <div><h4>Who Cares?</h4>${escapeHtml(it['Who cares?'] ?? '')}</div>
        <div><h4>What Now?</h4>${escapeHtml(it['What now?'] ?? '')}</div>
      </div>
    </div>`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Daily Digest</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;color:#333;max-width:800px;margin:0 auto;padding:20px;background:#f9f9f9}
.header{border-bottom:2px solid #0066cc;padding-bottom:20px;margin-bottom:30px}
.header h1{margin:0 0 10px 0;color:#0066cc}
.meta{font-size:0.9em;color:#666}
.card{background:#fff;border-radius:8px;padding:25px;margin-bottom:25px;box-shadow:0 2px 4px rgba(0,0,0,.05);border-left:5px solid #ccc}
.card.high-score{border-left-color:#28a745}.card.med-score{border-left-color:#ffc107}
.score-badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:.85em;font-weight:bold;color:#fff;float:right}
.high-score .score-badge{background:#28a745}.med-score .score-badge{background:#ffc107;color:#333}
.title{font-size:1.3em;margin-top:0;margin-bottom:10px}.title a{color:#111;text-decoration:none}.title a:hover{text-decoration:underline;color:#0066cc}
.rubric{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-top:20px;border-top:1px solid #eee;padding-top:15px;font-size:.9em}
.rubric-item h4{margin:0 0 5px 0;color:#555}
.footer{text-align:center;margin-top:50px;font-size:.8em;color:#888;border-top:1px solid #ddd;padding-top:20px}
</style></head>
<body>
<div class="header">
  <h1>Daily News Curation Digest</h1>
  <div class="meta">
    <strong>Generated:</strong> ${today} &nbsp;|&nbsp;
    <strong>Articles:</strong> ${items.length} (${high.length} high, ${med.length} medium)
  </div>
</div>
${high.map(card).join('\n')}
${med.map(card).join('\n')}
<div class="footer">Generated by Chief of Staff Local Assistant. &copy; 2026.</div>
</body></html>`;
  await fs.writeFile(paths.outbox.feedDigest, html, 'utf8');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
