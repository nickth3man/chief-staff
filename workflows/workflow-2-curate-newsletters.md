# Workflow 2: Curate Newsletters

## Overview
**Purpose:** Daily automated AI-news curation. The pipeline loads a configured list of feed sources, fetches recent items from each in parallel, flattens the results, filters to a 24-hour window, scores each item using a 4-question business-relevance rubric via a structured-extraction LLM, appends a flat row per item to a tabular store, and emails a compiled HTML digest to the system owner.

**Step count:** 10
**Step groupings:** Trigger (1) / Data Source (1) / Map Phase (2) / Reduce & Filter Phase (2) / AI Processing (1) / Downstream Storage (2) / Downstream Notification (1)

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Time-based Cron / Orchestrator Event Loop | Daily trigger (Step 1) |
| Feed Configuration Source (Inline Data Array) | Holds the configured feed URL list (Step 2) |
| Iterator Loop Node (Parallel Fan-Out) | Spawns one execution context per feed (Step 3) |
| HTTP XML/RSS Parser Data Ingestion Service | Fetches and parses each feed (Step 4) |
| State Aggregator (Flatten) | Combines all per-feed lists into one (Step 5) |
| Temporal Range Filter (Custom Script) | Keeps only items within the last 24 hours (Step 6) |
| LLM Gateway (Structured Extraction with JSON Schema) | Scores and analyzes each item (Step 7) |
| Output Record Iterator (Loop) | Iterates per scored item (Step 8) |
| Tabular Data Store (Append API) | Appends one row per item (Step 9) |
| SMTP Email Delivery System (Compiled HTML Digest) | Sends the daily digest (Step 10) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Document Format Renderer | Renders the compiled digest HTML (Step 10) and JSON schema (Step 7) |
| Clock Provider | Supplies current time for the 24-hour filter (Step 6) and the Timestamp column (Step 9) |
| Failure Strategy Registry | Skip-on-empty behavior for individual feeds (Step 4) |

---

## Trigger

### Step 1: Time-Based Cron Engine
- **Step type:** Time-based Cron / Orchestrator Event Loop
- **Trigger condition:** Daily at a configured local time
- **Output:** `trigger` (no payload — pure scheduler pulse)

---

## Data Source

### Step 2: Feed Configuration Source
- **Step type:** Feed Configuration Source (Inline Data Array)
- **Data shape:** Single-column array of feed URL strings
- **Cardinality:** N configured feeds (deduplicated before iteration)
- **Output:** `feedList` (array of `{ feed: string }` rows)

---

## Map Phase (Parallel Loops)

### Step 3: Iterator Loop Node
- **Step type:** Iterator Loop Node (Parallel Fan-Out)
- **Iterates over:** Each row in `feedList`
- **Per-iteration payload:** `{ feed: string }`
- **Body steps executed per iteration:** Step 4

### Step 4: Remote RSS Scraper Service
- **Step type:** HTTP XML/RSS Parser Data Ingestion Service
- **Input:** `{ feed: string }` (the iteration's current feed URL)
- **Fetch behavior:**
  - HTTP GET the feed URL
  - Parse the XML payload
  - Cap results at the top 5 items
- **Failure strategy:** Continue without a result (when no items are found or fetch fails)
- **Output per iteration:** `rssItems` (list, ≤5 items) each with:
  - `id` (fetchable item ID)
  - `guid`
  - `title`
  - `description` (text + html)
  - `pubDate` (ISO timestamp)
  - `author`
  - `thumbnail`
  - `url`

---

## Reduce & Filter Phase

### Step 5: State Aggregator
- **Step type:** State Aggregator (Flatten)
- **Operation:** Combine all per-iteration `rssItems` lists into one flat collection
- **Output:** `allItems` (single flat list of item objects across all feeds)

### Step 6: Temporal Range Filter
- **Step type:** Temporal Range Filter (Custom Script)
- **Clock source:** Current time (provided by Clock Provider)
- **Window:** `now - 24 hours` ≤ item.`pubDate` ≤ `now`
- **Exclusion rule:** Items missing `pubDate` are dropped
- **Logic (pseudocode):**
  ```
  now = current_time()
  cutoff = now - 24h
  recentItems = filter(allItems, item => item.pubDate >= cutoff)
  ```
- **Output:** `recentItems` (list, same schema as Step 4)

---

## AI Processing

### Step 7: Structured Extraction LLM
- **Step type:** LLM Gateway (Structured Extraction with JSON Schema)
- **Format renderer:** Structured JSON list (auto-generated schema)
- **Input:** `recentItems`
- **Scoring rubric (4-question filter):**
  1. **So what?** — Magnitude of impact (incremental optimization, net-new capability, paradigm shift)
  2. **Who cares?** — Blast radius (specific technical roles, single vertical, universally applicable to executives)
  3. **What now?** — Strategic posture (monitor, pilot, fully integrate)
  4. **Shelf life?** — Relevance duration (weeks, months, years)

- **Scoring tiers:**
  - **HIGH (8-10):** Can answer all 3 questions with specifics (new features/tools/APIs, pricing changes, security issues, real results with numbers)
  - **MEDIUM (4-7):** Can answer 2 questions (tool updates, implementation learnings, industry shifts with data)
  - **LOW (0-3):** Cannot answer questions or vague (speculation, opinion without evidence, no clear business impact)

- **Output schema per article (19 fields):**

  | Field | Description |
  |---|---|
  | `Title` | Headline of the item |
  | `Score (0-10)` | Overall business-implementation score |
  | `Action` | READ / MAYBE / SKIP |
  | `Category` | Capabilities / Tooling / Security / Implementation / Business |
  | `Summary` | 1-2 sentence executive summary (≤280 chars) |
  | `So what?` | What actually changed or became possible |
  | `Who cares?` | Specific businesses or industries affected |
  | `What now?` | Concrete action a business should take |
  | `Prompts Referenced` | Prompts mentioned in the article (if any) |
  | `Original Prompts` | Original prompts inspired by the article |
  | `Evidence Type` | Feature / Pricing / 3rd party research / Case Study / Security / Results / Learning / Speculation |
  | `Has Numbers?` | Yes / No |
  | `Has Real Use Case?` | Yes / No |
  | `Has Clear Action?` | Yes / No |
  | `Source Link` | Primary source URL |
  | `Secondary Source` | Optional follow-up reading URL |
  | `Notes` | Optional analyst commentary |
  | `Shelf life?` | Duration of relevance (e.g., "1 week", "3 months") |

- **Output:** `scoredItems` (list of structured objects matching the 19-field schema)

---

## Downstream Storage (For each AI response)

### Step 8: Output Record Iterator
- **Step type:** Output Record Iterator (Loop)
- **Iterates over:** Each item in `scoredItems`
- **Per-iteration payload:** one scored article object
- **Body steps executed per iteration:** Step 9

### Step 9: Tabular Data Store Appender
- **Step type:** Tabular Data Store (Append API)
- **Target store:** Configured sheet / tabular destination
- **Target tab:** Configured tab name (e.g., "Feed Summaries")
- **Insert position:** Bottom of sheet (append)
- **Row schema (19 columns):**

  | Column | Value Source |
  |---|---|
  | Title | `iteration.Title` |
  | Score (0-10) | `iteration.Score (0-10)` |
  | Action | `iteration.Action` |
  | Category | `iteration.Category` |
  | Summary | `iteration.Summary` |
  | So what? | `iteration.So what?` |
  | Who cares? | `iteration.Who cares?` |
  | What now? | `iteration.What now?` |
  | Prompts Referenced | `iteration.Prompts Referenced` |
  | Original Prompts | `iteration.Original Prompts` |
  | Has Numbers? | `iteration.Has Numbers?` |
  | Has Real Use Case? | `iteration.Has Real Use Case?` |
  | Has Clear Action? | `iteration.Has Clear Action?` |
  | Source Link | `iteration.Source Link` |
  | Notes | `iteration.Notes` |
  | Secondary Source | `iteration.Secondary Source` |
  | Timestamp | Current date/time (Clock Provider) |
  | Evidence | `iteration.Evidence Type` |
  | Shelf life? | `iteration.Shelf life?` |

- **Output per iteration:** `row` (appended row record)

---

## Downstream Notification

### Step 10: Rich Notification Dispatcher
- **Step type:** SMTP Email Delivery System (Compiled HTML Digest)
- **Format renderer:** Compiled HTML iterating over `scoredItems`
- **Recipient source:** Workflow owner (configured)
- **Subject template:** "Latest News in AI"
- **Body structure:**
  - **Header:** "AI News Summary"
  - **For each article in `scoredItems`:**
    - Title (H3 heading)
    - Score, Action, Category (one-line summary)
    - Bulleted list: So what?, Who cares?, What now?, Shelf life?
    - Evidence Type
    - Has Numbers?, Has Real Use Case?, Has Clear Action?
    - Prompts Referenced
    - Original Prompts
    - Notes
    - Source link
    - Secondary Source link
  - **Footer:** Pointer to the full results in the configured tabular store
- **Output:** `digest` (delivery record)

---

## Data Flow Summary

```
Daily cron trigger at configured local time
    |
    v
[2] Load N configured feed URLs from inline array
    |
    v
[3] Iterator: For each feed URL
    |
    +---> [4] Fetch up to 5 recent items from feed
    |
    v (end iterator)
[5] State Aggregator: Flatten all per-feed lists into one
    |
[6] Temporal Range Filter: keep only items within the last 24 hours
    |
[7] Structured Extraction LLM scores & analyzes each remaining item
    |   - 4-question filter (So what? Who cares? What now? Shelf life?)
    |   - Score 0-10, Action READ/MAYBE/SKIP
    |   - Extract prompts, evidence type, source links
    |
    v
[8] Output Record Iterator: For each scored item
    |
    +---> [9] Append row to Tabular Data Store (19 columns)
    |
    v (end iterator)
[10] Rich Notification Dispatcher sends compiled HTML digest to owner
     - Subject: "Latest News in AI"
     - Body: all articles with scores, actions, analysis
```

---

## Pipeline Configuration Notes

- **Schedule:** Daily at a configured local time.
- **Feed count:** N configured feeds in the inline array, deduplicated before iteration.
- **Fetch cap:** 5 items per feed (top 5 by feed-defined order).
- **Time filter:** Last 24 hours relative to run time. Items with no `pubDate` are excluded.
- **Scoring framework:** 4-question rubric (So what? / Who cares? / What now? / Shelf life?) producing a 0-10 score and a READ/MAYBE/SKIP action.
- **Output schema:** 19 fields per scored item, persisted to the configured tabular store and rendered in the email digest.
- **Persisted columns (19):** Title, Score, Action, Category, Summary, So what?, Who cares?, What now?, Prompts Referenced, Original Prompts, Has Numbers?, Has Real Use Case?, Has Clear Action?, Source Link, Notes, Secondary Source, Timestamp, Evidence, Shelf life?
- **Per-feed failure policy:** If a feed yields no items (or fails to fetch), the run continues without contributing to the aggregate.
- **Audience focus:** Items are scored for executive-level business-implementation relevance.
