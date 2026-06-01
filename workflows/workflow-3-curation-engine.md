# Workflow 3: Curation Engine

## Overview
**Purpose:** Weekly AI-news curation. The pipeline loads a configured list of feed sources, fetches recent items from each in parallel, flattens the results without any temporal filter, generates a free-form markdown digest using a 3-question scoring rubric, and emails the raw markdown to the system owner. No tabular persistence and no time-window filter.

**Step count:** 7
**Step groupings:** Trigger (1) / Data Source (1) / Collection Loop (2) / Processing & Final Output (2) / Downstream Notification (1)

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Time-based Cron / Orchestrator Event Loop (Weekly) | Weekly trigger (Step 1) |
| Feed Configuration Source (Inline Data Array) | Holds the configured feed URL list (Step 2) |
| Iterator Loop Node (Parallel Fan-Out) | Spawns one execution context per feed (Step 3) |
| HTTP XML/RSS Parser Data Ingestion Service (Concurrent Map) | Fetches and parses each feed (Step 4) |
| State Aggregator (Flatten — No Temporal Filter) | Combines all per-feed lists into one (Step 5) |
| LLM Gateway (Free-Form Markdown Text Generation) | Scores and summarizes as mobile-optimized markdown (Step 6) |
| SMTP Email Delivery System (Raw Markdown Body) | Sends the raw markdown digest (Step 7) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Document Format Renderer | Renders the markdown email body (Step 7) |
| Failure Strategy Registry | Skip-on-empty behavior for individual feeds (Step 4) |

---

## Trigger

### Step 1: Weekly Schedule Trigger
- **Step type:** Time-based Cron / Orchestrator Event Loop (Weekly)
- **Trigger condition:** Weekly on a configured day-of-week at a configured local time
- **Output:** `trigger` (no payload — pure scheduler pulse)

---

## Data Source

### Step 2: Feed Configuration Source
- **Step type:** Feed Configuration Source (Inline Data Array)
- **Data shape:** Single-column array of feed URL strings
- **Cardinality:** N configured feeds (deduplicated before iteration)
- **Output:** `feedList` (array of `{ feed: string }` rows)

---

## Collection Loop

### Step 3: Iterator Loop Node
- **Step type:** Iterator Loop Node (Parallel Fan-Out)
- **Iterates over:** Each row in `feedList`
- **Per-iteration payload:** `{ feed: string }`
- **Body steps executed per iteration:** Step 4

### Step 4: Concurrent Document Fetcher
- **Step type:** HTTP XML/RSS Parser Data Ingestion Service (Concurrent Map)
- **Input:** `{ feed: string }` (the iteration's current feed URL)
- **Fetch behavior:**
  - HTTP GET the feed URL
  - Parse the XML payload
  - Cap results at the top 5 items
- **Failure strategy:** Continue without a result (when no items are found or fetch fails)
- **Output per iteration:** `rssItems` (list, ≤5 items) — same item schema as Workflow 2 Step 4

---

## Processing & Final Output

### Step 5: Linear Data Flattener
- **Step type:** State Aggregator (Flatten — No Temporal Filter)
- **Operation:** Combine all per-iteration `rssItems` lists into one flat collection
- **Note:** Unlike Workflow 2, no temporal filter is applied — all fetched items are passed forward
- **Output:** `allItems` (single flat list of item objects across all feeds)

### Step 6: Free-Form Markdown Generation LLM
- **Step type:** LLM Gateway (Free-Form Markdown Text Generation)
- **Format renderer:** Rich text / mobile-optimized markdown with headers, bold text, spacing, and source links
- **Input:** `allItems` (the unfiltered flat list)

- **Scoring rubric (3-question filter):**
  1. **So what?** — Changes how AI works or what's possible?
  2. **Who cares?** — Which businesses/industries are affected?
  3. **What now?** — What action should businesses take?

- **Scoring tiers:**
  - **HIGH (8-10):** Can answer all 3 questions with specifics (new features/tools/APIs, pricing/cost changes, security issues, real results with numbers)
  - **MEDIUM (4-7):** Can answer 2 questions (tool updates, implementation learnings, industry shifts with data)
  - **LOW (0-3):** Cannot answer questions or vague (speculation, opinion without evidence, no clear business impact)

- **Output format per article (mobile-optimized markdown):**
  ```
  Title
  Score: X/10
  Action: READ/MAYBE/SKIP
  Category: Capabilities|Tooling|Security|Implementation|Business
  Summary
  So what: [answer or "unclear"]
  Who cares: [answer or "unclear"]
  What now: [answer or "unclear"]
  Source
  ```

- **Output:** `digestMarkdown` (rich text / markdown string containing all articles)

---

## Downstream Notification

### Step 7: Direct Markdown Communication Dispatch
- **Step type:** SMTP Email Delivery System (Raw Markdown Body)
- **Format renderer:** The LLM output is passed directly (no template reformatting)
- **Recipient source:** Workflow owner (configured)
- **Subject template:** "Latest News in AI"
- **Body:** `digestMarkdown` (the full LLM output, passed through verbatim)
- **Output:** `delivery` (delivery record)

---

## Data Flow Summary

```
Weekly cron trigger at configured day/time
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
[5] Linear Data Flattener: aggregate all items across all feeds (no temporal filter)
    |
[6] Free-Form Markdown Generation LLM scores & summarizes all items
    |   - 3-question filter (So what? Who cares? What now?)
    |   - Score 0-10, Action READ/MAYBE/SKIP
    |   - Mobile-optimized markdown with source links
    |
[7] Direct Markdown Communication Dispatch: send raw markdown body to owner
     - Subject: "Latest News in AI"
```

---

## Pipeline Configuration Notes

- **Schedule:** Weekly on a configured day-of-week at a configured local time.
- **Feed count:** N configured feeds in the inline array, deduplicated before iteration.
- **Fetch cap:** 5 items per feed (top 5 by feed-defined order).
- **No temporal filtering:** All fetched items are passed to the LLM regardless of `pubDate`.
- **Scoring framework:** 3-question rubric (So what? / Who cares? / What now?) producing a 0-10 score and a READ/MAYBE/SKIP action. No "Shelf life?" question.
- **Output rendering:** Free-form mobile-optimized markdown, not a structured schema.
- **No persistent storage:** Results are not appended to a tabular store — they are delivered only via the email digest.
- **Email body source:** The email body is the LLM output passed through verbatim, not a templated re-render of structured fields.
- **Per-feed failure policy:** If a feed yields no items (or fails to fetch), the run continues without contributing to the aggregate.
- **Audience focus:** Items are scored for business-implementation consultant relevance.

---

## Key Differences from Workflow 2 (Curate Newsletters)

| Aspect | Workflow 2 (Curate Newsletters) | Workflow 3 (Curation Engine) |
|---|---|---|
| **Schedule** | Daily | Weekly |
| **Time filter** | Last 24 hours | None |
| **Filter framework** | 4-question (+ Shelf life) | 3-question (no Shelf life) |
| **Output format** | Structured JSON with 19 fields | Free-form mobile-optimized markdown |
| **Tabular persistence** | Yes (one row per item appended) | No |
| **Per-record loop after LLM** | Yes (loop appends one row per item) | No |
| **Email body** | Templated HTML iterating structured fields | Raw LLM markdown output |
| **Audience focus** | Executive-level personalized | Business implementation consultant (generic) |
| **Prompts extraction** | Yes (referenced + original) | No |
| **Evidence tracking fields** | Yes (Has Numbers?, Has Real Use Case?, etc.) | No |
