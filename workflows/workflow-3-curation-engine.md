# Workflow 3: Curation Engine

## Overview
**Purpose:** Weekly AI-news curation. The pipeline loads a configured list of feed sources, fetches recent items from each in parallel, flattens the results without any temporal filter, generates a free-form markdown digest using a 3-question scoring rubric, and emails the raw markdown to the system owner. No tabular persistence and no time-window filter.

**Source:** relay.app workflow `Curation Engine` (workflow id `cmj4nquhs1tfn0om15jl08u9r`). **5 runs** recorded as of inspection.

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
| LLM Gateway (OpenRouter-routed Free-Form Markdown) | Scores and summarizes as mobile-optimized markdown (Step 6) |
| Email Delivery Service (Raw Markdown Body) | Sends the raw markdown digest (Step 7) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Document Format Renderer | Renders the markdown email body (Step 7) |
| Failure Strategy Registry | Skip-on-empty behavior for individual feeds (Step 4) |

---

## Trigger

### Step 1: Weekly Schedule Trigger
- **Step type:** Time-based Cron / Orchestrator Event Loop (Weekly)
- **Trigger condition:** Weekly on a configured day-of-week at a configured local time
- **Concrete schedule (source):** **Weekly on Sunday at 8:00 AM EST**. First instance: 2025-11-16. Next run: Sunday Jun 7, 8:00 AM.
- **Output:** `trigger` (no payload — pure scheduler pulse)

---

## Data Source

### Step 2: Feed Configuration Source
- **Step type:** Feed Configuration Source (Inline Data Array)
- **Concrete source:** **Relay.app inline table** with a single `Feed` column
- **Data shape:** Single-column array of feed URL strings
- **Cardinality:** **13 configured feeds** (different from Workflow 2's 21 — this is a business-vertical focus, mostly enterprise / mainstream tech press + RSS rollups)
- **Output:** `feedList` (array of `{ feed: string }` rows)

**Source feed list (13 URLs):**
1. `https://www.mckinsey.com/insights/rss.aspx`
2. `https://rss.app/feeds/Fsi4KbWmAySg9FbN.xml`
3. `https://rss.app/feeds/mGLM6BGASBvwWuRy.xml`
4. `https://techcrunch.com/category/artificial-intelligence/feed/`
5. `https://news.microsoft.com/source/topics/ai/feed/`
6. `https://blog.google/technology/ai/rss/`
7. `https://openai.com/news/rss.xml`
8. `http://www.theverge.com/rss/index.xml`
9. `http://feeds.feedburner.com/TechCrunch/`
10. `https://www.reddit.com/r/technology/.rss`
11. `https://rss.app/feeds/G7hvENxmPlJWPA6a.xml`
12. `https://rss.app/feeds/HA5fBthaWjrmqZXm.xml`
13. `https://natesnewsletter.substack.com/feed`

---

## Collection Loop

### Step 3: Iterator Loop Node
- **Step type:** Iterator Loop Node (Parallel Fan-Out)
- **Iterates over:** Each row in `feedList`
- **Per-iteration payload:** `{ feed: string }`
- **Platform limit:** 1000 items per run (relay.app constraint)
- **Body steps executed per iteration:** Step 4

### Step 4: Concurrent Document Fetcher
- **Step type:** HTTP XML/RSS Parser Data Ingestion Service (Concurrent Map)
- **Input:** `{ feed: string }` (the iteration's current feed URL)
- **Fetch behavior:**
  - HTTP GET the feed URL
  - Parse the XML payload
  - Cap results at the top 5 items (same as Workflow 2)
- **Failure strategy:** Continue without a result (when no items are found or fetch fails)
- **Output per iteration:** `rssItems` (list, ≤5 items) — same item schema as Workflow 2 Step 4 (guid, title, article description, pubDate, author, thumbnail, url)

---

## Processing & Final Output

### Step 5: Linear Data Flattener
- **Step type:** State Aggregator (Flatten — No Temporal Filter)
- **Operation:** Combine all per-iteration `rssItems` lists into one flat collection
- **Note:** Unlike Workflow 2, no temporal filter is applied — all fetched items are passed forward regardless of `pubDate`.
- **Output:** `allItems` (single flat list of item objects across all feeds)

### Step 6: Free-Form Markdown Generation LLM
- **Step type:** LLM Gateway (OpenRouter-routed Free-Form Markdown Text Generation)
- **Concrete service:** **OpenRouter** (port target). Source uses `GPT 5.4` via OpenAI; the port routes through OpenRouter with a model id like `openai/gpt-4.1` or `openai/gpt-4o`.
- **Format renderer:** Rich text / mobile-optimized markdown with headers, bold text, spacing, and source links
- **Input:** `allItems` (the unfiltered flat list)
- **Audience targeting (source prompt):** Scored for **business implementation consultant**. The port should make this a config field.

- **Scoring rubric (3-question filter — no Shelf life):**
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
- **HITL switch:** Off

---

## Downstream Notification

### Step 7: Direct Markdown Communication Dispatch
- **Step type:** Email Delivery Service (Raw Markdown Body)
- **Concrete service:** **Relay.app built-in mail (self-only)** — sends from `notifications@relay.app` to the workflow owner. To email others, the source's help text recommends the Gmail or Outlook Mail integrations.
- **Format renderer:** The LLM output is passed directly (no template reformatting)
- **Recipient source:** Workflow owner (configured; only the owner)
- **Subject template:** "Latest News in AI"
- **Body:** `digestMarkdown` (the full LLM output, passed through verbatim)
- **Output:** `delivery` (delivery record)

---

## Data Flow Summary

```
Weekly cron trigger (Sunday 8:00 AM EST)
    |
    v
[2] Load 13 configured feed URLs from inline table
    |
    v
[3] Iterator: For each feed URL
    |
    +---> [4] Fetch up to 5 recent items from feed
    |
    v (end iterator)
[5] Linear Data Flattener: aggregate all items across all feeds (no temporal filter)
    |
[6] OpenRouter LLM (GPT-4.1 or equivalent) scores & summarizes all items
    |   - 3-question filter (So what? Who cares? What now?)
    |   - Score 0-10, Action READ/MAYBE/SKIP
    |   - Mobile-optimized markdown with source links
    |
[7] Direct Markdown Communication Dispatch: send raw markdown body to owner
     - Subject: "Latest News in AI"
```

---

## Pipeline Configuration Notes

- **Schedule:** Weekly on Sunday at 8:00 AM EST.
- **Feed count:** 13 configured feeds in the inline array, deduplicated before iteration.
- **Fetch cap:** 5 items per feed (top 5 by feed-defined order).
- **No temporal filtering:** All fetched items are passed to the LLM regardless of `pubDate`.
- **Scoring framework:** 3-question rubric (So what? / Who cares? / What now?) producing a 0-10 score and a READ/MAYBE/SKIP action. No "Shelf life?" question.
- **Output rendering:** Free-form mobile-optimized markdown, not a structured schema.
- **No persistent storage:** Results are not appended to a tabular store — they are delivered only via the email digest.
- **Email body source:** The email body is the LLM output passed through verbatim, not a templated re-render of structured fields.
- **Per-feed failure policy:** If a feed yields no items (or fails to fetch), the run continues without contributing to the aggregate.
- **Audience focus:** Items are scored for business-implementation consultant relevance.
- **LLM routing:** Routed through **OpenRouter** in the port. Source uses `gpt-4.1` via OpenAI; OpenRouter model id `openai/gpt-4.1` is a config swap.

---

## External Service Bindings & Swap Candidates

### 1. Cron / Time-based Trigger (Step 1)

**General logic:** Fire a workflow run weekly on a configured day at a configured local time. Time-zone aware.

**Concrete source:** Relay.app scheduler (built-in weekly cron). Sunday 8:00 AM EST.

**Swap candidates:** Same as Workflow 2 Step 1.
| Candidate | Notes |
|---|---|
| **Relay.app built-in** | Source. |
| **GitHub Actions cron** | `on: schedule: - cron: '0 13 * * 0'` (UTC). |
| **Cloud cron** (GCP Cloud Scheduler, AWS EventBridge) | Cloud-native. |
| **Vercel Cron** | If hosted on Vercel. |
| **Inngest / Temporal** | Durable, restart-safe. |
| **k8s CronJob** | Self-hosted. |
| **Local `cron`** | Trivial. |

### 2. Feed Configuration Source (Step 2)

**General logic:** A list of feed URLs that the loop iterates over.

**Concrete source:** Relay.app inline table.

**Data shape:**
```json
[
  { "feed": "https://www.mckinsey.com/insights/rss.aspx" },
  { "feed": "https://rss.app/feeds/Fsi4KbWmAySg9FbN.xml" }
]
```

**Swap candidates:** Same as Workflow 2 Step 2 (inline table, JSON file, Google Sheet, Notion, Airtable, DB, env var).

### 3. RSS / Atom Feed Parser (Step 4)

**General logic:** HTTP GET an RSS / Atom feed, parse the XML, return top N items.

**Concrete source:** Relay.app built-in RSS step.

**Swap candidates:** Same as Workflow 2 Step 4 (feedparser, rss-parser, rss.app, Feedly, custom).

### 4. LLM Gateway — OpenRouter (Step 6)

**General logic:** Send the entire unfiltered item list to a large language model with a free-form markdown-output prompt. The model returns a single markdown body that is passed verbatim into the email.

**Concrete source (port target):** **OpenRouter**. Source uses `gpt-4.1` via OpenAI; the port routes through OpenRouter with a model id like `openai/gpt-4.1` or `openai/gpt-4o`.

**Data shape (request):**
```json
{
  "model": "openai/gpt-4.1",
  "messages": [
    {"role": "system", "content": "Score AI news 0-10... [3-question rubric]..."},
    {"role": "user", "content": "<json of all items>"}
  ]
}
```

**Data shape (response):**
```json
{
  "choices": [{"message": {"role": "assistant", "content": "Title\nScore: 8/10\nAction: READ\n...full markdown body..."}}]
}
```

**Swap candidates:** Same as Workflow 2 Step 5. OpenRouter is the port target.
| Candidate | Notes |
|---|---|
| **OpenRouter** | Port target. |
| **OpenAI direct** | Source. |
| **Anthropic direct** | Claude does well at free-form markdown. |
| **Google Gemini** | Cheaper for long-context item lists. |
| **Self-hosted vLLM / Ollama** | Open model with sufficient context window. |
| **LiteLLM proxy** | Uniform interface. |

### 5. Email Delivery Service (Step 7)

**General logic:** Send a single email to the workflow owner with the LLM markdown body passed through verbatim.

**Concrete source:** Relay.app built-in mail (self, from `notifications@relay.app`).

**Swap candidates:** Same as Workflow 2 Step 7.
| Candidate | Notes |
|---|---|
| **Relay.app built-in mail** | Source (self-only). |
| **Gmail / Outlook** | SMTP-compatible. |
| **Postmark / Resend / Mailgun / SES** | Transactional services. |
| **Local filesystem mock** (for dev) | Drop into a directory. |

---

## Issues & Caveats Carried Forward from the Source

1. **Audience targeting** in Step 6 is hardcoded to "business implementation consultant". The port should make this a config field.
2. **Relay.app mail** in Step 7 is self-only. For multi-recipient digests, swap for Gmail / Outlook.
3. **No temporal filter** is intentional (this is the difference from Workflow 2). The port should preserve the lack-of-filter; adding one would change behavior.
4. **Feed list is curated for enterprise / mainstream press**, distinct from Workflow 2's newsletter-focused list. The port should keep the lists separate, not merge them.
5. **Source has 1 unpublished change** ("Apply / 1 change / Revert / Publish" banner visible at inspection time). The port should not pull this unpublished draft.

---

## Key Differences from Workflow 2 (Curate Newsletters)

| Aspect | Workflow 2 (Curate Newsletters) | Workflow 3 (Curation Engine) |
|---|---|---|
| **Schedule** | Daily (8:00 AM EST) | Weekly (Sunday 8:00 AM EST) |
| **Time filter** | Last 24 hours (luxon code) | None |
| **Filter framework** | 4-question (+ Shelf life) | 3-question (no Shelf life) |
| **Output format** | Structured JSON with 18 fields | Free-form mobile-optimized markdown |
| **Tabular persistence** | Yes (one row per item appended) | No |
| **Per-record loop after LLM** | Yes (loop appends one row per item) | No |
| **Email body** | Templated HTML iterating structured fields | Raw LLM markdown output |
| **Audience focus** | Executive-level personalized (hardcoded to "Richard Achée") | Business implementation consultant (generic) |
| **Prompts extraction** | Yes (referenced + original) | No |
| **Evidence tracking fields** | Yes (Has Numbers?, Has Real Use Case?, etc.) | No |
| **Feed list** | 21 newsletter/Substack sources | 13 enterprise / mainstream press + RSS rollups |
| **LLM model (source)** | `claude-haiku-4-5` (Anthropic) | `gpt-4.1` (OpenAI) |
| **LLM routing (port)** | OpenRouter | OpenRouter |
| **Email service (source)** | Relay.app mail (self) | Relay.app mail (self) |
