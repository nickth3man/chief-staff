# Workflow 4: Meeting Follow-Up — Notes & Draft Follow-up Email

## Overview
**Purpose:** Automated meeting follow-up pipeline. When a raw transcript file is added to a monitored storage directory, the pipeline extracts meeting metadata, reformats the transcript into polished client-ready notes, persists a formatted document, drafts a follow-up email addressed to the attendees, creates a task-list reminder, and adds a card to a visual project-tracking board.

**Source:** relay.app workflow `Trello Version - Meeting Follow-Up - Notes & Draft follow-up email` (workflow id `cmn4ndcf01dai0qkpd2b84ern`).

> **Source naming note:** The relay.app workflow is prefixed "Trello Version" because the visual-board sink is Trello. Other versions of the same workflow may use a different board (e.g. Asana, ClickUp). The pipeline logic is the same; only the final sink changes.

**Step count:** 9
**Step groupings:** Trigger (1) / Node Group 1: Metadata Extraction & Document Generation (4) / Node Group 2: Downstream Task & Tracking Provisioning (4)

> **Process notes (from source, included verbatim):** The workflow's own relay.app description text describes an 8-step process that is **broader than the actual 9-step workflow**: "1. Find the transcript summaries (Fireflies). 2. Add a row to a Meeting Log sheet with the Calendar event details and the links to the meeting summary. 3. Categorize the meeting type (partner, customer, vendor, other). 4. Briefly summarize the meeting and log the meeting summary. 5. Reformat meeting notes. 6. Create a Google Doc with the reformatted meeting notes. 7. Create a draft of a follow-up email with the link to the meeting notes. 8. Create task to send the meeting notes." The port should add steps 1 (Fireflies source ingestion) and 2-3 (Meeting Log + categorization) if those capabilities are required, since they are not implemented in the current relay.app workflow as inspected.

> **Connection status as captured:** The source workflow had **5 steps requiring setup** at inspection time (1, 3, 4, 5, 8). Several external connections (Sheet, Document target folder, Tasks list, Trello list) were unconfigured. The port must explicitly select these to run end-to-end.

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| File Storage Watcher (File Watcher) | Watches for new transcript file arrivals (Step 1) |
| LLM Gateway (OpenRouter-routed Schema Extraction) | Extracts meeting name and attendee list (Step 2) |
| LLM Gateway (OpenRouter-routed Document Formatting & Transcription) | Reformats raw transcript into polished notes (Step 3) |
| Document Artifact Persister | Creates a persistent formatted document (Step 4) |
| File Directory Management Unit | Repositions the document to a root storage area (Step 5) |
| LLM Gateway (OpenRouter-routed Professional Communication Drafting) | Drafts the follow-up email (Step 6) |
| Email Delivery Service (Draft Management — Staging Only) | Stages the draft without sending (Step 7) |
| Task Tracking Sink (Reminder Queue) | Adds a reminder task to a task list (Step 8) |
| Task Tracking Sink (Visual Board) | Adds a card to a shared workflow board (Step 9) |
| Asynchronous HITL Gateway (Approval / Edit-Request Input) | Implicit approval/edit loop in the notes prompt (Step 3) |
| Sandboxed Code Executor | Provides code-execution capability to the formatting LLM (Step 3) |
| Clock Provider | Supplies current date for the formatted notes (Step 3) |
| Address Book / Recipient Resolver | Resolves attendee electronic addresses for the draft (Step 7) |
| Document Format Renderer | Renders the formatted notes (Step 3), the document (Step 4), and the email draft (Step 6) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Failure Strategy Registry | Off (no filter) at the trigger (Step 1) |

---

## Trigger

### Step 1: File Storage Watcher
- **Step type:** File Storage Watcher (File Watcher)
- **Concrete service:** **Google Drive**
- **Trigger condition:** A new raw transcript file is added to a monitored storage directory
- **Upstream source (per process notes):** **Fireflies** (transcript-summary service) — Fireflies writes transcript summary files into the watched Drive folder
- **Input schema (`file`):**
  - `File Name`
  - `File Content` (raw transcript body)
  - `Creation Time`
  - File metadata
- **Optional filters:** None configured (all new files trigger)
- **Failure strategy:** Off (no filter)
- **Output:** `file` (single object passed to all downstream steps)

---

## Node Group 1: Metadata Extraction & Document Generation

### Step 2: Schema Extraction LLM
- **Step type:** LLM Gateway (OpenRouter-routed Schema Extraction)
- **Concrete service:** **OpenRouter** (port target). Source uses `Gemini 3 Flash` via Google Gemini; the relay.app UI flags this model as outdated and recommends upgrading to `Gemini 3.5 Flash`. The port routes through OpenRouter (e.g. `google/gemini-2.5-flash` or equivalent).
- **Input:**
  - `file` (the transcript file contents)
  - `file.File Name` (file title)
- **Prompt (verbatim):**
  ```
  Please extract the following details from the attached file:
  - Attendee Names
  - Attendee Email Addresses
  - Meeting Name
  ```
- **Output schema (structured):**
  - `Meeting Name` (text)
  - `Attendees` (list of objects):
    - `Attendee Name` (text)
    - `Attendee Email Address` (text)
- **HITL switch:** Off
- **Output:** `metadata` (object with `Meeting Name` and `Attendees` list)

### Step 3: Document Formatting & Transcription LLM
- **Step type:** LLM Gateway (OpenRouter-routed Document Formatting & Transcription)
- **Concrete service:** **OpenRouter** (port target). Source uses `GPT 5.4` via OpenAI; OpenRouter id `openai/gpt-4.1` (or `openai/gpt-4o`).
- **Format renderer:** Rich text / markdown
- **Sandbox:** Code-execution sandbox enabled (use case in this workflow: likely date arithmetic for the "Date" section, although the prompt does not make this explicit)
- **Clock source:** Current date (provided by Clock Provider)
- **Sub-type (HITL):** Approval / Edit-Request Input (the prompt ends with an implicit "approve or request edits" gate; **HITL switch in source is OFF, so this gate is purely prompt-text and does not pause the run**)
- **Inputs:**
  - Current date
  - `file` (raw transcript)
  - `metadata` (extracted meeting name + attendees)
  - `metadata.Attendees` (attendee list)
  - Code-execution sandbox
- **Prompt (verbatim, source):**
  ```
  You are an assistant that converts messy meeting transcripts into polished, client-ready meeting notes.

  Follow this exact workflow:

  Step 1
  Read the raw transcript: {file.File Name}
  Rewrite them into clean, professional meeting notes using the exact template structure.
  If information is missing, use placeholders like [TBD] or [Not provided].
  Preserve key takeaways, important decisions, risks, opportunities, and comments.
  After generating the notes, ask the user to approve them or request edits.
  Use this exact output structure:

  Date
  Meeting name
  Attendees
  Attachments
  Summary / key decisions
  Actions
  (instructions: Present it as a markdown table with columns: Action Item, Owner, and Date.)
  Details
  Ideas for later
  ```
- **Output template structure (8 sections):**
  - **Date** (populated from current date)
  - **Meeting name**
  - **Attendees**
  - **Attachments**
  - **Summary / key decisions**
  - **Actions** (rendered as markdown table: Action Item | Owner | Date)
  - **Details**
  - **Ideas for later**
- **HITL switch:** Off
- **Output:** `formattedNotes` (rich text / markdown)

### Step 4: Document Artifact Persister
- **Step type:** Document Artifact Persister
- **Concrete service:** **Google Drive → Google Docs**
- **Input:**
  - `metadata.Meeting Name`
  - `file.Creation Time`
  - `formattedNotes` (the reformatted notes content)
- **Title template:** `{metadata.Meeting Name} - {file.Creation Time}`
- **Target folder:** Required, not selected in source (must be configured)
- **Content:** `formattedNotes` plus a literal "@" appended (note: the source uses a bare "@" with no mention target — likely an unfinished mention; the port should attach a real mention, e.g. `@owner-email` or remove the bare "@")
- **Output:** `document` (with viewable URL)

### Step 5: File Directory Management Unit
- **Step type:** File Directory Management Unit
- **Concrete service:** **Google Drive**
- **Input:** `document` (treated as a file object)
- **Move target:** **My Drive** (the user's own Drive root — equivalent to "root storage workspace" in the abstract)
- **Behavior:** Programmatically reposition the newly created document from its ephemeral creation location into My Drive
- **Output:** `finalDocument` (moved file reference)

---

## Node Group 2: Downstream Task & Tracking Provisioning

### Step 6: Professional Communication Drafting LLM
- **Step type:** LLM Gateway (OpenRouter-routed Professional Communication Drafting)
- **Concrete service:** **OpenRouter** (port target). Source uses `Claude Sonnet 4.6` via Anthropic; OpenRouter id `anthropic/claude-3.5-sonnet` or newer.
- **Format renderer:** Rich text
- **Inputs:**
  - `formattedNotes` (the formatted meeting notes)
  - `document.URL` (link to the persisted document)
- **Prompt (verbatim, source):**
  ```
  Please write a brief email that provides a link to the meeting notes, key takeaways, and a list of follow-up actions.

  Step 1: Analyze the meeting notes
  Step 2: Begin the email by thanking everyone for the their time during the call and propose a follow-up meeting if needed based on the notes. Be sure to include the link to the meeting notes (Google Doc Document URL)
  Step 3: Outline key takeaways/ decisions in bullet format under the header "Key Takeaways:"
  Step 4: Outline the action items and owners in bullet format
  Step 5: Finish the email with "Let me know if I missed anything. Looking forward to our next call."

  Keep it under 200 words.
  ```
- **Length constraint:** Under 200 words
- **Output:** `emailDraft` (rich text body)
- **HITL switch:** Off

### Step 7: Message Draft Staging Engine
- **Step type:** Email Delivery Service (Draft Management — Staging Only)
- **Concrete service:** **Gmail** (creates a draft in the user's Gmail Drafts; never sends)
- **Format renderer:** Rich text email body
- **Recipient source (via Address Book / Recipient Resolver):** All `metadata.Attendees[].Attendee Email Address` (combined into a single To field)
- **Sender identity:** Workflow operator (configured). Source uses `Richard Achee <richard@found42.com>` as the configured "Send as" address.
- **Include signature:** **No** (explicitly disabled)
- **Subject template:** `{metadata.Meeting Name} - Notes and Next Steps`
- **Body:** `emailDraft` (the LLM-generated follow-up)
- **Send policy:** Stage as draft — do NOT transmit
- **Output:** `draft` (saved draft record)

### Step 8: Task Scheduler Integration
- **Step type:** Task Tracking Sink (Reminder Queue)
- **Concrete service:** **Google Tasks**
- **Target list:** Required, not selected in source (must be configured)
- **Created entry:** A reminder to review and send the staged meeting-follow-up draft
- **Output:** `task` (created task record)

### Step 9: Visual Project Board Integrator
- **Step type:** Task Tracking Sink (Visual Board)
- **Concrete service:** **Trello** (the "Trello Version" in the source name comes from this binding)
- **Target board:** Configured shared workflow board (required, not selected in source)
- **Target list/column:** Configured list within the board (required)
- **Created entry:** A trackable card representing the meeting context for team visibility
- **Output:** `card` (created card record)

---

## Data Flow Summary

```
New raw transcript file detected in monitored Google Drive folder
    |
    v
[1] File object (name, content, creation time, metadata)
    |
    +=== NODE GROUP 1: Metadata Extraction & Document Generation ===+
    |                                                                |
    +---> [2] Schema Extraction LLM (OpenRouter)
    |       - Meeting Name
    |       - Attendees (Name + Email Address pairs)
    |
    +---> [3] Document Formatting & Transcription LLM (OpenRouter)
    |       - Raw transcript -> polished notes
    |       - Template: Date, Meeting Name, Attendees,
    |         Attachments, Summary, Actions (table),
    |         Details, Ideas for later
    |
    +---> [4] Document Artifact Persister (Google Docs)
    |       - Title: "{Meeting Name} - {Creation Time}"
    |       - Content: formatted meeting notes
    |       - Target folder: configured
    |
    +---> [5] File Directory Management Unit (Google Drive)
    |       - Move document to My Drive
    |
    +=== NODE GROUP 2: Downstream Task & Tracking Provisioning ===+
    |                                                              |
    +---> [6] Professional Communication Drafting LLM (OpenRouter)
    |       - Thank attendees + link to document
    |       - Key Takeaways (bullets)
    |       - Action Items (bullets with owners)
    |       - Under 200 words
    |
    +---> [7] Message Draft Staging Engine (Gmail draft)
    |       - To: all attendee email addresses (combined)
    |       - Subject: "{Meeting Name} - Notes and Next Steps"
    |       - Body: LLM-generated follow-up
    |       - Staged as draft; NOT sent
    |
    +---> [8] Task Scheduler Integration (Google Tasks)
    |       - Reminder entry on the configured task list
    |
    +---> [9] Visual Project Board Integrator (Trello)
            - Trackable card on the configured shared board
```

---

## Pipeline Configuration Notes

- **Trigger source:** Raw transcript files arriving in a monitored Google Drive directory. Upstream transcript source: **Fireflies**.
- **No trigger filters:** Any new file in the directory triggers the pipeline.
- **Sequential LLM chain:** Three LLM calls run in sequence with distinct roles — schema extraction, document formatting, and email drafting.
- **Document title pattern:** `{Meeting Name} - {File Creation Time}`.
- **Email subject pattern:** `{Meeting Name} - Notes and Next Steps`.
- **Email length constraint:** Under 200 words.
- **Email closing phrase:** "Let me know if I missed anything. Looking forward to our next call."
- **Draft policy:** The follow-up email is always staged as a draft; the pipeline never transmits directly.
- **Document structure (8 sections):** Date, Meeting Name, Attendees, Attachments, Summary / key decisions, Actions (markdown table), Details, Ideas for later.
- **Action item format:** Markdown table with columns Action Item | Owner | Date.
- **Key Takeaways section:** Bulleted list under the header "Key Takeaways:".
- **Sender identity:** Configured workflow operator (no signature included in the draft). Source: `Richard Achee <richard@found42.com>`.
- **Recipient resolution:** The draft is addressed to all attendees whose email addresses were extracted in Step 2.
- **Dual task-tracking sinks:** The pipeline persists the meeting context to two sinks — a reminder queue (Step 8) and a visual board (Step 9).
- **Implicit HITL gate:** The Step 3 prompt ends with an "approve or request edits" check, but the HITL switch in the source is **off** — the gate is purely prompt-text and the workflow does not pause for human review. The downstream provisioning (Steps 4–9) runs unconditionally.
- **Sandbox capability:** The Step 3 LLM call has access to a code-execution sandbox alongside the transcript content. Use case in this workflow is undocumented; likely date arithmetic for the "Date" section.
- **LLM routing:** All three LLM calls (Steps 2, 3, 6) route through **OpenRouter** in the port. Source uses Gemini 3 Flash / GPT 5.4 / Claude Sonnet 4.6 across different providers; OpenRouter unifies them under one config-driven model id.
- **Bare "@" mention in Step 4:** The source appends a literal "@" with no target to the document content. This is likely an unfinished edit. The port should either remove the bare "@" or replace it with a real mention (e.g. `@owner-email`).

---

## External Service Bindings & Swap Candidates

### 1. File Storage Watcher (Step 1)

**General logic:** Watch a directory for new file arrivals. Each new file becomes the trigger event payload (file name, content, creation time, metadata).

**Concrete source:** Google Drive.

**Data shape (`file` object):**
```json
{
  "File Name": "Fireflies - Meeting Title.md",
  "File Content": "<raw transcript body>",
  "Creation Time": "2026-05-31T14:00:00Z",
  "File URL": "https://drive.google.com/...",
  "File ID": "..."
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Drive** | Source. |
| **Microsoft OneDrive / SharePoint** | Same semantics; webhook on folder. |
| **Dropbox** | Webhook-based file watcher. |
| **Box** | Enterprise-grade. |
| **S3 (S3 Event Notifications → Lambda/SQS)** | Object-store watcher. |
| **Local filesystem (inotify / fs.watch)** | If self-hosted. |
| **Webhook from upstream service** (e.g. Fireflies) | Skip the file-watcher entirely; Fireflies posts to the workflow's webhook when a transcript is ready. |

### 2. LLM Gateway — OpenRouter (Steps 2, 3, 6)

**General logic:** Three sequential LLM calls. Each has a different role and a different model in the source:
- **Step 2 (schema extraction):** `Gemini 3 Flash` via Google Gemini — fast, structured output, schema extraction. Source flags as outdated; recommends Gemini 3.5 Flash.
- **Step 3 (document formatting):** `GPT 5.4` via OpenAI — long-context document reformatting, sandbox execution.
- **Step 6 (email drafting):** `Claude Sonnet 4.6` via Anthropic — professional tone, under 200 words.

**Concrete port target:** **OpenRouter**. Each step specifies a model id:
- Step 2: `google/gemini-2.5-flash` (or upgrade target)
- Step 3: `openai/gpt-4.1` (or `openai/gpt-4o`)
- Step 6: `anthropic/claude-3.5-sonnet` (or newer)

**Data shape (Step 2 request):**
```json
{
  "model": "google/gemini-2.5-flash",
  "messages": [
    {"role": "system", "content": "Please extract the following details from the attached file: Attendee Names, Attendee Email Addresses, Meeting Name"},
    {"role": "user", "content": "<file content>"}
  ],
  "response_format": {"type": "json_schema", "json_schema": {"schema": {
    "Meeting Name": "string",
    "Attendees": [{"Attendee Name": "string", "Attendee Email Address": "string"}]
  }}}
}
```

**Data shape (Step 3 request):**
```json
{
  "model": "openai/gpt-4.1",
  "messages": [
    {"role": "system", "content": "You are an assistant that converts messy meeting transcripts into polished, client-ready meeting notes..."},
    {"role": "user", "content": "<file content>"}
  ]
}
```

**Data shape (Step 6 request):**
```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "messages": [
    {"role": "system", "content": "Please write a brief email that provides a link to the meeting notes, key takeaways, and a list of follow-up actions. Keep it under 200 words."},
    {"role": "user", "content": "<formatted notes + document URL>"}
  ]
}
```

**Swap candidates (all three steps are OpenAI-compatible):**
| Candidate | Notes |
|---|---|
| **OpenRouter** | Port target. Aggregates OpenAI, Anthropic, Google, Mistral, Meta, open-source. |
| **OpenAI direct** | Source for Step 3. |
| **Anthropic direct** | Source for Step 6. |
| **Google Gemini direct** | Source for Step 2. |
| **Self-hosted vLLM / Ollama** | Open-source inference. |
| **LiteLLM proxy** | Uniform interface. |

### 3. Sandboxed Code Executor (Step 3)

**General logic:** Allow the LLM to execute code (typically Python or Node) during its reasoning. Used in this workflow for date arithmetic / formatting for the "Date" section, although the source does not make this explicit.

**Concrete source:** Relay.app code-execution sandbox (sandboxed Node.js with limited built-ins).

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Relay.app sandbox** | Source. |
| **OpenAI Code Interpreter** | Built into the OpenAI Assistants API. |
| **Anthropic tool use with Python REPL** | Claude 3+ can run Python via tool calling. |
| **E2B / Code Sandbox API** | Hosted sandbox; can be invoked via tool call. |
| **Modal / Replicate** | Serverless code execution. |
| **Custom Docker sandbox** | Self-hosted. |

### 4. Document Artifact Persister (Step 4)

**General logic:** Create a document (rich text / markdown) in a target folder, with a templated title, and return a viewable URL.

**Concrete source:** Google Drive → Google Docs.

**Data shape:**
```json
{
  "title": "Quarterly Review - 2026-05-31T14:00:00Z",
  "content": "<rich text / markdown body>",
  "target_folder": "<folder id or path>"
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Docs** | Source. |
| **Microsoft OneNote / Word** | Office 365. |
| **Notion page** | API-driven page creation. |
| **Confluence page** | Atlassian. |
| **Dropbox Paper** | Dropbox. |
| **Markdown file in GitHub** | For source-controlled notes. |
| **Local `.md` file** | Trivial. |
| **HTML file in object store** | S3 + CloudFront. |

### 5. File Directory Management Unit (Step 5)

**General logic:** Move a file from its creation location to a root storage area.

**Concrete source:** Google Drive. Move target = "My Drive".

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Drive** | Source. |
| **OneDrive / SharePoint** | Move API. |
| **S3** | `s3:CopyObject` + `s3:DeleteObject`. |
| **Local filesystem** | `mv` or `shutil.move`. |

### 6. Email Delivery Service — Drafts Only (Step 7)

**General logic:** Create a draft in the user's email account. Never transmit. The draft is intended for human review and manual send.

**Concrete source:** Gmail (Drafts API).

**Data shape:**
```json
{
  "to": ["jane@example.com", "bob@example.com"],
  "subject": "Q Review - Notes and Next Steps",
  "body_html": "<p>...</p>",
  "from": "richard@found42.com",
  "signature": false,
  "as_draft": true
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Gmail Drafts** | Source. |
| **Outlook Drafts** | Microsoft Graph `createMail` with `isDraft`. |
| **Apple Mail drafts** (macOS local) | AppleScript. |
| **ProtonMail drafts** | If privacy-first. |
| **Custom IMAP folder named "Drafts"** | Direct IMAP append. |
| **Notion / Linear comment** | If email is overkill. |

### 7. Task Tracking Sink — Reminder Queue (Step 8)

**General logic:** Add a task to a list, typically titled something like "Send meeting follow-up".

**Concrete source:** Google Tasks.

**Data shape:**
```json
{
  "task_list": "<list id or name>",
  "title": "Send meeting follow-up",
  "notes": "https://docs.google.com/.../meeting-doc",
  "due": null
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Google Tasks** | Source. |
| **Microsoft To Do** | Microsoft 365. |
| **Todoist** | Cross-platform. |
| **Things 3** | Apple. |
| **Asana tasks** | In Asana project. |
| **Linear issues** | Engineering-tracker style. |
| **Trello card on a "Pending Review" list** | If Trello is the single source. |
| **Slack DM to self** | Lightweight. |
| **Email to self** | Trivial. |

### 8. Task Tracking Sink — Visual Board (Step 9)

**General logic:** Add a card to a list on a kanban-style board, representing the meeting context for team visibility.

**Concrete source:** Trello (per the workflow's "Trello Version" name).

**Data shape:**
```json
{
  "board_id": "<board id>",
  "list_id": "<list id>",
  "card_title": "Q Review — Notes and Next Steps",
  "card_description": "...",
  "card_url": "..."
}
```

**Swap candidates:**
| Candidate | Notes |
|---|---|
| **Trello** | Source. |
| **Asana task** | In an Asana project. |
| **ClickUp task** | ClickUp. |
| **Monday.com item** | Monday. |
| **Linear issue** | Engineering-tracker. |
| **Jira issue** | Engineering-tracker. |
| **Notion database row** | Generic. |
| **Airtable record** | Generic. |
| **GitHub issue** | Engineering-tracker. |

### 9. Clock Provider (Step 3)

**General logic:** Supplies "today" to the LLM so the "Date" section of the notes can be populated. Could also be used for date arithmetic inside the code sandbox.

**Swap candidates:** Same as Workflow 1 #13. System clock, NTP, cloud-provider time.

### 10. Asynchronous HITL Gateway (Step 3, implicit)

**General logic:** The Step 3 prompt ends with "ask the user to approve them or request edits." This is an implicit HITL gate. In the source, the HITL switch is OFF so the gate is purely text and the workflow does not pause.

**Port behavior:** Either (a) keep the gate as prompt-text and continue automatically (matches source behavior), or (b) wire up a real HITL pause (Slack DM / email form with a yes/edit input) so a human can actually approve before provisioning continues.

**Swap candidates:** Same as Workflow 1 #5 (Slack DM, Teams, Discord, Telegram, email form, Typeform).

### 11. Address Book / Recipient Resolver (Step 7)

**General logic:** Resolve a person's name (or list of names) to one or more email addresses. In this workflow, the LLM-extracted email addresses from Step 2 are used directly — no directory lookup.

**Swap candidates:** Same as Workflow 1 #10 (Google Workspace Directory, Microsoft Entra ID, Notion, Airtable, CSV/YAML mapping, SCIM/LDAP).

### 12. Document Format Renderer (Steps 3, 4, 6)

**General logic:** Render structured content (markdown, JSON) into the destination format (rich text email, Google Doc body, etc.).

**Swap candidates:** Same as Workflow 1 #11 (markdown-it, marked, CommonMark-py, Pandoc, Jinja2, Liquid).

### 13. Failure Strategy Registry (Step 1)

**General logic:** Trigger with no filter. All new files fire the workflow.

**Port behavior:** The port should preserve this. If filtering by file type / size / name is required, add a filter predicate.

**Swap candidates:** Same as Workflow 1 #12. Most file-watcher primitives accept a filter predicate.

---

## Issues & Caveats Carried Forward from the Source

1. **Bare "@" mention in Step 4:** The source appends a literal "@" with no mention target. Likely an unfinished edit. The port should either remove it or replace with `@owner-email` or similar.
2. **HITL switch in Step 3 is off:** The "approve or request edits" prompt-text does not actually pause the run. The downstream provisioning (Steps 4–9) executes unconditionally.
3. **Step 2 LLM model is outdated:** Source uses `Gemini 3 Flash` and the relay.app UI recommends upgrading to `Gemini 3.5 Flash`. The port should use a current model id via OpenRouter.
4. **Step 3 "Connection to run this step is missing":** The source shows "Connect OpenAI" prompt for Step 3. The OpenAI connection was not set up in the inspected state. The port must explicitly bind the OpenRouter connection.
5. **5 steps require setup** in the source: Step 1 (Parent Folder), Step 3 (OpenAI), Step 4 (Target folder), Step 5 (would need connection), Step 8 (Task list), Step 9 (Trello list). The port must explicitly configure these.
6. **Process notes describe a broader 8-step process** that the actual 9-step workflow doesn't fully implement (specifically, the Fireflies source ingestion and the Meeting Log sheet). The port should add those if needed.
7. **The workflow is named "Trello Version"** because of the Trello board binding. Other versions exist (e.g. for Asana) and the pipeline logic is otherwise the same.
8. **Sender identity is hardcoded** to `Richard Achee <richard@found42.com>` in Step 7. The port should make this a config field.

---

## Trello-Specific vs. Generic Visual-Board Sinks

The relay.app workflow is prefixed "Trello Version" because Step 9 binds to Trello. The pipeline is otherwise identical regardless of the visual board choice. The same 9-step shape ports cleanly to:

- **Trello** (source)
- **Asana** (drop-in for Step 9)
- **ClickUp** (drop-in for Step 9)
- **Monday.com** (drop-in for Step 9)
- **Linear** (drop-in for Step 9)
- **Jira** (drop-in for Step 9)
- **Notion database** (drop-in for Step 9)

For each candidate, the swap is a single config change in Step 9. The card/issue creation API differs, but the payload shape (board id, list id, title, description, url) is conceptually identical.
