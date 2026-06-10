# agents/curation/_shared/

## Responsibility

Provides pure utility functions used exclusively by the curation sub-agent's data pipeline. Contains the chunking, deduplication, recency filtering, and score-merging logic that transforms raw `FeedItem[]` arrays through the curation processing stages. These functions are extracted into a dedicated shared module to isolate testable business logic from the LLM-driven orchestration in the curation system prompt and tool handlers.

## Design

- **Pure functions, zero side effects**: All four exported functions — `chunk`, `dedupe`, `filterRecent`, `mergeScores` — are stateless pure functions with no I/O, no dependencies on the runtime environment, and no external imports beyond the `FeedItem` type. This makes them trivially unit-testable.
- **Generic chunk utility**: `chunk<T>(items: T[], size: number): T[][]` is a generic array-partitioning function that works on any type (not just `FeedItem`). Validates that `size > 0` and returns an empty array for empty input.
- **Set-based deduplication**: `dedupe<T>(items: T[]): T[]` uses `Array.from(new Set(items))` for O(n) reference-based deduplication. Operates on generic arrays.
- **Timestamp-based recency filter**: `filterRecent(items: FeedItem[], hours: number, now: Date)` parses `pubDate` strings via `Date.parse()`, computes a UTC millisecond cutoff, and filters items published within the window. Items with unparseable dates (`NaN`) are excluded. An optional `now` parameter enables deterministic testing.
- **Score-descending merge**: `mergeScores<T extends { Score: number }>(chunks: T[][]): T[]` flattens a 2D array of scored items and sorts them descending by `Score`. The type constraint `{ Score: number }` ensures type safety without coupling to the full `ScoredItem` interface.

## Flow

These functions are called sequentially by the curation sub-agent's pipeline, driven by its tool handlers:

1. `dedupe` — Applied to the feed URL list after loading from config, ensuring no duplicate feeds.
2. `filterRecent` — Applied to merged `FeedItem[]` from all feed fetches to restrict to the configured time window.
3. `chunk` — Applied to the filtered items to partition into scoring batches of `chunkSize`.
4. `mergeScores` — Applied after all chunk scores are returned from the LLM, flattening and sorting for downstream tier confirmation and output generation.

## Integration

- **`types/curation.ts`** — Provides the `FeedItem` and `ScoredItem` types consumed by `filterRecent` and `mergeScores` respectively. The `FeedItem.pubDate` field is parsed for recency filtering.
- **`agents/curation/system.md`** — The curation system prompt references the chunking, filtering, and merging steps (steps 3-6 in the step sequence) that these functions implement at the code level.
- **Curation tool handlers** — The `filter_recent`, `chunk`, and `merge_scores` tool definitions in the curation sub-agent call these shared functions internally.
- **Tests** — These pure functions are isolated from LLM calls and I/O, making them ideal candidates for unit tests without mocking.
