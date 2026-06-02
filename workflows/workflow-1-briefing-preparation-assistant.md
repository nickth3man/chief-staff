# Workflow 1: Briefing Preparation Assistant

## Overview

**Purpose:** Prepare and deliver a comprehensive executive briefing before a scheduled meeting. The pipeline confirms the meeting, retrieves historical organizational context, optionally collects additional operator input, generates a written briefing, synthesizes an audio version, and delivers both before the meeting start time.

**Source:** Local execution script `Briefing Preparation Assistant` (execution id `cmd4p2exw09ca0om5hqgtbriu`)

**Step count:** 19 logical execution pipeline nodes. Step-numbering map:

| Markdown # | Node # | Role |
| --- | --- | --- |
| 1 | 1 | Trigger |
| 2 | 2 | Confirmation email |
| 3 | 3 | Org context lookup |
| 4 | 4 | HITL triage (Terminal CLI Prompt) |
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
| 18 | 18 | Stage local audio briefing |
| 19 | 19 | End run |

Both paths converge at Step 15 (TTS). Path A is the "additional input provided" path and includes the supplemental context form (Step 6); Path B is the "no additional input" path and skips the form intake, but still runs the full lookup + LLM briefing generation.

**Step groupings:** Trigger (1) / Main Flow (3) / Branching Logic (1) / Path A: Supplemental Context Processing (5) / Path B: No-Supplemental Briefing Path (4) / Delivery Phase (5)

**Source data origin (per local open-source implementation):**

- Trigger event metadata originates from a **Local JSON File** trigger load payload.
- Org context rows come from a local CSV file: `outbox/context.csv`.
- Folder/file lookups target local folder structure: `assets/consultant_x/`.
- HITL triage prompt is handled interactively via the running **CLI Terminal prompt**.
- All LLM calls are routed through **OpenRouter** (unified API gateway surface mapping to `openai/gpt-4o`).
- TTS audio synthesis uses **OpenRouter's audio models** (such as `openai/gpt-4o-audio-preview` or `openai/gpt-audio`) to generate offline audit briefings saved directly to local outbox files. No proprietary cloud systems or third-party web services are required.

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
- **Concrete path:** `outbox/confirmations/{event.Event Name}.txt`
- **Recipient source:** `event.Invitee Electronic Address` (To); `event.Guests` (CC)
- **Sender identity:** Workflow operator (configured locally)
- **Subject template:** `{event.Event Name} - Confirmation`
- **Body template (exact copy drafted to file):**

```email
Hi {event.Invitee Name},

Your free SaaS Performance Assessment debrief, and consultation call is successfully scheduled.  We are looking forward to helping you with the right insights for your success.

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
- **Returned fields:**
  - `Target Company Name` (used downstream for directory resolution)
- **Output:** `orgContext` dict row fields

### Step 4: CLI Terminal Triage Prompt

- **Step type:** Terminal HITL Prompt
- **Sub-type:** Interactive stdin text query
- **Channel:** Running bash/cmd console window
- **Audience:** Local system operator running the terminal script
- **Prompt:** "Any new input or additional details to be considered? (Yes / No): "
- **Input schema:** String enum (Yes / No). Field name: **`Additional Input?`**.
- **Output:** `triageResponse` object with selection field `Additional Input?`

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

### Step 6: Interactive Terminal Intake Prompt

- **Step type:** Terminal HITL Prompt
- **Channel:** Shell interactive stdin reader (paused wait state)
- **Inputs collected:**
  1. **Free Text (Additional Information)**: Terminal text block input
  2. **Additional Files (Contextual Path)**: Path to a local asset file in the workspace
  3. **Any reference URLs**: Terminal text block input
- **Output:** `supplementalContext` (multi-field object)

### Step 7: Local Directory Resolution

- **Step type:** Directory Path Resolver
- **Concrete search root:** [assets/consultant_x/](assets/consultant_x/)
- **Filter (ALL):**
  - Parent directory is [assets/consultant_x/](assets/consultant_x/)
  - Directory name CONTAINS `orgContext.Target Company Name`
- **Failure strategy:** Pause run and notify in shell
- **Selection policy:** First match (when more than one)
- **Output:** `targetDirectory` (resolved local absolute folder path)

### Step 8: Local File Asset Retrieval

- **Step type:** Local File Locator
- **Concrete search path:** Within `targetDirectory` folder resolved in Step 7
- **Filter (ALL):**
  - Parent directory is `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS `SaaS Company Performance Assessment` (or with `.md` extension)
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFileContent` (raw read plaintext content of the Markdown file)

### Step 9: Document Summarization Node

- **Step type:** OpenRouter LLM Client
- **Model ID:** `openai/gpt-4o` (customizable)
- **Input:** `targetFileContent`
- **Output length:** A few paragraphs
- **Output format:** Plain text
- **Output:** `summary` (text)

### Step 10: Professional Briefing Generation

- **Step type:** OpenRouter LLM Client
- **Model ID:** `openai/gpt-4o` (customizable)
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 9)
  - `supplementalContext.Free Text`
  - `supplementalContext.File uploads`
  - `supplementalContext.Reference URLs`
  - `targetFileContent` (raw source)
- **Document schema (5 sections):**
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document formatted as Markdown)

---

## Path B: No-Supplemental Briefing Path

Path B runs when the operator answers "No" to the Step 4 triage (i.e. no additional input is needed). It mirrors Path A's lookup + briefing flow but **skips the supplemental context intake form** (Step 6 in Path A) — the briefing is generated from the file alone, with no free-text / file-upload / URL augmentation.

### Step 11: Local Directory Resolution (Path B)

- **Step type:** Directory Path Resolver (identical to Step 7)
- **Concrete search root:** [assets/consultant_x/](assets/consultant_x/)
- **Filter (ALL):**
  - Parent directory is [assets/consultant_x/](assets/consultant_x/)
  - Directory name CONTAINS `orgContext.Target Company Name`
- **Failure strategy:** Pause run and notify in shell
- **Selection policy:** First match
- **Output:** `targetDirectory` (resolved local folder path)

### Step 12: Local File Asset Retrieval (Path B)

- **Step type:** Local File Locator (identical to Step 8)
- **Concrete search path:** Within `targetDirectory` folder resolved in Step 11
- **Filter (ALL):**
  - Parent directory is `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS `SaaS Company Performance Assessment`
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFileContent` (raw read plaintext content of the Markdown file)

### Step 13: Document Summarization Node (Path B)

- **Step type:** OpenRouter LLM Client (identical to Step 9)
- **Model ID:** `openai/gpt-4o`
- **Input:** `targetFileContent` (no supplemental context in Path B)
- **Output length:** A few paragraphs
- **Output format:** Plain text
- **Output:** `summary` (text)

### Step 14: Professional Briefing Generation (Path B)

- **Step type:** OpenRouter LLM Client (identical to Step 10)
- **Model ID:** `openai/gpt-4o`
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 13)
  - `targetFileContent` (raw source)
  - *(No supplementalContext inputs in Path B — that data is only populated in Path A.)*
- **Document schema (5 sections):** same as Step 10 (Path A version):
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document formatted as Markdown)

> **Note on relay.app numbering vs. markdown numbering:** In the relay.app canvas, these Path B steps are numbered 11, 12, 13, 14. The markdown above follows the **logical** step ordering (where the 5-section briefing pattern reuses the same numbering as Path A for clarity), so the markdown's "Step 11" through "Step 14" refer to Path B's lookup + briefing. After Path B completes, the merge to the post-branch phase is at markdown Step 15 / relay.app Step 15 (TTS), and so on.

---

## Delivery Phase

### Step 15: Audio Synthesis

- **Step type:** OpenRouter TTS Client
- **Model ID:** `openai/gpt-4o-audio-preview` or other audio generation options (OpenAI audio modalities)
- **Input:** `briefing` (markdown formatted plaintext)
- **Voice profile:** Configured voice selection (e.g., alloy, echo, fable, onyx, nova, shimmer)
- **Save destination:** [outbox/briefings/briefing_temp.mp3](outbox/briefings/briefing_temp.mp3)
- **Output:** `audioBriefingPath` (reference to local file path)

### Step 16: State-Clock Time Delay Check

- **Step type:** State Clock Tracker (Conditional Wait)
- **Behavior:** Local script scans current system time and compares against `event.Event Start`. Delays script execution loop until current system duration offset matches `event.Event Start - 24 hours`.
- **Bypass flag:** Script accepts `--bypass-delay` command line parameter to execute immediately during developer testing.
- **Output:** Execution resumes safely when conditions are met.

### Step 17: Written Briefing Delivery

- **Step type:** Local Delivery Stager
- **Mechanism:** Writes rich text Markdown file to target staging directories
- **Concrete path:** [outbox/briefings/{event.Event Name}_Notes.md](outbox/briefings/{event.Event Name}_Notes.md)
- **Title convention:** `{event.Event Name} - {event.Event Start}`
- **Format:** Fully formatted briefing document

### Step 18: Audio Briefing Delivery

- **Step type:** Local Delivery Stager
- **Mechanism:** Copies raw audio to target outbox directory
- **Concrete path:** [outbox/briefings/{event.Event Name}_Audio.mp3](outbox/briefings/{event.Event Name}_Audio.mp3)
- **Format:** Local offline audio MP3 file

### Step 19: End Run

- **Step type:** Ephemeral Purger
- **Trigger:** End of script execution
- **Action:** Purges temporary temporary files and exits gracefully

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
              +---> [5] Direct route chosen:
                        |
                        +---> YES (Path A):
                        |       [6] Terminal asks for extra text / URLs / reference file path
                        |       [7] Resolve folders inside assets/consultant_x/
                        |       [8] Find invitee file SaaS Company Performance Assessment.md
                        |       [9] Ask OpenRouter to summarize raw text
                        |       [10] Ask OpenRouter to draft 5-section briefing
                        |
                        +---> NO (Path B):
                                [11] Resolve folders inside assets/consultant_x/
                                [12] Find invitee file SaaS Company Performance Assessment.md
                                [13] Ask OpenRouter to summarize raw text
                                [14] Ask OpenRouter to draft 5-section briefing
    |
    v
[15] Synthesize briefing text with OpenRouter TTS and save MP3 locally
    |
    [16] Loop compared clocks until 24 hours before meeting kickoff
    |
    [17] File spool written markdown notes to outbox/briefings/{Event}_Notes.md
    |
    [18] File spool audio briefing file to outbox/briefings/{Event}_Audio.mp3
    |
    [19] Exit workflow script
```

---

## Pipeline Configuration Notes

- **Delivery window:** Briefing artifacts are spooled locally in outbox 24 hours before the scheduled event start time, unless bypassed.
- **File identification pattern:** Files are located locally under the target client subdirectories inside [assets/consultant_x/](assets/consultant_x/), matching the invitee's name and containing the concrete keyword `SaaS Company Performance Assessment` as simple Markdown files.
- **Directory identification pattern:** Folders are located inside [assets/consultant_x/](assets/consultant_x/) matching the target company name queried from [outbox/context.csv](outbox/context.csv).
- **Briefing content structure:** All generated briefings follow the 5-section schema (Keys, Structure, Exceptions, Stakeholders, Mitigation) and include 3-5 key points and 5-7 anticipated questions with preparation "bridges".
- **Path difference:** Path A accepts operator additional text blocks, files, and links inside the running active terminal context. Path B skips all operator triage prompts.
- **LLM routing:** All LLM calls are routed through **OpenRouter** using model id `openai/gpt-4o`.
- **TTS routing:** Speech synthesis is routed through **OpenRouter's audio models** and output to a local [outbox/briefings/briefing_temp.mp3](outbox/briefings/briefing_temp.mp3) file.

---

## Local Service Setup Configurations

These configurations outline how to run and manage local, offline-capable bindings.

### 1. Ingestion Config payload (Step 1)

**General logic:** Receive a structured event payload from an open-source scheduler or event reader whenever a meeting is booked. The payload must include at minimum: event name, start time, duration, invitee name + email, organizer name + email, list of guests, event type.

**Concrete source:** Local Event JSON Config file (e.g., `test_records/event.json`) parsed natively.

**Data shape (JSON example):**

```json
{
  "Event Name": "SaaS Performance Assessment — Debrief",
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

### 2. SMTP / Transactional Email Service (Steps 2, 6, 13)

**General logic:** Send templated emails with merged fields and optional file attachments. The service must support: from-address identity, To/CC/BCC, subject, HTML body, attachments, and (for Step 6) local directory text file loading or local prompt input.

**Concrete source:** Direct SMTP Connection or Local filesystem mock staging.

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

**Open Source Setup Description:** SMTP operations are bound to a local SMTP gateway or configured using standard UNIX sendmail protocols. For local testing, dry-runs compile output drafts inside the `outbox/` directory as easy-to-read text or HTML assets without touching external transactional services.

### 3. Tabular Data Store / Spreadsheet Service (Step 3)

**General logic:** Read rows from a configured sheet/table. The query may match on event metadata (e.g. invitee email, company name). Returns 0+ rows.

**Concrete source:** Local standard CSV Spreadsheet database.

**Data shape (per row):**

```json
{
  "Target Company Name": "Acme Corp",
  "Industry": "SaaS",
  "Primary Contact": "Jane Doe",
  "Notes": "..."
}
```

**Open Source Setup Description:** Relational and tabular context maps directly to [outbox/context.csv](outbox/context.csv) or local SQL databases (such as SQLite), providing zero-latency reads entirely within the local workspace environment.

### 4. Hierarchical Object / File Storage (Steps 7, 8)

**General logic:** Browse a directory tree, find directories or files by name pattern. Supports parent-folder filters, title-contains filters, and pagination.

**Concrete source:** Local File System (workspace directory indexing and recursive walks).

**Filter shape (Step 7 directory lookup):**

```json
{
  "parent_folder": "assets/consultant_x",
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

**Open Source Setup Description:** This pipeline uses the local file system to store and search documents. Standard file system operations (`fs.readdir` or `os.walk`) locate target files under the [assets/consultant_x/](assets/consultant_x/) workspace structure.

### 5. Asynchronous HITL Gateway — Boolean (Step 4) & Multi-Field Form (Step 6)

**General logic:** Pause the workflow run until a human responds. Boolean form takes a yes/no; multi-field form takes free text, file paths, and URL text.

**Channel:** Interactive CLI Stdin Prompt (Steps 4 and 6).

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

**Open Source Setup Description:** Built-in console loop readers pause the terminal execution thread, prompting the developer/operator to submit yes/no decisions and paste supplementary strings through standard stdin.

### 6. Local Staging & Delivery (Steps 17, 18)

**General logic:** Save the finalized written and audio briefings. Must support direct writing of structured text and copy/saving of raw binary files to localized paths.

**Concrete target:** Local outbox folders.

**Data shape (per save):**

```json
{
  "notes_path": "outbox/briefings/{Event Name}_Notes.md",
  "audio_path": "outbox/briefings/{Event Name}_Audio.mp3"
}
```

**Open Source Setup Description:** System deliverables are staged on the local disk inside the [outbox/briefings/](outbox/briefings/) directory, avoiding cloud chat platforms and providing direct access to the files via local scripts or editors.

### 7. LLM Gateway (Steps 9, 10, 13, 14) — OpenRouter

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

### 8. Text-to-Speech (TTS) Audio Synthesis Engine (Step 15)

**General logic:** Query OpenRouter audio models (e.g. `openai/gpt-4o-audio-preview` or audio modality parameters) to generate offline audio output. No external third-party tools or separate speech accounts are required.

---

## Local Development & Testing Instructions

To run this workflow locally:

1. **Verify Files and Folders:**
   Ensure the following directory structure exists in the project root:
   - [outbox/confirmations/](outbox/confirmations/)
   - [outbox/briefings/](outbox/briefings/)
   - [assets/consultant_x/](assets/consultant_x/)

2. **Populate Historical Context Spreadsheets:**
   Configure your customer context in [outbox/context.csv](outbox/context.csv) with columns: `Invitee Electronic Address` and `Target Company Name`.

3. **Stage Consultant Client Folders:**
   Create a folder matching the target company name under [assets/consultant_x/](assets/consultant_x/). Within that folder, create a briefing document matching the invitee's name, e.g., `Jane Doe SaaS Company Performance Assessment.md`.

4. **Execute CLI Test Script:**
   Invoke your local runner script passing the configuration:

   ```bash
   python scripts/run_briefing_assistant.py --event test_records/event.json --bypass-delay
   ```

   If bypass-delay is set, the workflow will ignore scheduled offsets and generate output immediately.

5. **Interact via Console:**
   Respond to the active triage prompts directly in your console to select Path A (for entering extra context) or Path B (for standard briefing).

6. **Review Local Staged Outbox:**
   - Client email draft: Check [outbox/confirmations/Debrief - Jane Doe Consulting.txt](outbox/confirmations/Debrief%20-%20Jane%20Doe%20Consulting.txt)
   - Briefing MD notes: Check [outbox/briefings/Debrief - Jane Doe Consulting_Notes.md](outbox/briefings/Debrief%20-%20Jane%20Doe%20Consulting_Notes.md)
   - Synthesis briefing voice output: Check [outbox/briefings/Debrief - Jane Doe Consulting_Audio.mp3](outbox/briefings/Debrief%20-%20Jane%20Doe%20Consulting_Audio.mp3)
