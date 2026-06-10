# Workflow 1: Briefing Preparation Assistant

## Overview

**Purpose:** Prepare and deliver a comprehensive executive briefing before a scheduled meeting. The pipeline confirms the meeting, retrieves historical organizational context, optionally collects additional operator input, generates a written briefing, synthesizes an audio version, and delivers both before the meeting start time.

**Source:** Local execution script `Briefing Preparation Assistant`

**Step count:** 15 logical execution pipeline nodes (Path A and Path B from the previous version have been collapsed into one parameterized path; the HITL gate in Step 4 short-circuits Step 5 if the operator says "No").

**Step-numbering map:**

| Markdown # | Role |
| --- | --- |
| 1 | Trigger |
| 2 | Confirmation email |
| 3 | Org context lookup |
| 4 | HITL triage (Terminal/UI prompt) |
| 5 | Optional supplemental intake (only if Step 4 = Yes) |
| 6 | Directory lookup |
| 7 | File lookup |
| 8 | Read markdown file |
| 9 | LLM: summarize |
| 10 | LLM: generate 5-section briefing (with optional supplemental context) |
| 11 | TTS synthesis |
| 12 | Wait for delivery window (24h before start, or `--bypass-delay`) |
| 13 | Stage written briefing |
| 14 | Stage audio briefing |
| 15 | End run |

**Path summary:** The pipeline runs Steps 1-3 unconditionally. Step 4 asks the operator whether supplemental context is needed. If "Yes", Step 5 collects free text, file paths, and reference URLs. Steps 6-10 run regardless; Step 10 conditionally folds in the supplemental context. Steps 11-15 deliver and clean up.

**Source data origin (per local open-source implementation):**

- Trigger event metadata originates from a **Local JSON File** trigger load payload.
- Org context rows come from a local CSV file: `outbox/context.csv`.
- Folder/file lookups target local folder structure: `assets/consultant_x/{Company Name}/`.
- HITL triage prompt is handled interactively via the running **CLI Terminal prompt** or the Web UI.
- All LLM calls are routed through **OpenRouter** (unified API gateway surface mapping to `openai/gpt-4o`).
- TTS audio synthesis uses **OpenRouter's** `openai/gpt-4o-mini-tts` model.

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Inbound Webhook Event Provider | Receives structured event metadata at the trigger |
| SMTP Email Delivery System | Outbound confirmation (Step 2) |
| Tabular Data Store (Read API) | Historical organization context lookup (Step 3) |
| Hierarchical Object/File Storage System | Directory resolution (Step 6) and file asset retrieval (Step 7) |
| Asynchronous HITL Gateway | Boolean triage input (Step 4); multi-field intake (Step 5) |
| Chat Notification System | HITL prompt delivery (Step 4); audio delivery (Step 14) |
| LLM Gateway (OpenRouter-routed) | Document summarization (Step 9); professional briefing generation (Step 10) |
| Text-to-Speech (TTS) Audio Synthesis Engine | Audio synthesis of the written briefing (Step 11) |
| Time-based Orchestrator Event Loop | Conditional wait for delivery window (Step 12) |
| Address Book / Recipient Resolver | Resolves notification recipients from event metadata (Steps 2, 13, 14) |
| Document Format Renderer | Rich-text briefing document (Steps 9, 10); markdown email body (Step 13) |
| Clock Provider | Supplies current time and event-relative time calculations (Step 12) |
| Failure Strategy Registry | Pause-and-notify behavior when storage lookups fail (Steps 6, 7) |
| Multi-Modal Output Generator | Produces paired text (Step 10) and audio (Step 11) artifacts of the same content |
| Multi-Channel Delivery Router | Routes the briefing artifact to email and chat channels (Steps 13, 14) |
| Service Connector / Identity-bound Adapter | Identity-bound bindings to all external interfaces |
| Graph Termination Node | Clears state and ends the run (Step 15) |

---

## Trigger

### Step 1: Local Event JSON Ingestion

- **Step type:** Local Trigger Parser
- **Trigger condition:** Execution of command-line tool with mock scheduler JSON event configuration
- **Concrete mechanism:** Load data payload from a local file (e.g., `test_records/event.json`)
- **Input schema (`event` object):**
  - `Event Name`
  - `Event Start` (ISO date/time)
  - `Event Duration` (minutes)
  - `Invitee Name`
  - `Invitee Electronic Address`
  - `Organizer Name`
  - `Organizer Electronic Address`
  - `Guests` (list of strings)
  - `Event Type`
- **Output:** `event` object in memory

---

## Main Flow

### Step 2: Confirmation Receipt Mock Outbox

- **Step type:** Local File Builder (Email Mock)
- **Concrete path:** `outbox/confirmations/{event-slug}.txt`
- **Recipient source:** `event.Invitee Electronic Address` (To); `event.Guests` (CC)
- **Sender identity:** Resolved from `config/sender.ts` (was: hardcoded)
- **Subject template:** `{event.Event Name} - Confirmation`
- **Slug rule:** `{event.Event Name}` lowercased, spaces → `-`, non-alphanumerics stripped.
- **Body template:**

```email
Hi {event.Invitee Name},

Your free SaaS Performance Assessment debrief, and consultation call is successfully scheduled. We are looking forward to helping you with the right insights for your success.

Event Name: {event.Event Name}
Event Start: {event.Event Start}
Duration: {event.Event Duration}

Regards,
{event.Organizer Name}
```

- **Output:** `notification1` log reference to the offline confirmation text file

### Step 3: Fetch Organization Context

- **Step type:** CSV Database Reader / Parser
- **Concrete path:** `outbox/context.csv`
- **Query:** Read local CSV rows and filter for invitee match against `event.Invitee Electronic Address`
- **Returned fields:** `Target Company Name`, `Industry`, `Size`, `Last Briefing Date`, `Context Notes`
- **Output:** `orgContext` dict row fields

### Step 4: CLI Terminal / UI Triage Prompt

- **Step type:** HITL Prompt
- **Sub-types:** Interactive stdin text query (CLI mode) OR Web UI prompt (browser mode)
- **Channel:** Running bash/cmd console window OR Web UI chat panel
- **Audience:** Local system operator running the workflow
- **Prompt:** "Any new input or additional details to be considered? (Yes / No): "
- **Input schema:** String enum (Yes / No). Field name: **`Additional Input?`**.
- **Output:** `triageResponse` object with selection field `Additional Input?`

### Step 5: Optional Supplemental Intake

- **Step type:** HITL Prompt (multi-field)
- **Channel:** Same as Step 4 (CLI or Web UI)
- **Execution condition:** Only runs if `triageResponse.Additional Input? === "Yes"`. If "No", the workflow proceeds directly to Step 6 with an empty `supplementalContext`.
- **Inputs collected:**
  1. **Free Text (Additional Information)**: Multi-line text block.
  2. **Additional Files (Contextual)**: One or more local file paths in the workspace.
  3. **Any reference URLs**: One or more URLs (text block).
- **Output:** `supplementalContext` (multi-field object; may be empty if Step 4 = "No")

### Step 6: Local Directory Resolution

- **Step type:** Directory Path Resolver
- **Concrete search root:** `assets/consultant_x/`
- **Filter (ALL):**
  - Parent directory is `assets/consultant_x/`
  - Directory name CONTAINS `orgContext.Target Company Name`
- **Failure strategy:** Pause run and notify in shell
- **Selection policy:** First match (when more than one)
- **Output:** `targetDirectory` (resolved local absolute folder path)

### Step 7: Local File Asset Retrieval

- **Step type:** Local File Locator
- **Concrete search path:** Within `targetDirectory` folder resolved in Step 6
- **Filter (ALL):**
  - Parent directory is `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS `SaaS Performance Assessment` (with `.md` extension)
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFileContent` (raw read plaintext content of the Markdown file)

### Step 8: Read File Content

- **Step type:** Local file read
- **Input:** file path from Step 7
- **Output:** `targetFileContent` (text)

> Steps 7 and 8 are split in the diagram for clarity but execute as a single read in the runtime.

### Step 9: Document Summarization Node

- **Step type:** OpenRouter LLM Client
- **Model ID:** `openai/gpt-4o`
- **Input:** `targetFileContent`
- **Output length:** A few paragraphs
- **Output format:** Plain text
- **Output:** `summary` (text)

### Step 10: Professional Briefing Generation

- **Step type:** OpenRouter LLM Client
- **Model ID:** `openai/gpt-4o`
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 9)
  - `targetFileContent` (raw source)
  - `supplementalContext.Free Text` *(optional)*
  - `supplementalContext.File uploads` *(optional)*
  - `supplementalContext.Reference URLs` *(optional)*
- **Document schema (5 sections):**
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document formatted as Markdown)

---

## Delivery Phase

### Step 11: Audio Synthesis

- **Step type:** OpenRouter TTS Client
- **Model ID:** `openai/gpt-4o-mini-tts`
- **Input:** `briefing` (markdown formatted plaintext)
- **Voice profile:** Configured voice selection (e.g., alloy, echo, fable, onyx, nova, shimmer)
- **Save destination:** `outbox/audio/briefing_temp.mp3`
- **Output:** `audioBriefingPath` (reference to local file path)

### Step 12: State-Clock Time Delay Check

- **Step type:** State Clock Tracker (Conditional Wait)
- **Behavior:** Local script scans current system time and compares against `event.Event Start`. Delays script execution loop until current system duration offset matches `event.Event Start - 24 hours`.
- **Bypass flag:** Script accepts `--bypass-delay` command line parameter to execute immediately during developer testing.
- **Output:** Execution resumes safely when conditions are met.

### Step 13: Written Briefing Delivery

- **Step type:** Local Delivery Stager
- **Mechanism:** Writes rich text Markdown file to target staging directories
- **Concrete path:** `outbox/briefings/{event-slug}_notes.md`
- **Title convention:** `{event.Event Name} - {event.Event Start}`
- **Format:** Fully formatted briefing document

### Step 14: Audio Briefing Delivery

- **Step type:** Local Delivery Stager
- **Mechanism:** Copies raw audio to target outbox directory
- **Concrete path:** `outbox/briefings/{event-slug}_audio.mp3`
- **Format:** Local offline audio MP3 file

### Step 15: End Run

- **Step type:** Ephemeral Purger
- **Trigger:** End of script execution
- **Action:** Purges temporary files (e.g., `outbox/audio/briefing_temp.mp3`) and exits gracefully

---

## Data Flow Summary

```text
Local CLI Invocation (Passing event.json Path)
    |
    v
[1] Parse meeting event JSON configuration
    |
    +---> [2] Stage meeting confirmation mail drafting output to outbox/confirmations/
    |
    +---> [3] Search context.csv spreadsheet for company name
    |
    +---> [4] Spawn live shell input requesting optional triage input (Yes / No)
              |
              +---> [5] (if Yes) Terminal asks for extra text / URLs / reference file path
              |              output: supplementalContext
              |              (if No) supplementalContext = {} (skip)
              |
              v
    [6] Resolve folders inside assets/consultant_x/
    |
    [7] Find invitee file matching "SaaS Performance Assessment"
    |
    [8] Read the markdown file
    |
    [9] Ask OpenRouter to summarize raw text
    |
    [10] Ask OpenRouter to draft 5-section briefing (with optional supplemental context)
    |
    [11] Synthesize briefing text with OpenRouter TTS and save MP3 locally
    |
    [12] Loop compared clocks until 24 hours before meeting kickoff (or --bypass-delay)
    |
    [13] File spool written markdown notes to outbox/briefings/{slug}_notes.md
    |
    [14] File spool audio briefing file to outbox/briefings/{slug}_audio.mp3
    |
    [15] Exit workflow script
```

---

## Pipeline Configuration Notes

- **Delivery window:** Briefing artifacts are spooled locally in outbox 24 hours before the scheduled event start time, unless bypassed.
- **File identification pattern:** Files are located locally under the target client subdirectories inside `assets/consultant_x/{CompanyName}/`, matching the invitee's name and containing the concrete keyword `SaaS Performance Assessment` as Markdown files.
- **Directory identification pattern:** Folders are located inside `assets/consultant_x/` matching the target company name queried from `outbox/context.csv`.
- **Briefing content structure:** All generated briefings follow the 5-section schema (Keys, Structure, Exceptions, Stakeholders, Mitigation) and include 3-5 key points and 5-7 anticipated questions with preparation "bridges".
- **Supplemental context:** Path "Yes" accepts operator additional text blocks, files, and links. Path "No" skips the intake and proceeds with an empty `supplementalContext`.
- **LLM routing:** All LLM calls are routed through **OpenRouter** using model id `openai/gpt-4o`.
- **TTS routing:** Speech synthesis is routed through **OpenRouter** using model id `openai/gpt-4o-mini-tts`, output to a local `outbox/audio/briefing_temp.mp3` file.

---

## Local Service Setup Configurations

### 1. Ingestion Config payload (Step 1)

**General logic:** Receive a structured event payload from a local scheduler or event reader whenever a meeting is booked. The payload must include at minimum: event name, start time, duration, invitee name + email, organizer name + email, list of guests, event type.

**Concrete source:** Local Event JSON Config file (e.g., `test_records/event.json`) parsed natively.

**Data shape (JSON example):**

```json
{
  "Event Name": "SaaS Performance Assessment Debrief",
  "Event Start": "2026-06-15T15:00:00Z",
  "Event Duration": "30",
  "Invitee Name": "Jane Doe",
  "Invitee Electronic Address": "jane.doe@example.com",
  "Organizer Name": "Dhilip Narayan Srinivasan",
  "Organizer Electronic Address": "dhilipnarayan@example.com",
  "Guests": ["guest1@example.com"],
  "Event Type": "Consultation"
}
```

**Open Source Setup Description:** This workflow loads scheduling metadata natively via JSON event logs in local folders. Developers and administrators can utilize standard scheduling mechanisms such as CalDAV or self-hosted scheduling engines (e.g., Cal.com) to output compliant metadata payloads directly into the workspace folder.

### 2. SMTP / Transactional Email Service (Step 2)

**General logic:** Send templated emails with merged fields. The service must support: from-address identity, To/CC/BCC, subject, HTML body.

**Concrete source:** Direct SMTP Connection or Local filesystem mock staging.

**Data shape (per send):**

```json
{
  "from": "operator@example.com",
  "to": "invitee@example.com",
  "cc": ["guest@example.com"],
  "subject": "{Event Name} - Confirmation",
  "body_html": "<p>...</p>"
}
```

**Open Source Setup Description:** SMTP operations are bound to a local SMTP gateway or configured using standard UNIX sendmail protocols. For local testing, dry-runs compile output drafts inside the `outbox/` directory as easy-to-read text or HTML assets without touching external transactional services.

### 3. Tabular Data Store / Spreadsheet Service (Step 3)

**General logic:** Read rows from a configured sheet/table. The query may match on event metadata (e.g. invitee email, company name). Returns 0+ rows.

**Concrete source:** Local standard CSV Spreadsheet database.

**Data shape (per row):**

```json
{
  "Target Company Name": "Acme Corp",
  "Industry": "Enterprise Software",
  "Size": "5000",
  "Last Briefing Date": "2026-05-15",
  "Context Notes": "..."
}
```

**Open Source Setup Description:** Relational and tabular context maps directly to `outbox/context.csv` or local SQL databases (such as SQLite), providing zero-latency reads entirely within the local workspace environment.

### 4. Hierarchical Object / File Storage (Steps 6, 7)

**General logic:** Browse a directory tree, find directories or files by name pattern. Supports parent-folder filters, title-contains filters, and pagination.

**Concrete source:** Local File System (workspace directory indexing and recursive walks).

**Filter shape (Step 6 directory lookup):**

```json
{
  "parent_folder": "assets/consultant_x",
  "name_contains": "{orgContext.Target Company Name}"
}
```

**Filter shape (Step 7 file lookup):**

```json
{
  "parent_folder": "{step6.folder}",
  "title_contains_all": ["{event.Invitee Name}", "SaaS Performance Assessment"]
}
```

**Open Source Setup Description:** This pipeline uses the local file system to store and search documents. Standard file system operations (`fs.readdir` or `os.walk`) locate target files under the `assets/consultant_x/` workspace structure.

### 5. Asynchronous HITL Gateway — Boolean (Step 4) & Multi-Field Form (Step 5)

**General logic:** Pause the workflow run until a human responds. Boolean form takes a yes/no; multi-field form takes free text, file paths, and URL text.

**Channel:** Interactive CLI Stdin Prompt OR Web UI form (Step 4 and Step 5).

**Data shape (boolean response):**

```json
{ "Additional Input?": "Yes" }
```

**Data shape (multi-field response):**

```json
{
  "Free Text (Additional Information)": "Notes here...",
  "Additional Files (Contextual)": [{"filename": "deck.pdf", "path": "local/path/to/deck.pdf"}],
  "Any reference URLs:": "https://..."
}
```

**Open Source Setup Description:** Built-in console loop readers pause the terminal execution thread, prompting the developer/operator to submit yes/no decisions and paste supplementary strings through standard stdin. The Web UI presents the same prompts as form elements.

### 6. Local Staging & Delivery (Steps 13, 14)

**General logic:** Save the finalized written and audio briefings. Must support direct writing of structured text and copy/saving of raw binary files to localized paths.

**Concrete target:** Local outbox folders.

**Data shape (per save):**

```json
{
  "notes_path": "outbox/briefings/{slug}_notes.md",
  "audio_path": "outbox/briefings/{slug}_audio.mp3"
}
```

**Open Source Setup Description:** System deliverables are staged on the local disk inside the `outbox/briefings/` directory, avoiding cloud chat platforms and providing direct access to the files via local scripts or editors.

### 7. LLM Gateway (Steps 9, 10) — OpenRouter

**General logic:** Standard OpenAI-compatible API query wrapper using the direct OpenRouter base path. The model maps to `openai/gpt-4o`.

**Data shape (request):**

```json
{
  "model": "openai/gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a professional assistant..."},
    {"role": "user", "content": "Summarize the following document..."}
  ],
  "temperature": 0.2
}
```

### 8. Text-to-Speech (TTS) Audio Synthesis Engine (Step 11)

**General logic:** Query OpenRouter's `openai/gpt-4o-mini-tts` model to generate offline audio output. No external third-party tools or separate speech accounts are required.

---

## Local Development & Testing Instructions

To run this workflow locally:

1. **Verify Files and Folders:**
   Ensure the following directory structure exists in the project root:
   - `outbox/confirmations/`
   - `outbox/briefings/`
   - `outbox/audio/`
   - `assets/consultant_x/`

2. **Populate Historical Context Spreadsheets:**
   Configure your customer context in `outbox/context.csv` with columns: `Invitee Electronic Address`, `Target Company Name`, `Industry`, `Size`, `Last Briefing Date`, `Context Notes`.

3. **Stage Consultant Client Folders:**
   Create a folder matching the target company name under `assets/consultant_x/`. Within that folder, create a briefing document matching the invitee's name, e.g., `Jane Doe SaaS Performance Assessment.md`.

4. **Execute CLI Test Script:**
   Invoke your local runner script passing the configuration:

   ```bash
   pnpm tsx src/workflows/briefing-prep/run.ts --event test_records/event.json --bypass-delay
   ```

   If `--bypass-delay` is set, the workflow will ignore scheduled offsets and generate output immediately.

5. **Interact via Console or Web UI:**
   Respond to the active triage prompts directly in your console (CLI mode) or in the Web UI (browser mode) to select the supplemental-context path or skip it.

6. **Review Local Staged Outbox:**
   - Client email draft: `outbox/confirmations/{slug}.txt`
   - Briefing MD notes: `outbox/briefings/{slug}_notes.md`
   - Synthesis briefing voice output: `outbox/briefings/{slug}_audio.mp3`
