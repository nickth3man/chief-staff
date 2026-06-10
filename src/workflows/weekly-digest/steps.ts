import { promises as fs } from 'node:fs';
import path from 'node:path';
import { paths } from '@config/paths';
import { fetchAllFeeds } from '../curation/fetch';
import { chatCompletion } from '../../_shared/llm';
import { writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger } from '../../_shared/runLog';
import type { LiveRunLogger } from '../../_shared/liveLog';
import { dedupe } from '../../../agents/curation/_shared/chunker';
import { MODELS, WORKFLOW_KNOBS } from '@config/workflows';

const DIGEST_SYSTEM = `You are a senior enterprise-tech analyst producing a weekly digest. Given a flat list of recent articles, produce a single Markdown document with this exact structure:

# Weekly Curation Digest
**Date:** <today>
**Target Audience:** Enterprise Consultants, ML Engineers, and Architects
**Model Used:** openai/gpt-4o
**Filter State:** No Temporal Filters

## 1. Executive Summary
(3-5 sentences framing the week's themes)

## 2. Industry Analytics & Insights
(For each article worth surfacing, output a section like:)
### [Category] Source - Title
- **Source Link:** <absolute URL>
- **Strategic Rating:** <X.X>/10 (READ|MAYBE|SKIP)
#### Strategic Assessment for <Source>
1. **So what?** ...
2. **Who cares?** ...
3. **What now?** ...

## 3. Recommended Actions & Operational Next Steps
(3-5 bullets, concrete)

Score each article 0-10. READ is 8-10, MAYBE is 4-7, SKIP is 0-3. Skip articles with score < 4. Output ONLY Markdown, no preamble.`;

const DIGEST_USER = (items: { title: string; url: string; description: string }[]) =>
  `Here are ${items.length} recent articles. Produce the weekly digest Markdown.\n\n` +
  items.map((it, i) => `[${i + 1}] ${it.title}\n${it.url}\n${it.description.slice(0, 600)}`).join('\n\n');

export interface WeeklyDigestOptions {
  configPath: string;
  /** Optional caller-supplied run id (e.g. from the orchestrator) for log correlation. */
  runId?: string;
}

export async function runWeeklyDigest(opts: WeeklyDigestOptions): Promise<string> {
  const runId = opts.runId ?? newRunId();
  const startedAt = new Date().toISOString();
  const live: LiveRunLogger = createLiveLogger(runId, 'weekly-digest');
  await live.open();
  await writeRunLog({
    runId,
    workflow: 'weekly-digest',
    startedAt,
    status: 'running',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  });

  try {
    const cfg = JSON.parse(await fs.readFile(opts.configPath, 'utf8')) as { feeds: string[] };
    const feeds = dedupe(cfg.feeds);
    const items = await fetchAllFeeds(feeds, WORKFLOW_KNOBS.wf3.fetchCapPerFeed);
    console.log(`[wf3] fetched ${items.length} items`);
    await live.event('feeds-fetched', { items: items.length });

    const llmItems = items.map((it) => ({ title: it.title, url: it.url, description: it.description }));
    await live.event('step-1-digest-llm', { model: MODELS.wf3.llm, articles: llmItems.length });
    console.log(`[wf3] calling ${MODELS.wf3.llm} with ${llmItems.length} articles (deadline 180s)...`);
    const t0 = Date.now();
    let result;
    try {
      result = await chatCompletion(
        MODELS.wf3.llm,
        [
          { role: 'system', content: DIGEST_SYSTEM },
          { role: 'user', content: DIGEST_USER(llmItems) },
        ],
        { deadlineMs: 180_000 }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const elapsedMs = Date.now() - t0;
      console.error(`[wf3] LLM call failed after ${elapsedMs}ms: ${errMsg}`);
      // Record the failed llm-call in the live log so the operator sees
      // exactly which step blew up, even before the outer catch runs.
      await live.llmCall(
        MODELS.wf3.llm,
        { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
        elapsedMs,
        { error: errMsg }
      );
      throw err;
    }
    await live.llmCall(MODELS.wf3.llm, result, Date.now() - t0);
    console.log(
      `[wf3] digest received: ${result.tokensOut} tokens (in ${result.tokensIn}), $${result.costUsd.toFixed(6)}`
    );

    let markdown = result.content.trim();
    if (markdown.length < 100) {
      markdown = `# Weekly Curation Digest\n\n_Digest generation produced insufficient output. See run ${runId}._`;
    }

    const today = new Date().toISOString().slice(0, 10);
    markdown = markdown.replace(/^\*\*Date:\*\*.*$/m, `**Date:** ${today}`);

    await fs.mkdir(path.dirname(paths.outbox.weeklyDigest), { recursive: true });
    await fs.writeFile(paths.outbox.weeklyDigest, markdown, 'utf8');
    await live.event('digest-written', { path: paths.outbox.weeklyDigest, length: markdown.length });

    const costEstimate = result.costUsd;
    const endedAt = new Date().toISOString();
    await writeRunLog({
      runId,
      workflow: 'weekly-digest',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: costEstimate,
      notes: `articles=${items.length}; mdLength=${markdown.length}`,
    });
    await appendRunIndex({
      runId,
      workflow: 'weekly-digest',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: costEstimate,
    });
    await appendCost({
      date: new Date().toISOString().slice(0, 10),
      workflow: 'weekly-digest',
      model: MODELS.wf3.llm,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: costEstimate,
    });

    await live.complete({
      articles: items.length,
      mdLength: markdown.length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: costEstimate,
    });

    return markdown;
  } catch (err) {
    await writeRunLog({
      runId,
      workflow: 'weekly-digest',
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
