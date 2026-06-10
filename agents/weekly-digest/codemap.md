# agents/weekly-digest/

## Responsibility

The **Weekly Digest** sub-agent produces a comprehensive enterprise-tech and research digest covering ALL items from a configured list of 13 industry feeds without any temporal filter. It compiles a single markdown document (`outbox/weekly_digest.md`) containing an executive summary, categorized industry analytics with strategic ratings, and recommended actions — targeted at enterprise consultants, ML engineers, and architects.

## Design

- **Simplest pipeline in the system**: Load feeds → fetch (up to 5 per feed, parallel) → flatten (no time filter) → LLM compile → write markdown. Only 3 tools and 5 steps, compared to 9-11 for other sub-agents.
- **No temporal filter**: Unlike curation's 24-hour window, weekly-digest processes all items regardless of publish date. The `system.md` explicitly states "No time filter applied" and "Filter State: No Temporal Filters" is included in the output document header.
- **3-question rubric (simplified vs curation)**: Uses a 3-question scoring rubric (vs curation's 4-question): "So what?" (technical transition), "Who cares?" (industries/roles), "What now?" (tactical next step). The "Shelf life?" question is omitted. Scoring tiers are READ (8-10), MAYBE (4-7), SKIP (0-3).
- **Single-LLM pipeline**: Everything is compiled in one `openai/gpt-4o` call. No per-chunk scoring, no tier confirmation pass — the LLM receives the full item list and the 3-question rubric in a single prompt.
- **Fixed feed set**: Defaults to 13 enterprise feeds from `test_records/industry_feeds.json`. Feed list is loaded via `load_feeds(path)` with deduplication.
- **Structured markdown output format**: Enforced output template with Executive Summary, Industry Analytics & Insights (categorized with Source Link, Strategic Rating, and rubric answers), and Recommended Actions & Operational Next Steps.
- **Output quality gates**: If the compiled markdown is shorter than 100 characters, it is treated as a failure and re-prompted once.

## Flow

1. **Inputs**: `feedList: string[]` (defaults to `test_records/industry_feeds.json`).
2. **Load feeds**: `load_feeds(path)` returns a list of feed URLs (deduplicated; 13 enterprise feeds).
3. **Fetch feeds**: `fetch_feed(url, cap)` fetches up to 5 items per feed in parallel.
4. **Flatten**: Merge all feed results into a single flat list. No time-based filtering.
5. **Compile digest**: `compile_markdown_digest(items)` via `openai/gpt-4o` — the LLM receives the full item list and the 3-question rubric, and produces a structured markdown document.
6. **Write output**: Save the compiled markdown to `outbox/weekly_digest.md`. If output <100 chars, retry once.
7. **(Implicit) Error handling**: Bad feeds are skipped with a log warning. LLM timeout triggers one retry, then a minimal digest noting partial failure is written.

## Integration

- **`types/curation.ts`** — Consumes `FeedItem` type (shared with curation sub-agent) for feed data structures.
- **`agents/_shared/tools.ts`** — Registers its 3 tools via `registerTools('weekly-digest', ...)`. The tool registry maps `load_feeds`, `fetch_feed`, and `compile_markdown_digest` to their handler implementations.
- **`agents/_shared/strings.ts`** — May use shared string utilities for any filename generation if needed.
- **`agents/orchestrator/`** — The orchestrator dispatches to weekly-digest when `router.ts` matches keywords `(weekly|this week|research digest|enterprise)`.
- **`test_records/industry_feeds.json`** — Default feed configuration consumed during feed loading.
- **`outbox/weekly_digest.md`** — Single output artifact; the complete digest rendered as markdown.
- **`outbox/runs/`** — Writes run log and cost accounting records via implicit tool calls.
