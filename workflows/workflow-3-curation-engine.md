# Workflow 3: Curation Engine (Local Open-Source Edition)

## Overview

**Purpose:** Weekly AI-news curation built as a localized CLI workspace task. The pipeline loads a configured list of curated enterprise tech feed sources from a local JSON file, fetches items from each in parallel using open-source loaders, aggregates all contents with zero publication date filters, generates a structured Markdown report via OpenRouter, and saves the formatted `.md` document directly inside the outbox folder tree.

**Source Code Reference:** Managed locally in your code project, replacing the previous relay.app cloud workflow `Curation Engine`.

**Step count:** 7 (retains the exact cloud logical structure mapped to local nodes).

---

## Local Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Local Task Scheduler / Cron | Fires the workflow script on a regular loop (Step 1) |
| Local JSON Configuration Loader | Loads industry and press feeds from [test_records/industry_feeds.json](test_records/industry_feeds.json) (Step 2) |
| Multi-Feed Asynchronous Scraper | Loops and loads target configurations (Step 3) |
| Open-Source RSS Parser | Pulls article XML using local standard parsing libraries (Step 4) |
| Linear Data Flattener | Programmatically flattens feed article lists (Step 5) |
| OpenRouter LLM Client | Compiles and scores all articles to markdown using gpt-4o (Step 6) |
| File Writer Stager | Saves standard Markdown output directly to [outbox/weekly_digest.md](outbox/weekly_digest.md) (Step 7) |

---

## Trigger

### Step 1: Local Automation / Cron Trigger

- **Step type:** Local Task Scheduler / Cron
- **Trigger condition:** Configured via local cron or run execution command
- **Concrete schedule:** Suggested run: weekly on Sunday morning

---

## Data Source

### Step 2: Curated Feed Configuration

- **Step type:** Local JSON Configuration Loader
- **Concrete source:** Local feeds list loaded from [test_records/industry_feeds.json](test_records/industry_feeds.json)
- **Data shape:** JSON array containing feed targets
- **Cardinality:** 13 configured feeds (focused on enterprise research, mainstream technology channels, and industry journals)

---

## Collection Loop

### Step 3 & 4: Concurrent Document Fetcher & Parser

- **Step type:** Open-Source RSS Parser & Loop Node
- **Algorithm:** Iterates concurrently over each feed url, fetches XML via standard package loader, and parses records
- **Fetch cap:** 5 items per source to prevent model input saturation
- **Failure policy:** Log individual load failures and proceed with remaining sources

---

## Processing & Final Output

### Step 5: Linear Data Flattener

- **Step type:** Programmatic Array Flattener
- **Method:** Flattens collected feed structures into a plain sequence of items.
- **Note:** Maintains the cloud logic of zero temporal filters — all parsed XML elements are directly compiled for the LLM step regardless of issue date.

### Step 6: OpenRouter Markdown Digest Compiler

- **Step type:** OpenRouter LLM Client
- **OpenRouter routing:** Employs model `openai/gpt-4o` as the translation engine
- **Audience profiling:** Targeted towards enterprise consultants, highlighting solution implementations, cost structures, capabilities, and risks
- **Analysis Rubric:** Answers three core strategic questions per piece:
  1. **So what?** – Core technical transition or capability shift
  2. **Who cares?** – Specific industries, roles, or environments affected
  3. **What now?** – Concrete tactical next step recommended
- **Scoring Scale:** Generates a rating between 0 and 10, determining recommendations: READ (score 8-10), MAYBE (score 4-7), or SKIP (score 0-3).

---

## Output Writing & Delivery

### Step 7: Local File Writer Staging

- **Step type:** File Writer Stager
- **Action:** Formats the generated markdown output and writes it as a static document to the outbox
- **Persistence Target:** [outbox/weekly_digest.md](outbox/weekly_digest.md)

---

## Data Flow Summary

```text
Weekly loop execution command
    |
    v
[2] Load curated sources from test_records/industry_feeds.json
    |
    v
[3 & 4] Asynchronous fetcher fetches XML feed payloads and parses items
    |
    v
[5] List Flattener pools all articles into a continuous sequence (no temporal filtering)
    |
    v
[6] OpenRouter LLM generates scored executive Markdown profiles 
    |
    v
[7] File Writer stores static document directly inside outbox/weekly_digest.md
```

---

## Pipeline Configuration Notes

- **Input source:** Configured inside [test_records/industry_feeds.json](test_records/industry_feeds.json).
- **Time filters:** Disabled. Compiles the latest items returned on feed load.
- **Reporting target:** Saved directly inside [outbox/weekly_digest.md](outbox/weekly_digest.md) in place of the self-to-self cloud email step.
- **Evaluation framework:** 3-question scoring rubric (So what? / Who cares? / What now?).
- **Routing adapter:** OpenRouter (`openai/gpt-4o`).

---

## Local Development & Testing Instructions

To run this weekly curation pipeline locally:

1. **Verify Files Structure:**
   Confirm the presence of:
   - Curated feed resources: [test_records/industry_feeds.json](test_records/industry_feeds.json)
   - Staged Markdown reports: [outbox/weekly_digest.md](outbox/weekly_digest.md)

2. **Feeds Configuration:**
   Add industrial or tech journals to [test_records/industry_feeds.json](test_records/industry_feeds.json):

   ```json
   {
     "feeds": [
       "https://www.mckinsey.com/insights/rss.aspx",
       "https://techcrunch.com/category/artificial-intelligence/feed/"
     ]
   }
   ```

3. **Execute Curation Executable:**
   Call the corresponding local Python or Node curation engine:

   ```bash
   python scripts/week_curator.py --config test_records/industry_feeds.json
   ```

4. **Review Generated Report:**
   Examine [outbox/weekly_digest.md](outbox/weekly_digest.md) to review the final formatted weekly compiled briefing.

---

## Key Differences from Workflow 2 (Curate Newsletters)

| Aspect | Workflow 2 (Curate Newsletters) | Workflow 3 (Curation Engine) |
| --- | --- | --- |
| **Schedule** | Daily (8:00 AM EST) | Weekly (Sunday morning recommended) |
| **Time filter** | Last 24 hours | None |
| **Evaluation style** | 4-question rubric (+ Shelf life) | 3-question rubric (no Shelf life) |
| **Data representation** | Tabular CSV database lines | Plain-text Markdown dossier |
| **Persistence Target** | [outbox/feed_summaries.csv](outbox/feed_summaries.csv) | [outbox/weekly_digest.md](outbox/weekly_digest.md) |
| **OpenRouter LLM model** | `openai/gpt-4o` | `openai/gpt-4o` |
| **Feed parameters source** | [test_records/feeds.json](test_records/feeds.json) | [test_records/industry_feeds.json](test_records/industry_feeds.json) |
