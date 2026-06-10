# Workflow 2: Curate Newsletters (Local Open-Source Edition)

## Overview

**Purpose:** Daily automated local AI-news curation using open-source tools and local files. The pipeline loads a configured list of RSS feed sources from a local JSON file, fetches recent items from each in parallel using `rss-parser` (Node.js), flattens the results, filters to a 24-hour window, chunks the items to avoid LLM context overflow, scores each chunk using a 4-question business-relevance rubric via OpenRouter, merges chunk scores, appends rows to a local CSV database, and stages a compiled HTML digest in the local outbox.

**Source Code Reference:** Managed locally in your code project, replacing the previous relay.app cloud workflow `Curate Newsletters`.

**Step count:** 12 (chunks added: 4a, 4b, 4c; merge and tier-confirmation added: 7a, 7b)

---

## Local Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Local CLI Task / Cron | Trigger utility executing CLI scripts daily |
| Feed List Ingester | Resource reader pulling feed URL arrays from a local configuration file |
| Parallel/Asynchronous Scraper | Threaded or `Promise.all`-based asynchronous HTTP feed getters |
| Open-Source RSS Parser | Local Node parser (`rss-parser`) traversing raw XML |
| State Aggregator (Flatten) | Standard collection flattener combining item arrays in-memory |
| DateTime Window Filter | Luxon time filter pruning entries older than 24 hours |
| Chunker | Splits `recentItems` into LLM-sized batches (default 10) |
| OpenRouter LLM Client | Unified gateway interface for scoring items with structured JSON output |
| Score Merger | Aggregates chunk scores into a single sorted list |
| Tier Confirmer | Optional second pass on the top-N items to refine tiering |
| Local CSV Appender | Appends standard RFC-compliant CSV records per scored article |
| Local File Builder | Outputs structured HTML/Markdown digests to local outbox channels |

---

## Trigger

### Step 1: Time-Based Cron Engine

- **Step type:** Local Cron scheduling trigger / CLI Command execution
- **Trigger condition:** Scheduled system execute of daily scraper script
- **Concrete schedule (mock equivalent):** Executed regularly (e.g. daily at 8:00 AM EST)
- **Output:** `trigger` (no payload)

---

## Data Source

### Step 2: Feed Configuration Source

- **Step type:** Local JSON Configuration Loader
- **Concrete source:** Local workspace file: `test_records/feeds.json`
- **Data shape:** Array of feed URL strings under a "feeds" key
- **Cardinality:** 20 unique feed URLs (post-dedup; see Pipeline Configuration Notes)
- **De-duplication behavior:** Explicit programmatic deduplication is run on load before scraping
- **Output:** `feedList` (deduplicated array of URL strings)

**Source feed list (20 URLs, after dedup of the original 21 with `https://aiin5.substack.com/feed` as the duplicate):**

1. `https://natesnewsletter.substack.com/feed`
2. `https://ruben.substack.com/feed`
3. `https://www.luizasnewsletter.com/feed`
4. `https://abrinegar.substack.com/feed`
5. `https://www.2ndorderthinkers.com/feed`
6. `https://theaibreak.substack.com/feed`
7. `https://www.normaltech.ai/feed`
8. `https://www.ai-supremacy.com/feed`
9. `https://aiguide.substack.com/feed`
10. `https://grahamlovelace.substack.com/feed`
11. `https://thecreatorsai.com/feed`
12. `https://www.futureofbeinghuman.com/feed`
13. `https://www.interconnects.ai/feed`
14. `https://charliehills.substack.com/feed`
15. `https://www.oneusefulthing.org/feed`
16. `https://promptsdaily.substack.com/feed`
17. `https://newsletter.rootsofprogress.org/feed`
18. `https://theslowai.substack.com/feed`
19. `https://www.strangeloopcanon.com/feed`
20. `https://www.understandingai.org/feed`

> The duplicate removal is enforced at runtime via `Array.from(new Set(feedList))`; the JSON file may keep duplicates for editorial convenience.

---

## Map Phase (Parallel Loops)

### Step 3: Iterator Loop Node

- **Step type:** Asynchronous/Parallel Loop Map
- **Iterates over:** Each feed in `test_records/feeds.json` (deduplicated)
- **Per-iteration payload:** current feed URL string
- **Execution:** Spawns asynchronous worker fetches for Step 4

### Step 4: Open-Source RSS Scraper Service

- **Step type:** Local Parser (utilizing open-source `rss-parser` in Node.js)
- **Input:** feed URL string
- **Fetch behavior:**
  - Execute HTTP GET on the target URL
  - Parse the XML document payload using the local parser library
  - Cap results at the top **5 items** per feed
- **Failure strategy:** Continues without crashing (safely catches and skips dead/offline feed URLs)
- **Output:** `rssItems` array (≤5 items per feed) containing:
  - `guid` (or unique article ID)
  - `title`
  - `article description` (or raw body summary)
  - `pubDate` (ISO format string)
  - `author`
  - `thumbnail`
  - `url`

---

## Reduce & Filter Phase

### Step 5: State Aggregator

- **Step type:** In-Memory Array Flat Concatenation
- **Operation:** Flattens array-of-arrays of crawled `rssItems` into a single unified list
- **Output:** `allItems` (single flat list of item objects across all feeds)

### Step 6: Temporal Range Filter

- **Step type:** DateTime Window Filter (utilizing `luxon` for timezone-aware datetime lookups)
- **Clock source:** Current system clock
- **Window:** Keep only articles where `pubDate` is within `now - 24 hours`
- **Exclusion rule:** Drop any feed items lacking a valid or parseable publication date
- **Output:** `recentItems` (filtered subset matching date criteria)

---

## Chunking Phase

### Step 7: Item Chunker

- **Step type:** Array Batcher
- **Input:** `recentItems`
- **Chunk size:** 10 items per chunk (configurable via `config/workflows.ts:WF2_CHUNK_SIZE`)
- **Behavior:** If `recentItems.length <= chunkSize`, produces a single chunk. Otherwise splits into N chunks of `chunkSize` items each, plus a remainder chunk.
- **Output:** `chunks` (array of item-batches)

---

## AI Processing (per chunk)

### Step 7a: Per-Chunk Structured Extraction LLM

- **Step type:** OpenRouter LLM Client (Structured JSON Extraction with Schema)
- **Model ID:** `anthropic/claude-3-5-haiku-latest`
- **Format renderer:** Structured JSON list (response_format mode enforcing schema)
- **Input:** One chunk of `recentItems` (≤10 items)
- **Scoring rubric (4-question filter):**
  1. **So what?** — Magnitude of impact (incremental optimization, net-new capability, paradigm shift)
  2. **Who cares?** — Blast radius (specific technical roles, single vertical, universally applicable to executives)
  3. **What now?** — Strategic posture (monitor, pilot, fully integrate)
  4. **Shelf life?** — Relevance duration (weeks, months, years)
- **Scoring tiers:**
  - **HIGH (8-10):** Can answer all 3 questions with specifics (new features/tools/APIs, pricing changes, security issues, real results with numbers)
  - **MEDIUM (4-7):** Can answer 2 questions (tool updates, implementation learnings, industry shifts with data)
  - **LOW (0-3):** Cannot answer questions or vague (speculation, opinion without evidence, no clear business impact)
- **Audience targeting:** Scored for **Richard Achée** with focus on Responsible AI for Leaders, C-Level AI, Future of Work and Education, AI for business development executives.
- **Output schema per article (18 fields from LLM):**
  - Title, Score, Action, Category, Summary, So what?, Who cares?, What now?, Prompts Referenced, Original Prompts, Evidence Type, Has Numbers?, Has Real Use Case?, Has Clear Action?, Source Link, Secondary Source, Notes, Shelf life?
- **Output:** `scoredChunk` (array of structured article objects for that chunk)

### Step 7b: Per-Chunk Loop Body

- **Step type:** Async Iterator (Promise.all over `chunks`)
- **Iterates over:** Each chunk
- **Body:** Step 7a runs for each chunk in parallel
- **Output:** `scoredChunks` (array of scored-chunk arrays)

### Step 7c: Score Merger

- **Step type:** Array Concat + Sort
- **Input:** `scoredChunks`
- **Behavior:** Concatenates all chunk arrays, sorts by `Score` descending, attaches the original `pubDate` from the source item.
- **Output:** `scoredItems` (single flat array of all scored items, sorted)

### Step 7d: Tier Confirmer (Optional)

- **Step type:** OpenRouter LLM Client
- **Trigger condition:** `config/workflows.ts:WF2_TIER_CONFIRM === true` AND `scoredItems.length > 0`
- **Input:** Top 5 items by score
- **Behavior:** Asks the LLM to confirm or adjust tier assignment for the top 5 items.
- **Output:** `scoredItems` (with refined tiers)

---

## Local Downstream Storage (For each AI response)

### Step 8: Output Record Iterator

- **Step type:** Programmatic Array Iterator Loop
- **Iterates over:** Each item in `scoredItems`
- **Body steps executed per iteration:** Step 9

### Step 9: Local CSV Row Appender

- **Step type:** CSV Database Writer
- **Concrete path:** `outbox/feed_summaries.csv`
- **Insert position:** Append to bottom of sheet
- **Row schema (19 columns = 18 from LLM + Timestamp):**
  - Standard columns written cleanly using a CSV handler library matching the LLM output key-values, with the **last column** (column 19) representing current system write date/time.
- **Output per iteration:** `row` (written record success log)

---

## Local Outbox Notification Staging

### Step 10: Rich HTML Digest File Builder

- **Step type:** Local File Builder
- **Mechanism:** Builds unified HTML from template and writes to disk
- **Concrete path:** `outbox/feed_digest.html`
- **Format renderer:** Multi-article news template compiling H3 article blocks, scores, bullet points, raw links, and prompts under a responsive styles layout.
- **Output:** `digest` file save confirmation log

---

## Cost and Run Logging

### Step 11: Run Log Writer

- **Step type:** Local JSON writer
- **Concrete path:** `outbox/runs/{runId}.json`
- **Schema:**
  - `runId`, `workflow: "curate-newsletters"`, `startedAt`, `endedAt`, `chunks: number`, `itemsScored: number`, `tokensIn`, `tokensOut`, `costUsd`, `status`
- **Output:** Append to `outbox/runs/index.csv` registry.

### Step 12: Cost Append

- **Step type:** Local CSV appender
- **Concrete path:** `metrics/cost.csv`
- **Schema:** `Date, Workflow, Model, TokensIn, TokensOut, CostUsd`

---

## Data Flow Summary

```text
Daily Cron Trigger (8:00 AM EST)
    |
    v
[2] Load feed URL array from test_records/feeds.json
    |
    v
[3] Map Iterator: For each feed URL in parallel
    |
    +---> [4] Fetch up to 5 items using rss-parser
    |
    v
[5] Combine all fetched items into single list
    |
    [6] DateTime Filter: Prune items older than 24 hours
    |
    [7] Chunker: Split into batches of 10 items
    |
    [7a/7b] Per-chunk LLM scoring (parallel)
    |
    [7c] Merge scored chunks (sort by score desc)
    |
    [7d] (Optional) Tier confirmer on top 5
    |
    [8] Loop Iterator: For each scored article
    |
    +---> [9] Append CSV flat row to outbox/feed_summaries.csv (19 columns)
    |
    v
[10] Spool compiled news template to outbox/feed_digest.html
    |
    [11] Write outbox/runs/{runId}.json
    |
    [12] Append metrics/cost.csv
```

---

## Pipeline Configuration Notes

- **Schedule:** Triggered programmatically or via local cron.
- **Feed count:** Loaded directly from `test_records/feeds.json` (20 unique entries after dedup).
- **Fetch cap:** 5 items per feed to avoid context window flooding.
- **Time window:** 24 hours relative to computation run.
- **Chunk size:** 10 items per LLM call (configurable).
- **Tier confirm:** On by default in v1; can be disabled for cost savings.
- **Output Schema:** 19 fields appended to CSV representing scored item dimensions + 1 Timestamp column.
- **Database output:** Appends directly to `outbox/feed_summaries.csv`.
- **Email digest mock:** Staged inside `outbox/feed_digest.html` as local static HTML template markup.

---

## Local Development & Testing Instructions

To run this pipeline locally in your sandbox:

1. **Verify Workspace Setup:**
   Ensure the following file structures exist in the project:
   - `outbox/feed_summaries.csv`
   - `outbox/feed_digest.html`
   - `outbox/runs/`
   - `metrics/cost.csv`
   - `test_records/feeds.json`

2. **Feeds Configuration:**
   Add feed URLs to `test_records/feeds.json`:

   ```json
   {
     "feeds": [
       "https://natesnewsletter.substack.com/feed",
       "https://ruben.substack.com/feed"
     ]
   }
   ```

3. **Execute Curation Script:**
   Launch the runner passing the targets:

   ```bash
   pnpm tsx src/workflows/curation/run.ts --config test_records/feeds.json
   ```

4. **Verify Scored Outputs:**
   Check the appended entries in `outbox/feed_summaries.csv` and preview the responsive email mock template generated inside `outbox/feed_digest.html`.

5. **Check Run Log and Cost:**
   Inspect `outbox/runs/{runId}.json` and `metrics/cost.csv` for the latest run.
