# src/workflows/curation/

## Responsibility
Daily news/article curation pipeline (WF2). Fetches articles from a configured set of RSS feeds, deduplicates, filters to a configurable recency window, chunks them for batch LLM scoring, and produces two artifacts: a CSV of scored items (with rubric fields: Score, Category, Action, Evidence Type, etc.) and an HTML digest page with colour-coded cards (high-score green, medium-score yellow). This is the "intake" workflow for external intelligence.

## Design
- **4-module architecture**: `run.ts` (CLI entry), `steps.ts` (orchestration + HTML renderer), `fetch.ts` (RSS feed fetcher), `score.ts` (LLM-based article scoring).
- **Batch scoring with chunking**: Articles are grouped into configurable-size chunks (`WORKFLOW_KNOBS.wf2.chunkSize`) and scored in parallel via `Promise.all`. Each chunk invokes `chatCompletion()` with `responseFormat: 'json'` to produce structured scored items. Scoring is governed by a 4-question rubric: "So what?" (impact magnitude), "Who cares?" (blast radius), "What now?" (strategic posture), "Shelf life?" (relevance duration).
- **Scoring result cleaning**: The `scoreChunk` function handles LLM variability — it coerces `null` to `undefined` for Zod compatibility (some models emit explicit `null`), filters out items missing a `Title` field (truncated/garbage responses), and attaches a `Timestamp` to each item.
- **Dual output strategy**: Structured CSV (`feed_summaries.csv`) for programmatic consumption, and an HTML digest page (`feed_digest.html`) for human review. The HTML is organised by score tier (high ≥ 8, medium 4–7, low/skip < 4 are excluded from the HTML).
- **Resilient feed fetching**: `fetchAllFeeds` uses `Promise.allSettled` so individual feed failures do not abort the entire run. Each failed feed is logged as a warning. The `rss-parser` library is configured with a 10s timeout and a custom User-Agent header.
- **Configuration-driven**: Feeds list is provided as a JSON file via `--config <feeds.json>`. All tunables (chunk size, fetch cap per feed, time window, tier confirmation) are in `WORKFLOW_KNOBS.wf2`.

## Flow
1. `run.ts` parses `--config <path>` (required), invokes `runCuration()`.
2. `runCuration()` generates a run ID, opens live logger, writes initial `running` run log.
3. Feed config JSON is read and parsed; URLs are deduplicated.
4. `fetchAllFeeds(feeds, cap)` fetches from all feeds concurrently via `Promise.allSettled`, returning a flat array of `FeedItem[]`.
5. `filterRecent(items, windowHours)` discards items older than the configured time window.
6. `chunk(items, size)` groups recent items into workload-sized batches.
7. Each chunk is scored in parallel: `scoreChunk(chunk, { logger, phase })` sends a system prompt (`SCORE_SYSTEM`) and user prompt (`SCORE_USER`) to `chatCompletion(MODELS.wf2.llm, ..., { responseFormat: 'json' })`.
8. The per-chunk scored arrays are merged via `mergeScores()`.
9. Scored items are written as rows to `paths.outbox.feedSummaries` CSV via `appendRow()`.
10. `renderDigestHtml()` generates a standalone HTML page: items above score 8 render as green-bordered cards, items 4–7 as yellow-bordered cards. Cards display Title (linked), Score badge, Category, Action, Shelf life, Summary, and the 3-question rubric.
11. Cost is estimated as `scored.length * 0.001` (flat approximation).
12. Run log is finalised to `completed`, run index and cost are appended, live logger is completed.
13. On failure, run log is set to `failed` and error is rethrown.

## Integration
- **Consumers**: CLI invocations (likely cron-driven daily). The `runId` parameter in `CurationRunOptions` supports future orchestration integration.
- **Dependencies**: `@config/paths` (outbox paths for feedSummaries, feedDigest), `@config/workflows` (MODELS.wf2.llm, WORKFLOW_KNOBS.wf2), `@apptypes/curation` (FeedItem, ScoredItem), `@schemas/curation` (ScoredItemsSchema).
- **Shared modules**: `../../_shared/llm` (chatCompletion), `../../_shared/csv` (appendRow), `../../_shared/runLog` (writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger), `../../_shared/liveLog` (LiveRunLogger).
- **Agent-level helpers**: `../../../agents/curation/_shared/chunker` (chunk, dedupe, filterRecent, mergeScores).
- **External libraries**: `rss-parser` (RSS/Atom feed parsing).
- **Cross-workflow reuse**: `fetch.ts` is also imported by `../weekly-digest/steps.ts`.
- **Outputs**: `feed_summaries.csv` (structured scored items), `feed_digest.html` (human-readable digest).
