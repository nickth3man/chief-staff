# Workflow 1: Briefing Preparation Assistant

## Overview
**Purpose:** Prepare and deliver a comprehensive executive briefing before a scheduled meeting. The pipeline confirms the meeting, retrieves historical organizational context, optionally collects additional operator input, generates a written briefing, synthesizes an audio version, and delivers both before the meeting start time.

**Source:** relay.app workflow `Briefing Preparation Assistant` (workflow id `cmd4p2exw09ca0om5hqgtbriu`)

**Step count:** 19 nodes in relay.app canvas (markdown compresses to 17 logical steps). Step-numbering map:
| Markdown # | Relay.app # | Role |
|---|---|---|
| 1 | 1 | Trigger |
| 2 | 2 | Confirmation email |
| 3 | 3 | Org context lookup |
| 4 | 4 | HITL triage (Slack DM) |
| 5 | 5 (unnumbered) | If conditional routing |
| 6 | 6 | Path A: supplemental intake form |
| 7 | 7 | Path A: directory lookup |
| 8 | 8 | Path A: file lookup |
| 9 | 9 | Path A: summarize with LLM |
| 10 | 10 | Path A: generate briefing with LLM |
| 11 | 11 | Path B: directory lookup (no supplemental context path) |
| 12 | 12 | Path B: file lookup |
| 13 | 13 | Path B: summarize with LLM |
| 14 | 14 | Path B: generate briefing with LLM |
| 15 | 15 | TTS synthesis (post-merge) |
| 16 | 16 | Wait for delivery window |
| 17 | 17 | Email written briefing |
| 18 | 18 | Slack DM audio briefing |
| 19 | 19 | End run |

Both paths converge at Step 15 (TTS). Path A is the "additional input provided" path and includes the supplemental context form (Step 6); Path B is the "no additional input" path and skips the form intake, but still runs the full lookup + LLM briefing generation.

**Step groupings:** Trigger (1) / Main Flow (3) / Branching Logic (1) / Path A: Supplemental Context Processing (5) / Path B: No-Supplemental Briefing Path (4) / Delivery Phase (5)

**Source data origin (per relay.app process notes & configuration):**
- Trigger event metadata originates from **Calendly** (event type = "Event scheduled")
- Org context rows come from a Google Sheet referenced by name
- Folder/file lookups target Google Drive, parent folder `Consultant X - SaaS Performance Assessment` (folder id `1OttebEqeSQxIucWTjKwl_j2s2bVFqwE2`)
- HITL triage pings the operator via Slack DM
- All LLM calls are routed through **OpenRouter** (target) — the relay.app source currently uses GPT-4.1 via OpenAI; OpenRouter swap is a 1-line change
- TTS in the source uses **ElevenLabs**; the port target is **OpenRouter's audio-output models** (e.g. `openai/gpt-audio`, `openai/gpt-audio-mini`) which expose a TTS endpoint. The source's `ElevenLabs` binding is replaced with the OpenRouter call; the port no longer needs an ElevenLabs account.

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Inbound Webhook Event Provider | Receives structured event metadata at the trigger |
| SMTP Email Delivery System | Outbound notifications (Steps 2, 13); inbound HITL intake (Step 6) |
| Tabular Data Store (Read API) | Historical organization context lookup (Step 3) |
| Hierarchical Object/File Storage System | Directory resolution (Step 7) and file asset retrieval (Step 8) |
| Asynchronous HITL Gateway | Boolean triage input (Step 4); multi-field intake (Step 6) |
| Chat Notification System | HITL prompt delivery (Step 4); audio delivery (Step 18) |
| LLM Gateway (OpenRouter-routed) | Document summarization (Steps 9, 13); professional briefing generation (Steps 10, 14) |
| Text-to-Speech (TTS) Audio Synthesis Engine | Audio synthesis of the written briefing (Step 15) |
| Time-based Orchestrator Event Loop | Conditional wait for delivery window (Step 16) |
| Address Book / Recipient Resolver | Resolves notification recipients from event metadata (Steps 2, 17, 18) |
| Document Format Renderer | Rich-text briefing document (Steps 9, 10, 13, 14); markdown email body (Step 17) |
| Clock Provider | Supplies current time and event-relative time calculations (Step 16) |
| Failure Strategy Registry | Pause-and-notify behavior when storage lookups fail (Steps 7, 8, 11, 12) |
| Multi-Modal Output Generator | Produces paired text (Steps 10, 14) and audio (Step 15) artifacts of the same content |
| Multi-Channel Delivery Router | Routes the briefing artifact to email and chat channels (Steps 17, 18) |
| Service Connector / Identity-bound Adapter | Identity-bound bindings to all external interfaces |
| Conditional Edge | Routes between Path A and Path B (Step 5) |
| Graph Termination Node | Clears state and ends the run (Step 19) |

---

## Trigger

### Step 1: Event Scheduled Inbound Stream
- **Step type:** Inbound Webhook Event Provider
- **Trigger condition:** An external scheduling system emits a structured event payload
- **Concrete service:** **Calendly** (event type = "Event scheduled")
- **Optional checkbox:** "Also trigger for events scheduled in other people's calendars" (off by default in source)
- **Input schema (`event`):**
  - `Event Name`
  - `Event Start` (date/time)
  - `Event Duration`
  - `Invitee Name`
  - `Invitee Electronic Address`
  - `Organizer Name`
  - `Organizer Electronic Address`
  - `Guests` (list)
  - `Event Type`
- **Output:** `event` (single object passed to all downstream steps)

---

## Main Flow

### Step 2: Outbound Transactional Notification
- **Step type:** SMTP Email Delivery System
- **Concrete service:** **Gmail** (external SMTP provider)
- **Recipient source:** `event.Invitee Electronic Address` (To); `event.Guests` (CC)
- **Sender identity:** Workflow operator (configured). Source uses `Dhilip Narayan Srinivasan <dhilipnarayan@gmail.com>` as the configured "Send as" address.
- **Subject template:** `{event.Event Name} - Confirmation`
- **Body template (exact source copy):**
  ```
  Hi {event.Invitee Name},

  Your free SaaS Performance Assessment debrief, and consultation call is successfully scheduled.  We are looking forward to helping you with the right insights for your success.

  Event Name: {event.Event Name}
  Event Start: {event.Event Start}
  Duration: {event.Event Duration}

  Regards,
  {event.Organizer Name}
  ```
- **Output:** `notification1` (delivery record)

### Step 3: Fetch Organization Context
- **Step type:** Tabular Data Store (Read API)
- **Concrete service:** **Google Drive → Google Sheets** (the connector is the Google Drive connection; the entity queried is a Google Sheet)
- **Query:** Find rows in the configured sheet matching event metadata
- **Returned fields:**
  - `Target Company Name` (used downstream for directory resolution)
  - Additional context fields
- **Output:** `orgContext` (one or more rows)

### Step 4: Asynchronous HITL Triage
- **Step type:** Asynchronous HITL Gateway
- **Sub-type:** Boolean Confirmation Input
- **Channel:** Chat Notification System — **Slack DM** (concrete)
- **Audience:** Workflow operator
- **Prompt:** "Any new input or additional details to be considered?"
- **Input schema:** Boolean (Yes / No). Field name: **`Additional Input?`** (relay.app identifier).
- **Reminder policy:** 1 day after initial notification
- **Due date:** No due date
- **Output:** `triageResponse` (object with boolean field `Additional Input?`)

---

## Branching Logic

### Step 5: Conditional Edge
- **Step type:** Conditional Edge / Router
- **Routing rule:** `triageResponse.Additional Input?` is exactly `Yes`
- **Path A:** Proceed to Step 6
- **Path B (default):** No additional (new) input
- **Path B destination:** Path B runs its own four-step sub-pipeline (Steps 11–14) — directory lookup → file lookup → summarize → generate briefing — **without** the supplemental context intake. Both Path A (Step 10) and Path B (Step 14) produce the `briefing` output and converge to the shared post-merge phase starting at Step 15 (TTS).

---

## Path A: Supplemental Context Processing

### Step 6: Asynchronous Context Ingestion Form
- **Step type:** Asynchronous HITL Gateway
- **Sub-type:** Multi-Field Free-Form Input
- **Channel:** SMTP Email Delivery System — inbound email form (concrete service: **Gmail**)
- **Audience:** Workflow operator
- **Input schema (3 fields, exact source labels):**
  1. **Free Text (Additional Information)** — free text
  2. **Additional Files (Contextual)** — file attachments
  3. **Any reference URLs:** — text
- **Reminder policy:** 1 day after initial notification
- **Output:** `supplementalContext` (multi-field object)

### Step 7: Directory Resolution
- **Step type:** Hierarchical Object/File Storage System (Directory Lookup)
- **Concrete service:** **Google Drive** (the connection binding)
- **Filter (ALL):**
  - Parent directory is one of **[`Consultant X - SaaS Performance Assessment`]** (Drive folder id `1OttebEqeSQxIucWTjKwl_j2s2bVFqwE2`)
  - Directory name CONTAINS `orgContext.Target Company Name` (last element)
- **Failure strategy:** Pause run and notify (when no directories match)
- **Selection policy:** First match (when more than one)
- **Output:** `targetDirectory` (single directory)

### Step 8: File Asset Retrieval
- **Step type:** Hierarchical Object/File Storage System (File Lookup)
- **Concrete service:** Google Drive
- **Filter (ALL):**
  - Parent directory is one of `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS **`SaaS Company Performance Assessment`** (the concrete assessment keyword; not abstract)
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFile` (single file)

### Step 9: Document Summarization Node
- **Step type:** LLM Gateway (Summarization)
- **Concrete service:** **OpenRouter** (LLM routing) — the source workflow currently uses `gpt-4.1` via OpenAI; the port replaces this with an OpenRouter-routed call.
- **Source to summarize:** `targetFile` contents
- **Output length:** A few paragraphs
- **Output format:** Plain text
- **HITL switch:** Off
- **Output:** `summary` (text)

### Step 10: Professional Briefing Generation
- **Step type:** LLM Gateway (Text Generation)
- **Concrete service:** **OpenRouter**
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 9)
  - `supplementalContext.Free Text`
  - `supplementalContext.File uploads`
  - `supplementalContext.Reference URLs`
  - `targetFile` (raw source)
- **Document schema (5 sections):**
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document)
- **HITL switch:** Off

---

## Path B: No-Supplemental Briefing Path

Path B runs when the operator answers "No" to the Step 4 triage (i.e. no additional input is needed). It mirrors Path A's lookup + briefing flow but **skips the supplemental context intake form** (Step 6 in Path A) — the briefing is generated from the file alone, with no free-text / file-upload / URL augmentation.

### Step 11: Directory Resolution (Path B)
- **Step type:** Hierarchical Object/File Storage System (Directory Lookup)
- **Concrete service:** **Google Drive**
- **Filter (ALL):**
  - Parent directory is one of **`Consultant X - SaaS Performance Assessment`** (Drive folder id `1OttebEqeSQxIucWTjKwl_j2s2bVFqwE2`)
  - Directory name CONTAINS `orgContext.Target Company Name` (last element)
- **Failure strategy:** Pause run and notify (when no directories match)
- **Selection policy:** First match (when more than one)
- **Output:** `targetDirectory` (single directory)

### Step 12: File Asset Retrieval (Path B)
- **Step type:** Hierarchical Object/File Storage System (File Lookup)
- **Concrete service:** Google Drive
- **Filter (ALL):**
  - Parent directory is one of `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS **`SaaS Company Performance Assessment`**
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFile` (single file)

### Step 13: Document Summarization Node (Path B)
- **Step type:** LLM Gateway (Summarization)
- **Concrete service:** **OpenRouter**
- **Source to summarize:** `targetFile` contents (no supplemental context in Path B)
- **Output length:** A few paragraphs
- **Output format:** Plain text
- **HITL switch:** Off
- **Output:** `summary` (text)

### Step 14: Professional Briefing Generation (Path B)
- **Step type:** LLM Gateway (Text Generation)
- **Concrete service:** **OpenRouter**
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 13)
  - `targetFile` (raw source)
  - *(No supplementalContext inputs in Path B — that data is only populated in Path A.)*
- **Document schema (5 sections):** same as Step 10 (Path A version):
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document)
- **HITL switch:** Off

> **Note on relay.app numbering vs. markdown numbering:** In the relay.app canvas, these Path B steps are numbered 11, 12, 13, 14. The markdown above follows the **logical** step ordering (where the 5-section briefing pattern reuses the same numbering as Path A for clarity), so the markdown's "Step 11" through "Step 14" refer to Path B's lookup + briefing. After Path B completes, the merge to the post-branch phase is at markdown Step 15 / relay.app Step 15 (TTS), and so on.

---

## Delivery Phase

### Step 15: Audio Synthesis
- **Step type:** Text-to-Speech (TTS) Audio Synthesis Engine
- **Concrete service:** **OpenRouter audio-output models** (port target). Source uses **ElevenLabs**; the port swaps to OpenRouter's audio endpoint. OpenRouter exposes TTS via the same OpenAI-compatible API surface as the LLM calls, with `output_modalities: ["audio"]` set on the request. Recommended model ids: `openai/gpt-audio` (higher quality) or `openai/gpt-audio-mini` (cheaper).
- **Sub-type:** Multi-Modal Output Generator (paired with the written briefing from Path A Step 10 or Path B Step 14)
- **Input:** `briefing` (rich text)
- **Voice profile:** Configured voice selection (OpenAI voices: alloy, echo, fable, onyx, nova, shimmer; or pass a custom voice id if supported)
- **Output:** `audioBriefing` (audio file)

### Step 16: State-Managed Time Delay
- **Step type:** Time-based Orchestrator Event Loop (Conditional Wait)
- **Concrete behavior:** relay.app "Wait for object to match rule" — pause run until a condition on the trigger event metadata is met
- **Clock source:** `event.Event Start`
- **Wait condition:** Current time equals `event.Event Start - 24 hours`
- **Timeout policy:** No timeout — keep waiting indefinitely
- **Output:** Continues when timing condition is met

### Step 17: Written Briefing Delivery
- **Step type:** SMTP Email Delivery System
- **Concrete service:** **Gmail**
- **Format renderer:** Rich text email body
- **Recipient source:** `event.Organizer Electronic Address`
- **Sender identity:** Workflow operator (configured) — in source: **Step owner (Richard Achee)**
- **Subject template:** "Summary"
- **Body template:**
  ```
  Hi {event.Organizer Name},

  Here are the details regarding your briefing with {event.Invitee last name}.

  Regards,
  Meeting Preparation Agent
  ```
- **Attachments:** `briefing` (the document artifact)
- **Output:** `delivery1` (delivery record)

### Step 18: Audio Briefing Delivery
- **Step type:** Chat Notification System (Multi-Channel Delivery Router)
- **Concrete service:** **Slack** — DM channel via the Slack bot identity
- **Recipient source:** `event.Organizer Electronic Address` (direct message channel)
- **Sender identity:** Slack bot identity (relay.app sends as `Relay.app`; in a port the chat-platform bot identity takes its place)
- **Message template:** "Hi, Audio recording is attached for your preparation."
- **Attachment:** `audioBriefing` (with file reference)
- **Link previews:** Enabled
- **Output:** `delivery2` (delivery record)

### Step 19: Graph Termination
- **Step type:** Graph Termination Node
- **Trigger:** Always at end of run
- **Action:** Clear in-memory state and end the execution run

---

## Data Flow Summary

```
External Scheduling Event (Calendly)
    |
    v
[1] Event metadata (name, invitee, organizer, dates, etc.)
    |
    +---> [2] Confirmation notification to invitee (Gmail)
    |
    +---> [3] Lookup historical org context from Google Sheets
    |
    +---> [4] Asynchronous boolean triage with operator (Slack DM)
              |
              +---> [5] Conditional router: Yes or No?
                        |
                        +---> YES (Path A):
                        |       [6] Multi-field intake form (email)
                        |       [7] Directory lookup (Google Drive)
                        |       [8] File asset retrieval (Google Drive)
                        |       [9] Document summarization (OpenRouter LLM)
                        |       [10] Professional briefing generation (OpenRouter LLM)
                        |
                        +---> NO (Path B):
                                [11] Directory lookup (Google Drive)
                                [12] File asset retrieval (Google Drive)
                                [13] Document summarization (OpenRouter LLM)
                                [14] Professional briefing generation (OpenRouter LLM)
    |
    v
[15] Audio synthesis of the briefing (OpenRouter TTS)
    |
    [16] Wait until 24 hours before event start
    |
    [17] Email written briefing to organizer (Gmail)
    |
    [18] Send audio briefing to organizer (Slack DM)
    |
    [19] End run
```

---

## Pipeline Configuration Notes

- **Delivery window:** Briefing artifacts are released 24 hours before the scheduled event start time.
- **File identification pattern:** A file is matched by title containing the invitee name AND the concrete keyword `SaaS Company Performance Assessment` (configured assessment keyword). The same pattern is used in both Path A (Step 8) and Path B (Step 12).
- **Directory identification pattern:** A directory is matched by being a child of `Consultant X - SaaS Performance Assessment` AND having a name that contains the target company name from the org context lookup. The same pattern is used in both Path A (Step 7) and Path B (Step 11).
- **Briefing content structure:** All generated briefings (Path A and Path B) follow the 5-section schema (Items / Structure / Exception Handling / Stakeholder Considerations / Risk Mitigation) and include 3-5 key items and 5-7 anticipated questions.
- **Path difference:** Path A includes supplemental context (free text, file uploads, reference URLs) in the briefing prompt. Path B does not — the briefing is generated from the file alone.
- **Reminder cadence:** HITL prompts (Steps 4, 6) emit a follow-up reminder 1 day after the initial notification if no response is received.
- **Multi-modal pairing:** Step 15 audio is always paired with the written briefing from Path A (Step 10) or Path B (Step 14); both refer to the same source content.
- **Multi-channel delivery:** The same briefing artifact is delivered to the organizer through two channels — email (Step 17) and chat (Step 18).
- **LLM routing:** All LLM calls in this workflow route through **OpenRouter** (Steps 9, 10, 13, 14). The source used `gpt-4.1` via OpenAI; the port swaps the underlying model via the OpenRouter model id (e.g. `openai/gpt-4.1`, `anthropic/claude-3.5-sonnet`, etc.) — selection is a single config field.
- **TTS routing:** Step 15 routes through **OpenRouter's audio-output models** (port target: `openai/gpt-audio` for higher quality, `openai/gpt-audio-mini` for cost). The source uses ElevenLabs. OpenRouter exposes TTS via the same OpenAI-compatible API surface used for the LLM calls, so no separate provider is needed.
- **HITL switches:** Off in Steps 9, 10, 13, 14. The "approve or request edits" behavior is purely prompt-text; the workflow does not pause for human review.
- **Connection status as captured:** Step 1 (Calendly) and Step 3 (Sheet) were "Requires setup" at inspection time. Step 4 (Slack) showed "Connect Slack" prompt. Other connections were shared but the observer had read-only access.

---

## External Service Bindings & Swap Candidates

Every external service the workflow depends on is documented generically below. The list is derived from the source workflow's concrete bindings and is what a port to a different framework (or to open-source equivalents) must replace.

### 1. External Scheduling Event Provider (Step 1)

**General logic:** Receive a structured event payload from a scheduling system whenever a meeting is booked. The payload must include at minimum: event name, start time, duration, invitee name + email, organizer name + email, list of guests, event type.

**Concrete source:** Calendly — `Event scheduled` event.

**Data shape (JSON example):**
```json
{
  "Event Name": "SaaS Performance Assessment — Debrief",
  "Event Start": "2026-06-15T15:00:00Z",
  "Event Duration": "30",
  "Invitee Name": "Jane Doe",
  "Invitee Electronic Address": "jane.doe@example.com",
  "Organizer Name": "Dhilip Narayan Srinivasan",
  "Organizer Electronic Address": "dhilipnarayan@gmail.com",
  "Guests": ["guest1@example.com"],
  "Event Type": "Consultation"
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Calendar** | Push notifications via watch / webhook; same payload shape (subject, start/end, attendees). Best for orgs already on Workspace. |
| **Microsoft Outlook Calendar** | Graph API webhooks. Use if the team is on Microsoft 365. |
| **Cal.com** (open source) | Self-hostable Calendly alternative; webhook payloads are similar but need adapter. |
| **HubSpot Meetings** | Provides the same fields if the meeting is booked through a HubSpot calendar link. |
| **Custom form** | If no scheduler, a webhook from a Typeform / Tally / internal form suffices. |

### 2. SMTP / Transactional Email Service (Steps 2, 6, 13)

**General logic:** Send templated emails with merged fields and optional file attachments. The service must support: from-address identity, To/CC/BCC, subject, HTML body, attachments, and (for Step 6) inbound parsing or web-form intake.

**Concrete source:** Gmail — using a specific "Send as" identity.

**Data shape (per send):**
```json
{
  "from": "operator@example.com",
  "to": "invitee@example.com",
  "cc": ["guest@example.com"],
  "subject": "{Event Name} - Confirmation",
  "body_html": "<p>...</p>",
  "attachments": [{"filename": "briefing.pdf", "content": "<binary>"}]
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Gmail / Google Workspace** | Source binding. SMTP-compatible. |
| **Outlook / Microsoft 365** | Same SMTP/Graph shape. |
| **Amazon SES** | Cheap, scalable; needs verified domain. |
| **Postmark** | Strong deliverability, simple API. |
| **Resend** | Modern API, good for transactional. |
| **Mailgun** | Established, good for mixed transactional + marketing. |
| **Self-hosted Postfix + Dovecot** | Open-source; requires own deliverability hygiene. |
| **Local filesystem mock** (for dev) | Drop rendered emails into a directory instead of sending. |

### 3. Tabular Data Store / Spreadsheet Service (Step 3)

**General logic:** Read rows from a configured sheet/table. The query may match on event metadata (e.g. invitee email, company name). Returns 0+ rows.

**Concrete source:** Google Drive → Google Sheet.

**Data shape (per row):**
```json
{
  "Target Company Name": "Acme Corp",
  "Industry": "SaaS",
  "Primary Contact": "Jane Doe",
  "Notes": "..."
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Sheets** | Source binding. |
| **Airtable** | API-first; rows have attachment fields. |
| **Notion database** | API supports filtered queries. |
| **Postgres / MySQL / SQLite** | Drop-in if the data is already in a relational store. |
| **CSV / Parquet on local filesystem / S3** | Lightweight options for small datasets. |
| **Supabase / Neon** | Managed Postgres with row-level security. |

### 4. Hierarchical Object / File Storage (Steps 7, 8)

**General logic:** Browse a directory tree, find directories or files by name pattern. Supports parent-folder filters, title-contains filters, and pagination.

**Concrete source:** Google Drive.

**Filter shape (Step 7 directory lookup):**
```json
{
  "parent_folder": "Consultant X - SaaS Performance Assessment",
  "name_contains": "{orgContext.Target Company Name}"
}
```

**Filter shape (Step 8 file lookup):**
```json
{
  "parent_folder": "{step7.folder}",
  "title_contains_all": ["{event.Invitee Name}", "SaaS Company Performance Assessment"]
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Drive** | Source binding. |
| **Microsoft OneDrive / SharePoint** | Same folder/file search semantics. |
| **Dropbox** | API supports search by name. |
| **Box** | Enterprise-grade, similar API. |
| **AWS S3** | Treats "folders" as key prefixes. |
| **Local filesystem** (e.g. mounted NFS) | If the org stores assets on a shared drive, walk the tree in Node/Python. |
| **Nextcloud** (self-hosted) | Open-source alternative. |

### 5. Asynchronous HITL Gateway — Boolean (Step 4) & Multi-Field Form (Step 6)

**General logic:** Pause the workflow run until a human responds. Boolean form takes a yes/no; multi-field form takes free text, file uploads, and URL text. The gateway must support reminder escalations.

**Channel for boolean:** Chat DM (Step 4 — Slack). Channel for multi-field: Inbound email form (Step 6 — Gmail).

**Data shape (boolean response):**
```json
{ "Additional Input?": "Yes" }
```

**Data shape (multi-field response):**
```json
{
  "Free Text (Additional Information)": "Notes here...",
  "Additional Files (Contextual)": [{"filename": "deck.pdf", "url": "..."}],
  "Any reference URLs:": "https://..."
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Slack DM** (boolean) | Source binding. |
| **Microsoft Teams DM** (boolean) | Same shape. |
| **Discord DM** (boolean) | Bot-based; webhook + interactive components. |
| **Telegram bot** (boolean) | Lightweight; long-poll or webhook. |
| **Email form with reply parsing** (multi-field) | Source binding. |
| **Typeform / Tally / Fillout** (multi-field) | Form-based; webhook returns the full submission. |
| **Notion / Airtable form view** (multi-field) | Tied to a data store. |
| **Custom web form with webhook** (multi-field) | If a UI is needed. |

### 6. Chat Notification System (Steps 4, 14)

**General logic:** Deliver a chat message with optional file attachments. Must support direct messages, message text with formatting, embedded file/link previews, and bot identity.

**Concrete source:** Slack (DM channel). Sender identity is the platform bot (not the human operator).

**Data shape (per send):**
```json
{
  "channel": "DM",
  "to_user": "{event.Organizer Electronic Address}",
  "text": "Hi, Audio recording is attached for your preparation.",
  "attachment": {"filename": "briefing.mp3", "content": "<binary>"},
  "link_previews": true
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Slack** | Source binding. |
| **Microsoft Teams** | Same direct-message capability. |
| **Discord** | Webhook + DM; bot identity required. |
| **Telegram** | Bot API; supports audio attachments. |
| **Matrix** (self-hosted) | Open-source; bridged to Slack/Teams possible. |
| **Email fallback** | If no chat is configured, attach the file to an email instead. |

### 7. LLM Gateway (Steps 9, 10) — OpenRouter

**General logic:** Send a prompt to a large language model. Support for context-window size, structured output, and tool/function calls. Multiple steps share the same provider config.

**Concrete source (port target):** **OpenRouter** (LLM routing service, OpenAI-compatible API). Each step specifies a model id such as `openai/gpt-4.1`, `anthropic/claude-3.5-sonnet`, `google/gemini-1.5-pro`, etc. The source currently uses `gpt-4.1` directly via OpenAI; the port routes through OpenRouter so model selection is config-driven.

**Data shape (request):**
```json
{
  "model": "openai/gpt-4.1",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "...", "attachments": [...]}
  ],
  "temperature": 0.2,
  "max_tokens": 4000
}
```

**Data shape (response):**
```json
{
  "id": "chatcmpl-...",
  "choices": [{"message": {"role": "assistant", "content": "..."}}],
  "usage": {"prompt_tokens": ..., "completion_tokens": ...}
}
```

**Swap candidates (all are OpenAI-compatible, so the port target is one of these):**
| Candidate | Notes |
|---|---|
| **OpenRouter** | Port target. Aggregates OpenAI, Anthropic, Google, Mistral, Meta, open-source models. One API, many model ids. |
| **OpenAI direct** | Source. Drop-in for OpenRouter if a single vendor is preferred. |
| **Anthropic direct** | Drop-in if Claude is preferred. |
| **Google Vertex AI / Gemini API** | Drop-in for Gemini models. |
| **Self-hosted vLLM / llama.cpp / Ollama** | Open-source inference; the port invokes an OpenAI-compatible endpoint exposed by the local server. |
| **Local OpenRouter-compatible proxy** | One of many OSS proxies (e.g. LiteLLM) that exposes a uniform endpoint across providers. |

### 8. Text-to-Speech (TTS) Audio Synthesis Engine (Step 15)

**General logic:** Convert a long text body into an audio file (mp3/wav). Support voice profile selection, multiple output formats, and large input sizes (multi-paragraph briefing).

**Concrete source:** ElevenLabs. Port target: **OpenRouter's audio-output models** (OpenAI-compatible audio endpoint, exposed via the same OpenRouter base URL as the LLM calls, with `output_modalities: ["audio"]` on the request).

**Data shape (request — OpenRouter audio):**
```json
{
  "model": "openai/gpt-audio",
  "modalities": ["text", "audio"],
  "audio": { "voice": "alloy", "format": "wav" },
  "messages": [
    {"role": "user", "content": "<briefing body>"}
  ]
}
```

**Data shape (response):**
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "<text transcript or null>",
      "audio": {
        "id": "audio_abc123",
        "data": "<base64-encoded audio bytes>",
        "expires_at": 1234567890,
        "transcript": "<text transcript>"
      }
    }
  }]
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **OpenRouter audio models** (`openai/gpt-audio`, `openai/gpt-audio-mini`) | Port target. Same OpenAI-compatible API surface as the LLM calls; no separate provider needed. Voices: alloy, echo, fable, onyx, nova, shimmer. |
| **ElevenLabs** | Source binding. High quality, paid. Many more voice options and voice cloning. |
| **OpenAI TTS direct** | Same model as OpenRouter's `openai/gpt-audio`, but bypasses the OpenRouter aggregator. |
| **Google Cloud TTS** | Studio voices, SSML support. |
| **Amazon Polly** | Neural voices; AWS auth. |
| **Microsoft Azure Speech** | Neural voices, SSML. |
| **Piper** (open source, self-hosted) | Local; no API key. |
| **Coqui TTS / XTTS** (open source) | Voice cloning supported. |
| **edge-tts** (open source wrapper) | Uses Microsoft Edge's free online TTS service. |

> **Note on the user's "use openrouter for text to voice":** OpenRouter does expose audio-output models as of 2026 — specifically OpenAI's `gpt-audio` and `gpt-audio-mini`. The port routes Step 15 TTS through OpenRouter with model id `openai/gpt-audio` (or `openai/gpt-audio-mini` for cost), so no ElevenLabs account or separate provider is needed.

### 9. Time-based Orchestrator Event Loop (Step 16)

**General logic:** Pause the workflow run until a clock condition is met. Should be cancellable, restart-safe (resume from where it left off), and have no spurious wakeups.

**Concrete behavior:** Wait until current time equals `event.Event Start - 24 hours`. In relay.app this is implemented as a "Wait for object to match rule" on the trigger event metadata (compound rule: `Start is exactly Now + 1 day` AND `Start is on same date as Now.date - 1 day`); in a port the simpler `Wait until Now >= event.start - 24h` suffices.

**Swap candidates:** All modern workflow frameworks ship a wait/delay node. Open-source alternatives include:
| Candidate | Notes |
|---|---|
| **Cron-style scheduler** | If wait time is exact, schedule the run instead. |
| **Inngest** (open source) | Sleep steps with idempotency. |
| **Temporal** | Durable timers, restart-safe. |
| **Apache Airflow** | `sensors` and `time_delta`. |
| **Celery + ETA** | Simple delayed tasks. |
| **Postgres-backed queue with scheduled poll** | Roll your own with `pg_cron` or similar. |

### 10. Address Book / Recipient Resolver (Steps 2, 17, 18)

**General logic:** Resolve a person identifier to one or more delivery channels (email, chat handle). Trigger event metadata already carries `Invitee Electronic Address` and `Organizer Electronic Address`; for chat delivery these must be mapped to chat-specific handles.

**Concrete source:** Identity-bound adapter (per workflow operator). No external directory lookup.

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Workspace Directory** | Resolve email → user object, including chat handle. |
| **Microsoft Entra ID** | Same for Microsoft 365 orgs. |
| **Notion / Airtable "People" field** | Hand-rolled mapping. |
| **Local CSV / YAML mapping** | Lightweight. |
| **SCIM / LDAP** | Enterprise directories. |

### 11. Document Format Renderer (Steps 9, 10, 13)

**General logic:** Render structured content (markdown / HTML) into the format the destination channel expects (email HTML, chat markdown, etc.).

**Concrete source:** Relay.app built-in renderer.

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **markdown-it / marked** (Node) | Markdown → HTML. |
| **CommonMark-py / mistune** (Python) | Same. |
| **Pandoc** | Multi-format conversion (MD ↔ HTML ↔ DOCX ↔ PDF). |
| **Jinja2 / Liquid templates** | Templating on top of markdown. |

### 12. Failure Strategy Registry (Steps 7, 8)

**General logic:** When a lookup yields no results, pause the run and notify a human. No retry, no timeout, no fallback generation.

**Concrete source:** Relay.app "Pause the run and send a notification" behavior.

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Dead-letter queue + alert** | Put failed runs in a queue, page an operator. |
| **Webhook to on-call channel** | Slack/Teams alert with run context. |
| **Retry-with-backoff** | If the failure is transient (rate limit, etc.), retry N times before pausing. |

### 13. Clock Provider (Step 16)

**General logic:** A single source of truth for "now". Must support time-zone awareness (workflows run in EST in the source).

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **System clock** | Trivial; need time-zone handling. |
| **NTP** | Sub-second accuracy. |
| **Cloud provider time** (AWS Time Sync, GCP) | High availability. |

### 14. Multi-Channel Delivery Router (Steps 17, 18)

**General logic:** Fan out the same artifact to multiple channels (email, chat). Each channel has its own identity, format, and recipient resolution.

**Swap candidates:** Trivially implemented as a list of channel-specific senders (see #2 and #6 above).

---

## Issues & Caveats Carried Forward from the Source

1. **LLM HITL switches** (Steps 9, 10, 13, 14): All off. The "approve or request edits" language is in the prompts but does not actually pause the run.
2. **Step 15 TTS** in the source references step 5's If-output for the text-to-synthesize field, which is broken; the port must re-point the reference to the post-merge `briefing` output (Path A's Step 10 or Path B's Step 14).
3. **Step 17 attachment** in the source references step 5's output (broken); the port must re-point to the briefing.
4. **Step 19 "End if"** in the source has no rule; conditional end is a no-op. The port should make it unconditional.
5. **Hardcoded business context**: The body of Step 2 contains "SaaS Performance Assessment debrief" copy. The port should template this from event metadata rather than hardcode.
6. **Path B reads as "empty" at first glance**: The relay.app canvas places Path B's four steps (11–14) inside the Path B branch container, which the inspector initially collapsed. An initial read may interpret the workflow as "Path B does nothing"; in fact it runs a full lookup + briefing generation. The "issues" wording about a "Path B bug" that appeared in earlier drafts of this file is wrong; Path B is a fully-functioning parallel path.
7. **OpenRouter TTS assumption correction**: Earlier drafts of this file noted that "OpenRouter does not currently do TTS" based on a misread of the OpenRouter site. As of 2026, OpenRouter does expose audio-output models (`openai/gpt-audio`, `openai/gpt-audio-mini`, plus Google's `lyria-3-*` music models) through the same OpenAI-compatible API surface. Step 15 TTS therefore routes through OpenRouter with one of those model ids; no separate ElevenLabs account is required.
