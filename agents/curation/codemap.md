# agents/curation/

## Responsibility

The **Curation** sub-agent performs daily news aggregation from a configurable list of RSS feeds. It fetches items published within the last 24 hours, scores each against a 4-question rubric, applies a tier-based confirmation pass on top items, and produces both a CSV row-per-item log and an HTML digest. This is the primary "daily news" workflow for the chief-of-staff system.

## Design

- **9-step pipeline with parallelism**: The pipeline proceeds as load feeds → fetch (parallel per feed) → filter recency → chunk → score chunks (parallel) → merge sort → optional tier confirmation → append CSV → build HTML. Parallelism at the fetch and scoring stages enables throughput on large feed sets.
- **Rubric-driven scoring**: Each item is scored via `anthropic/claude-3-5-haiku-latest` using a 4-question rubric: "So what?" (impact magnitude), "Who cares?" (blast radius), "What now?" (strategic posture), "Shelf life?" (relevance duration). Scores are 0-10 and map to HIGH/MEDIUM/LOW tiers.
- **Tier confirmation pass**: When `tierConfirm: true` (default), the top 5 scored items are re-evaluated by a second LLM call to confirm relevance — a two-stage scoring design that reduces false positives.
- **19-column output schema**: Each scored item produces a row with Title, Score, Action, Category, Summary, all 4 rubric answers, prompts referenced, evidence metadata, source links, and timestamp — written to `outbox/feed_summaries.csv`.
- **Chunked processing**: Items are grouped into batches of `chunkSize` (default 10) for LLM scoring, preventing context window overflow and enabling per-chunk retry/error isolation.
- **Graceful degradation on partial failures**: A bad feed is skipped with a log warning. A bad chunk is skipped. LLM timeouts on a chunk trigger one retry then skip. CSV append errors are the only hard failure.
- **Audience-specific targeting**: The scoring rubric and digest output are tuned for the primary audience (Richard Achée, C-Level AI executive), as defined in `system.md`.

## Flow

1. **Inputs**: `feedList: string[]`, `chunkSize: number`, `timeWindowHours: number`, `tierConfirm: boolean`.
2. **Load feeds**: `load_feeds(path)` returns a deduplicated list of feed URLs.
3. **Fetch feeds**: `fetch_feed(url, cap)` for each feed in parallel; items capped per feed.
4. **Filter recency**: `filter_recent(items, hours)` retains items within the time window.
5. **Chunk**: `chunk(items, size)` partitions into batches.
6. **Score chunks**: `score_chunk(items)` via `anthropic/claude-3-5-haiku-latest` — each chunk scored independently in parallel.
7. **Merge**: `merge_scores(chunks)` flattens and sorts descending by `Score`.
8. **Tier confirm** (conditional): If `tierConfirm=true`, run `tier_confirm(topN)` on top 5 items via a second LLM pass.
9. **Output**: `append_csv(rows, path)` writes to `outbox/feed_summaries.csv`; `build_digest_html(rows, path)` renders `outbox/feed_digest.html`.

## Integration

- **`types/curation.ts`** — Consumes `FeedItem`, `ScoredItem`, `CurationConfig`, `Action`, `ShelfLife` types throughout the pipeline.
- **`agents/curation/_shared/chunker.ts`** — Provides `chunk()`, `dedupe()`, `filterRecent()`, and `mergeScores()` — the pure utility functions that implement steps 4-6 of the pipeline.
- **`agents/_shared/tools.ts`** — Registers its tool set via `registerTools('curation', ...)`. The tool registry maps tool names to handler functions called at each pipeline step.
- **`agents/_shared/strings.ts`** — Uses shared string utilities for output filename generation.
- **`agents/orchestrator/`** — The orchestrator dispatches to curation when `router.ts` matches keywords `(daily|news|today|curation|24h)`. It also serves as the default fallback workflow when no other sub-agent matches (conversational mode via `hint: 'no-match'`).
- **`outbox/`** — Writes `feed_summaries.csv` and `feed_digest.html` for downstream consumption.
