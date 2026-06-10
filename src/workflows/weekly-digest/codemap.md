# src/workflows/weekly-digest/

## Responsibility
Weekly intelligence digest generation (WF3). Fetches articles from a configured set of industry RSS feeds, feeds the full batch into a single LLM call that scores, categorises, and synthesises a structured Markdown digest document. Unlike the curation workflow (WF2), which scores individual articles chunk-by-chunk into structured rows, WF3 produces a single narrative Markdown document with an executive summary, per-article strategic assessments, and recommended actions.

## Design
- **2-module architecture**: `run.ts` (CLI entry), `steps.ts` (orchestration + prompt templates). Notably leaner than other workflows because it delegates feed fetching to `../curation/fetch` and deduplication to `../../../agents/curation/_shared/chunker`, avoiding code duplication.
- **Single-pass LLM generation**: The entire article set is sent in one `chatCompletion()` call to `MODELS.wf3.llm` with a 180s deadline. The `DIGEST_SYSTEM` prompt specifies an exact Markdown structure (Executive Summary, Industry Analytics & Insights with per-article strategic ratings, Recommended Actions). The LLM is instructed to skip articles scoring below 4/10.
- **Output-only Markdown**: Unlike WF2 which produces structured CSV + HTML, WF3 writes a single Markdown file to `paths.outbox.weeklyDigest`. The content is designed for direct consumption (email, internal wiki, or further rendering).
- **Content guard**: If the LLM returns fewer than 100 characters of output, a fallback placeholder Markdown is written with the run ID for debugging.
- **Date injection**: After generation, the `**Date:**` line in the output Markdown is regex-replaced with the current date, ensuring the digest is always timestamped correctly regardless of LLM behaviour.
- **Deadline with detailed error logging**: The single LLM call has a 180s deadline. On failure, the elapsed time and error message are recorded in the live log before rethrowing, giving operators precise diagnostics.

## Flow
1. `run.ts` parses `--config <path>` (required), invokes `runWeeklyDigest()`.
2. `runWeeklyDigest()` generates a run ID, opens live logger, writes `running` run log.
3. Config JSON is read and parsed; feed URLs are deduplicated.
4. `fetchAllFeeds(feeds, WORKFLOW_KNOBS.wf3.fetchCapPerFeed)` is called (reused from `../curation/fetch`), returning a flat array of `FeedItem[]`.
5. Articles are mapped to `{ title, url, description }` for the LLM prompt.
6. `chatCompletion(MODELS.wf3.llm, [DIGEST_SYSTEM, DIGEST_USER(items)], { deadlineMs: 180_000 })` is called. The system prompt defines the Markdown structure; the user prompt lists all articles with truncated descriptions (600 chars each).
7. On LLM success, token/cost data is logged immediately.
8. The result is trimmed; if under 100 characters, a fallback placeholder is substituted.
9. The `**Date:**` line is overwritten with the current date via regex replacement.
10. The final Markdown is written to `paths.outbox.weeklyDigest` (directory created recursively if needed).
11. Cost, run log, run index, and live logger are finalised with token/cost data from the LLM response.
12. On failure, the run log is set to `failed`, live logger records the error, and the error is rethrown.

## Integration
- **Consumers**: CLI invocations (likely weekly cron). The `runId` parameter in `WeeklyDigestOptions` supports future orchestration integration.
- **Dependencies**: `@config/paths` (outbox path for weeklyDigest), `@config/workflows` (MODELS.wf3.llm, WORKFLOW_KNOBS.wf3).
- **Shared modules**: `../../_shared/llm` (chatCompletion), `../../_shared/runLog` (writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger), `../../_shared/liveLog` (LiveRunLogger).
- **Cross-workflow reuse**: `fetchAllFeeds` from `../curation/fetch`, `dedupe` from `../../../agents/curation/_shared/chunker`.
- **Outputs**: Markdown digest document at `paths.outbox.weeklyDigest`.
