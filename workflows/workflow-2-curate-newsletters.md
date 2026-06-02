# Workflow 2: Curate Newsletters

## Overview
**Purpose:** Daily automated AI-news curation. The pipeline loads a configured list of feed sources, fetches recent items from each in parallel, flattens the results, filters to a 24-hour window, scores each item using a 4-question business-relevance rubric via a structured-extraction LLM, appends a flat row per item to a tabular store, and emails a compiled HTML digest to the system owner.

**Source:** relay.app workflow `Curate Newsletters` (workflow id `cmjeqzaki07300om40tjzase8`). **177 runs** recorded as of inspection.

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
| LLM Gateway (OpenRouter-routed Structured Extraction) | Scores and analyzes each item (Step 7) |
| Output Record Iterator (Loop) | Iterates per scored item (Step 8) |
| Tabular Data Store (Append API) | Appends one row per item (Step 9) |
| Email Delivery Service (Compiled HTML Digest) | Sends the daily digest (Step 10) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Document Format Renderer | Renders the compiled digest HTML (Step 10) and JSON schema (Step 7) |
| Clock Provider | Supplies current time for the 24-hour filter (Step 6) and the Timestamp column (Step 9) |
| Failure Strategy Registry | Skip-on-empty behavior for individual feeds (Step 4) |

---

## Trigger

### Step 1: Time-Based Cron Engine
- **Step type:** Time-based Cron / Orchestrator Event Loop
- **Trigger condition:** Daily at a configured local time
- **Concrete schedule (source):** **Daily at 8:00 AM EST**. First instance: 2025-11-16. Repeats every 1 week, all 7 days.
- **Output:** `trigger` (no payload — pure scheduler pulse)

---

## Data Source

### Step 2: Feed Configuration Source
- **Step type:** Feed Configuration Source (Inline Data Array)
- **Concrete source:** **Relay.app inline table** with a single `Feed` column
- **Data shape:** Single-column array of feed URL strings
- **Cardinality:** 21 configured feeds
- **Known issue:** `https://aiin5.substack.com/feed` appears **twice** in the source table. The dedup behavior in the source is not visibly enforced; the port should deduplicate explicitly before iteration.
- **Output:** `feedList` (array of `{ feed: string }` rows)

**Source feed list (21 URLs):**
1. `https://natesnewsletter.substack.com/feed`
2. `https://ruben.substack.com/feed`
3. `https://www.luizasnewsletter.com/feed`
4. `https://abrinegar.substack.com/feed`
5. `https://www.2ndorderthinkers.com/feed`
6. `https://theaibreak.substack.com/feed`
7. `https://aiin5.substack.com/feed` *(duplicate — keep one)*
8. `https://www.normaltech.ai/feed`
9. `https://www.ai-supremacy.com/feed`
10. `https://aiguide.substack.com/feed`
11. `https://grahamlovelace.substack.com/feed`
12. `https://thecreatorsai.com/feed`
13. `https://www.futureofbeinghuman.com/feed`
14. `https://www.interconnects.ai/feed`
15. `https://charliehills.substack.com/feed`
16. `https://www.oneusefulthing.org/feed`
17. `https://promptsdaily.substack.com/feed`
18. `https://newsletter.rootsofprogress.org/feed`
19. `https://theslowai.substack.com/feed`
20. `https://www.strangeloopcanon.com/feed`
21. `https://www.understandingai.org/feed`

---

## Map Phase (Parallel Loops)

### Step 3: Iterator Loop Node
- **Step type:** Iterator Loop Node (Parallel Fan-Out)
- **Iterates over:** Each row in `feedList` (deduplicated)
- **Per-iteration payload:** `{ feed: string }`
- **Platform limit:** 1000 items per run (relay.app constraint; applies to all loops in this workflow)
- **Body steps executed per iteration:** Step 4

### Step 4: Remote RSS Scraper Service
- **Step type:** HTTP XML/RSS Parser Data Ingestion Service
- **Input:** `{ feed: string }` (the iteration's current feed URL)
- **Fetch behavior:**
  - HTTP GET the feed URL
  - Parse the XML payload
  - Cap results at the top **5 items** (configured; platform default is 100)
- **Failure strategy:** Continue without a result (when no items are found or fetch fails)
- **Output per iteration:** `rssItems` (list, ≤5 items) each with the following fields:
  - `guid` (unique identifier; doubles as item ID)
  - `title`
  - `article description`
  - `pubDate` (ISO timestamp)
  - `author`
  - `thumbnail`
  - `url`

---

## Reduce & Filter Phase

### Step 5: State Aggregator
- **Step type:** State Aggregator (Flatten)
- **Concrete implementation:** relay.app "transform" step with "Combine with" operation
- **Operation:** Combine all per-iteration `rssItems` lists into one flat collection
- **Output:** `allItems` (single flat list of item objects across all feeds)

### Step 6: Temporal Range Filter
- **Step type:** Temporal Range Filter (Custom Script)
- **Concrete implementation:** relay.app "code" step (custom JavaScript, sandboxed, with `luxon` DateTime available)
- **Clock source:** Current time (provided by Clock Provider)
- **Window:** `now - 24 hours` ≤ item.`pubDate` (one-sided; future-dated items still pass)
- **Exclusion rule:** Items missing `pubDate` are dropped
- **Logic (JavaScript):**
  ```js
  export default function runCode(input) {
    const now = luxon.DateTime.now();
    const twentyFourHoursAgo = now.minus({ hours: 24 });

    const recentItems = input.rssItems.filter(item => {
      if (!item.pubDate) return false;
      const pubDate = luxon.DateTime.fromISO(item.pubDate);
      return pubDate >= twentyFourHoursAgo;
    });

    return { recentItems };
  }
  ```
- **Source code-editor note:** The relay.app code editor reports "4 errors" (likely lint warnings; not verified as runtime failures).
- **Output:** `recentItems` (list, same schema as Step 4)

---

## AI Processing

### Step 7: Structured Extraction LLM
- **Step type:** LLM Gateway (Structured Extraction with JSON Schema)
- **Concrete service:** **OpenRouter** (port target). Source uses `Claude Haiku 4.5` via Anthropic; the port routes through OpenRouter and may keep the same model id (`anthropic/claude-haiku-4.5`) or substitute.
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

- **Audience targeting (source prompt):** Scored for **Richard Achée** with focus on Responsible AI for Leaders, C-Level AI, Future of Work and Education, AI for business development executives. The port should make this audience target a config field.

- **Output schema per article (18 fields from LLM):**
  | # | Field | Description |
  |---|---|---|
  | 1 | `Title` | Headline of the item |
  | 2 | `Score (0–10)` | Overall business-implementation score |
  | 3 | `Action` | READ / MAYBE / SKIP |
  | 4 | `Category` | Capabilities / Tooling / Security / Implementation / Business |
  | 5 | `Summary` | 1-2 sentence executive summary (≤280 chars) |
  | 6 | `So what?` | What actually changed or became possible |
  | 7 | `Who cares?` | Specific businesses or industries affected |
  | 8 | `What now?` | Concrete action a business should take |
  | 9 | `Prompts Referenced` | Prompts mentioned in the article (if any) |
  | 10 | `Original Prompts` | Original prompts inspired by the article |
  | 11 | `Evidence Type` | Feature / Pricing / 3rd party research / Case Study / Security / Results / Learning / Speculation |
  | 12 | `Has Numbers?` | Yes / No |
  | 13 | `Has Real Use Case?` | Yes / No |
  | 14 | `Has Clear Action?` | Yes / No |
  | 15 | `Source Link` | Primary source URL |
  | 16 | `Secondary Source` | Optional follow-up reading URL |
  | 17 | `Notes` | Optional analyst commentary |
  | 18 | `Shelf life?` | Duration of relevance (e.g., "1 week", "3 months") |

  > **Source-prompt cleanup note:** The original prompt table in relay.app duplicates `Evidence Type` and `Has Numbers?` (they appear twice). The port should consolidate to the 18 unique fields above.

- **HITL switch:** Off
- **Output:** `scoredItems` (list of structured objects matching the 18-field schema)

---

## Downstream Storage (For each AI response)

### Step 8: Output Record Iterator
- **Step type:** Output Record Iterator (Loop)
- **Iterates over:** Each item in `scoredItems`
- **Per-iteration payload:** one scored article object
- **Body steps executed per iteration:** Step 9

### Step 9: Tabular Data Store Appender
- **Step type:** Tabular Data Store (Append API)
- **Concrete service:** **Google Drive → Google Sheets**
- **Target store:** Configured sheet (spreadsheet id `1xHUleadbyMZcsP-Weq8X-T3PMNAiPZkDm7GIEWSwRBk`)
- **Target tab:** "Feed Summaries" (gid `1039445350`)
- **Insert position:** Bottom of sheet (append)
- **Row schema (19 columns = 18 from LLM + Timestamp):**
  | # | Column | Value Source |
  |---|---|---|
  | 1 | Title | `iteration.Title` |
  | 2 | Score (0–10) | `iteration.Score (0–10)` |
  | 3 | Action | `iteration.Action` |
  | 4 | Category | `iteration.Category` |
  | 5 | Summary | `iteration.Summary` |
  | 6 | So what? | `iteration.So what?` |
  | 7 | Who cares? | `iteration.Who cares?` |
  | 8 | What now? | `iteration.What now?` |
  | 9 | Prompts Referenced | `iteration.Prompts Referenced` |
  | 10 | Original Prompts | `iteration.Original Prompts` |
  | 11 | Has Numbers? | `iteration.Has Numbers?` |
  | 12 | Has Real Use Case? | `iteration.Has Real Use Case?` |
  | 13 | Has Clear Action? | `iteration.Has Clear Action?` |
  | 14 | Source Link | `iteration.Source Link` |
  | 15 | Notes | `iteration.Notes` |
  | 16 | Secondary Source | `iteration.Secondary Source` |
  | 17 | Timestamp | Current date/time (Clock Provider) |
  | 18 | Evidence | `iteration.Evidence Type` *(column name in sheet is "Evidence"; maps from LLM's "Evidence Type" field)* |
  | 19 | Shelf life? (For how long will this information be relevant?) | `iteration.Shelf life?` |

- **Output per iteration:** `row` (appended row record)

---

## Downstream Notification

### Step 10: Rich Notification Dispatcher
- **Step type:** Email Delivery Service (Compiled HTML Digest)
- **Concrete service:** **Relay.app built-in mail (self-only)** — sends from `notifications@relay.app` to the workflow owner. To email others, the source's help text recommends the Gmail or Outlook Mail integrations.
- **Format renderer:** Compiled HTML iterating over `scoredItems`
- **Recipient source:** Workflow owner (configured; only the owner, not a custom list)
- **Subject template:** "Latest News in AI"
- **Body structure (per scored item):**
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
  - **Footer:** "View the full results in your Feed Summaries spreadsheet."
- **Output:** `digest` (delivery record)

---

## Data Flow Summary

```
Daily cron trigger (8:00 AM EST)
    |
    v
[2] Load 21 configured feed URLs (deduplicated) from inline table
    |
    v
[3] Iterator: For each feed URL
    |
    +---> [4] Fetch up to 5 recent items from feed
    |
    v (end iterator)
[5] State Aggregator: Flatten all per-feed lists into one
    |
[6] Code (luxon): keep only items within the last 24 hours
    |
[7] OpenRouter LLM (Claude Haiku 4.5 or equivalent) scores & analyzes each remaining item
    |   - 4-question filter (So what? Who cares? What now? Shelf life?)
    |   - Score 0-10, Action READ/MAYBE/SKIP
    |   - Extract prompts, evidence type, source links → 18 structured fields
    |
    v
[8] Output Record Iterator: For each scored item
    |
    +---> [9] Append row to Google Sheets "Feed Summaries" tab (19 columns)
    |
    v (end iterator)
[10] Relay.app mail: send compiled HTML digest to workflow owner
     - Subject: "Latest News in AI"
     - Body: all articles with scores, actions, analysis
     - Footer pointer to the sheet
```

---

## Pipeline Configuration Notes

- **Schedule:** Daily at 8:00 AM EST.
- **Feed count:** 21 configured feeds in the inline array, deduplicated before iteration (the source table itself contains a duplicate; the port must dedup explicitly).
- **Fetch cap:** 5 items per feed (top 5 by feed-defined order). Platform default for the RSS step is 100; this workflow overrides to 5.
- **Time filter:** Last 24 hours relative to run time. Items with no `pubDate` are excluded.
- **Scoring framework:** 4-question rubric (So what? / Who cares? / What now? / Shelf life?) producing a 0-10 score and a READ/MAYBE/SKIP action.
- **Output schema:** 18 fields from LLM per scored item + 1 Timestamp = 19 columns persisted to the Google Sheet; the same 18 are rendered in the email digest.
- **Persisted columns (19):** Title, Score, Action, Category, Summary, So what?, Who cares?, What now?, Prompts Referenced, Original Prompts, Has Numbers?, Has Real Use Case?, Has Clear Action?, Source Link, Notes, Secondary Source, Timestamp, Evidence, Shelf life?
- **Per-feed failure policy:** If a feed yields no items (or fails to fetch), the run continues without contributing to the aggregate.
- **Audience focus:** Items are scored for executive-level personalized relevance.
- **LLM routing:** Routed through **OpenRouter** in the port. Source uses `claude-haiku-4-5` via Anthropic; OpenRouter model id `anthropic/claude-haiku-4.5` (or any other) is a config swap.

---

## External Service Bindings & Swap Candidates

### 1. Cron / Time-based Trigger (Step 1)

**General logic:** Fire a workflow run on a recurring schedule. Time-zone aware.

**Concrete source:** Relay.app scheduler (built-in cron). Daily 8:00 AM EST.

**Swap candidates:** Any external scheduler or platform built-in cron.
| Candidate | Notes |
|---|---|
| **Relay.app built-in** | Source. |
| **GitHub Actions cron** | `on: schedule: - cron: ...`. |
| **Cloud cron** (GCP Cloud Scheduler, AWS EventBridge) | Cloud-native. |
| **Vercel Cron** | If hosted on Vercel. |
| **Inngest / Temporal** | Durable, restart-safe. |
| **k8s CronJob** | Self-hosted. |
| **Local `cron`** | Trivial; needs process supervision. |

### 2. Feed Configuration Source (Step 2)

**General logic:** A list of feed URLs that the loop iterates over. Single-column string array.

**Concrete source:** Relay.app inline table.

**Data shape:**
```json
[
  { "feed": "https://natesnewsletter.substack.com/feed" },
  { "feed": "https://ruben.substack.com/feed" }
]
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Inline table** (relay.app) | Source. |
| **JSON / YAML file** in repo | For code-driven workflows. |
| **Google Sheet column** | Operator-editable. |
| **Notion / Airtable table** | Operator-editable, web UI. |
| **Database table** | Programmatic management. |
| **Environment variable / config file** | For very small lists. |

### 3. RSS / Atom Feed Parser (Step 4)

**General logic:** HTTP GET an RSS / Atom feed, parse the XML, and return the top N items each with at minimum: title, description, pubDate, author, link/URL, optional thumbnail, GUID.

**Concrete source:** Relay.app built-in RSS step (HTTP fetch + parse).

**Data shape (per item):**
```json
{
  "guid": "tag:substack.com,2024:...",
  "title": "Article title",
  "article description": "Body excerpt...",
  "pubDate": "2026-05-31T14:00:00Z",
  "author": "Author Name",
  "thumbnail": "https://...",
  "url": "https://..."
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Relay.app built-in** | Source. |
| **feedparser** (Python) | Mature, robust. |
| **rss-parser / node-feed** (Node) | JavaScript. |
| **rss.app** | Hosted rollup feeds. |
| **Feedly API** | Hosted RSS aggregator with webhooks. |
| **Custom HTTP + regex / XPath** | Last resort for non-standard feeds. |

### 4. Custom Code / Scripting Sandbox (Step 6)

**General logic:** Run arbitrary JavaScript or Python to filter / transform / aggregate data. The sandbox must support a date library (e.g. luxon, dayjs, moment) for time-window filtering.

**Concrete source:** Relay.app code step (sandboxed Node.js with `luxon` preloaded).

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Relay.app code step** | Source. |
| **Built-in filter node** (most platforms) | No-code filter. |
| **Code node in n8n** | Sandbox with date library. |
| **Python node in Apache Airflow** | `@task.python`. |
| **Lambda / Cloud Function** | External compute. |
| **Inngest function** | Serverless durable functions. |

### 5. LLM Gateway — OpenRouter (Step 7)

**General logic:** Send the item list to a large language model with a structured-output prompt. The model returns one structured record per article with a fixed schema (18 fields).

**Concrete source (port target):** **OpenRouter**. Source uses `claude-haiku-4-5` via Anthropic; the port routes through OpenRouter.

**Data shape (request):**
```json
{
  "model": "anthropic/claude-haiku-4.5",
  "messages": [
    {"role": "system", "content": "Score AI news 0-10... [full rubric]"},
    {"role": "user", "content": "<json of recent items>"}
  ],
  "response_format": {"type": "json_schema", "json_schema": {"schema": {...18 fields...}}}
}
```

**Data shape (response):**
```json
{
  "items": [
    {
      "Title": "...",
      "Score (0–10)": 8,
      "Action": "READ",
      "Category": "Capabilities",
      "Summary": "...",
      "So what?": "...",
      "Who cares?": "...",
      "What now?": "...",
      "Prompts Referenced": "...",
      "Original Prompts": "...",
      "Evidence Type": "Feature",
      "Has Numbers?": "Yes",
      "Has Real Use Case?": "Yes",
      "Has Clear Action?": "Yes",
      "Source Link": "https://...",
      "Secondary Source": "",
      "Notes": "",
      "Shelf life?": "3 months"
    }
  ]
}
```

**Swap candidates:** All OpenAI-compatible; OpenRouter aggregates them.
| Candidate | Notes |
|---|---|
| **OpenRouter** | Port target. |
| **OpenAI direct** (e.g. `gpt-4o-mini`) | Cheaper, structured output. |
| **Anthropic direct** (e.g. `claude-haiku-4-5`) | Source binding. |
| **Google Gemini** | Structured output via response schema. |
| **Self-hosted vLLM / Ollama** | With a JSON-schema-capable open model (e.g. Llama 3.1 70B). |
| **LiteLLM proxy** | Uniform interface across providers. |

### 6. Tabular Data Store (Step 9)

**General logic:** Append one row per item to a configured sheet/tab. Row schema is fixed (19 columns). Insertion is at the bottom.

**Concrete source:** Google Drive → Google Sheets.

**Data shape (per row):** see the 19-column table in Step 9.

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Sheets** | Source. |
| **Airtable** | API supports append. |
| **Notion database** | API supports append. |
| **Postgres / MySQL** | Programmatic. |
| **SQLite / DuckDB** | Local. |
| **CSV file (append mode)** | Trivial. |
| **Parquet on S3** | For analytics downstream. |

### 7. Email Delivery Service (Step 10)

**General logic:** Send a single templated email to the workflow owner, with the article list rendered as compiled HTML.

**Concrete source:** Relay.app built-in mail (self, from `notifications@relay.app`).

**Swap candidates:** Same as Workflow 1 Step 2.
| Candidate | Notes |
|---|---|
| **Relay.app built-in mail** | Source (self-only). |
| **Gmail / Outlook** | Source-style SMTP. |
| **Postmark / Resend / Mailgun / SES** | Transactional services. |
| **Local filesystem mock** (for dev) | Drop HTML into a directory. |

---

## Issues & Caveats Carried Forward from the Source

1. **Duplicate feed URL** in Step 2 (`https://aiin5.substack.com/feed` appears twice). Port must dedup.
2. **Step 6 code editor reports 4 errors.** Likely lint warnings, but the port should re-validate the JS at import time.
3. **Source LLM prompt** has duplicated `Evidence Type` and `Has Numbers?` rows in the rubric table. Port should consolidate to 18 unique fields.
4. **Relay.app mail** in Step 10 is self-only. For multi-recipient digests, swap for Gmail / Outlook.
5. **Audience targeting** in Step 7 is hardcoded to "Richard Achée" with specific focus areas. The port should make this a config field.
