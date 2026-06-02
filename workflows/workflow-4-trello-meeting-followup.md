# Workflow 4: Meeting Follow-Up — Notes & Draft Follow-up Email (Local Open-Source Edition)

## Overview

**Purpose:** Automated meeting follow-up pipeline built for offline, sandbox execution. When a raw transcript file is deposited into a local watched folder, the pipeline programmatically extracts meeting metadata, rewrites raw transcripts into clients-ready meeting notes, saves the formatted markdown document, produces draft message text file buffers, appends action items as rows to a task database, and structures kanban trace lines inside local visual board records.

**Source Code Reference:** Managed locally in your code project, replacing the previous cloud workflow integrations.

---

## Local Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Local Directory Watcher | Monitors file additions inside [test_records/transcript.txt](test_records/transcript.txt) (Step 1) |
| OpenRouter LLM Schema Extractor | Extracts attendee rosters and emails using gemini-2.5-flash (Step 2) |
| OpenRouter LLM Transcription Refines | Transforms messy text into clean Markdown notes using gpt-4o (Step 3) |
| Static Document Stager | Saves formatted notes directly inside [outbox/meeting_notes/meeting_notes.md](outbox/meeting_notes/meeting_notes.md) (Step 4) |
| Local File Organizer | Houses organized documents within the offline outbox structure (Step 5) |
| OpenRouter LLM Email Composer | Drafts professional email recap blocks under 200 words (Step 6) |
| Text Draft Archiver | Appends draft blocks and recipient fields to [outbox/drafts/email_draft.txt](outbox/drafts/email_draft.txt) (Step 7) |
| Local Database Appender (Tasks) | Registers task rows inside [outbox/tasks.csv](outbox/tasks.csv) (Step 8) |
| Local Visual Board Registrar | Appends structured Kanban lines to [outbox/kanban_cards.csv](outbox/kanban_cards.csv) (Step 9) |

---

## Trigger

### Step 1: Local Directory Watcher

- **Step type:** Local Directory Watcher
- **Trigger condition:** Detection of raw transcript additions inside [test_records/transcript.txt](test_records/transcript.txt)
- **Input schema:**
  - File Name
  - File Content (the text transcript payload)
  - Creation Timestamp

---

## Node Group 1: Metadata Extraction & Document Generation

### Step 2: OpenRouter Schema Extraction

- **Step type:** OpenRouter LLM Client (`google/gemini-2.5-flash`)
- **Action:** Scans raw transcript content and extracts structural metadata:
  - Meeting Name
  - Attendee names and email list
- **Output:** structured meeting context metadata

### Step 3: OpenRouter Transcription Polish

- **Step type:** OpenRouter LLM Client (`openai/gpt-4o`)
- **Prompt workflow:** Transforms raw transcripts into clients-ready markdown notes
- **Template Layout (8 sections):**
  - **Date** (generated programmatically)
  - **Meeting Name**
  - **Attendees**
  - **Attachments**
  - **Summary / Key Decisions**
  - **Actions** (renders as a Markdown Table containing: Action Item \| Owner \| Date)
  - **Details**
  - **Ideas for later**

### Step 4 & 5: Static Document Persistence

- **Step type:** Static Document Stager & File Organizer
- **Action:** Writes the compiled, structured Markdown briefing notes file
- **Target folder:** [outbox/meeting_notes/meeting_notes.md](outbox/meeting_notes/meeting_notes.md)

---

## Node Group 2: Downstream Task & Tracking Provisioning

### Step 6: OpenRouter Email Draft Compiler

- **Step type:** OpenRouter LLM Client (`anthropic/claude-3.5-sonnet`)
- **Goal:** Drafts the professional email recap block (must be under 200 words) referencing the static document link

### Step 7: Draft Staging Storage

- **Step type:** Text Draft Archiver
- **Action:** Stages email content (To, Subject, Body) as raw flat-text inside [outbox/drafts/email_draft.txt](outbox/drafts/email_draft.txt)

### Step 8: Action Item Database Append

- **Step type:** Local Database Appender (Tasks)
- **Action:** Extracts table actions generated in Step 3 and programmatically appends rows to [outbox/tasks.csv](outbox/tasks.csv) with columns: `Task ID`, `Title`, `Details`, `Status` (`Pending Review`), `Created Date`

### Step 9: visual Board Tracking

- **Step type:** Local Visual Board Registrar
- **Action:** Appends visual trace cards representing the meeting visibility context to [outbox/kanban_cards.csv](outbox/kanban_cards.csv).

---

## Data Flow Summary

```text
Raw meeting transcript detected inside test_records/transcript.txt
    |
    v
[1] Raw file metadata and text content
    |
    +=== NODE GROUP 1: Metadata Extraction & Document Generation ===+
    |                                                                |
    +---> [2] OpenRouter Schema Extraction LLM (google/gemini-2.5-flash)
    |       - Extracts attendee roster and meeting tags
    |
    +---> [3] OpenRouter Transcription Polish LLM (openai/gpt-4o)
    |       - Generates structured client-ready markdown meeting notes
    |
    +---> [4 & 5] Static Document Persister
    |       - Saves static notes directly inside outbox/meeting_notes/meeting_notes.md
    |
    +=== NODE GROUP 2: Downstream Task & Tracking Provisioning ===+
    |                                                              |
    +---> [6] OpenRouter Email Draft Compiler (anthropic/claude-3.5-sonnet)
    |       - High-fidelity follow-up email (<200 words)
    |
    +---> [7] Draft Staging Storage
    |       - Writes email headers and body inside outbox/drafts/email_draft.txt
    |
    +---> [8] Local Database Task Appender
    |       - Records outstanding actions in outbox/tasks.csv
    |
    +---> [9] Local Visual Board Registrar
            - Tracks card lines inside outbox/kanban_cards.csv
```

---

## Pipeline Configuration Notes

- **Trigger source:** Detects additions or modifications inside the raw [test_records/transcript.txt](test_records/transcript.txt) file.
- **Sequential LLM Chain:** Employs three sequential OpenRouter calls:
  - Step 2: Schema extraction (`google/gemini-2.5-flash`)
  - Step 3: Document formatting (`openai/gpt-4o`)
  - Step 6: Follow-up email drafting (`anthropic/claude-3.5-sonnet`)
- **Document structure (8 sections):** Date, Meeting Name, Attendees, Attachments, Summary / key decisions, Actions (markdown table), Details, Ideas for later.
- **Action items format:** Formatted as a Markdown table: Action Item \| Owner \| Date.
- **Email drafting constraints:** Must be under 200 words, starting with a review notice, concluding with: "Let me know if I missed anything. Looking forward to our next call."
- **Draft staging:** Written directly to [outbox/drafts/email_draft.txt](outbox/drafts/email_draft.txt) for operator review. No direct transmissions will occur.
- **Task log persistence:** Outstanding actions appended as new records within [outbox/tasks.csv](outbox/tasks.csv).
- **visual Kanban tracking:** Meeting traces added as row records inside [outbox/kanban_cards.csv](outbox/kanban_cards.csv).

---

## Local Development & Testing Instructions

To run this meeting follow-up pipeline locally:

1. **Verify Files Structure:**
   Identify the presence of all active workspace resources:
   - Sample raw transcript: [test_records/transcript.txt](test_records/transcript.txt)
   - Staged meeting notes: [outbox/meeting_notes/meeting_notes.md](outbox/meeting_notes/meeting_notes.md)
   - Staged email drafts: [outbox/drafts/email_draft.txt](outbox/drafts/email_draft.txt)
   - Tasks register: [outbox/tasks.csv](outbox/tasks.csv)
   - Board registrar: [outbox/kanban_cards.csv](outbox/kanban_cards.csv)

1. **Prepare Transcript Target:**
   Overwrite the raw meeting text inside [test_records/transcript.txt](test_records/transcript.txt).

1. **Execute Follow-Up Script:**
   Launch the workspace python or node script:

   ```bash
   python scripts/meeting_followup.py --transcript test_records/transcript.txt
   ```

1. **Verify Generated Staging Artifacts:**
   Check the output files to confirm:
   - Polished notes in [outbox/meeting_notes/meeting_notes.md](outbox/meeting_notes/meeting_notes.md)
   - Formatted email drafts in [outbox/drafts/email_draft.txt](outbox/drafts/email_draft.txt)
   - Appended actions inside [outbox/tasks.csv](outbox/tasks.csv)
   - Visual board rows inside [outbox/kanban_cards.csv](outbox/kanban_cards.csv)

### 10. Asynchronous HITL Gateway (Step 3, implicit)

**General logic:** The Step 3 prompt ends with "ask the user to approve them or request edits." This is an implicit HITL gate. In the running application, this HITL gate is purely text-based and the workflow continues automatically.

**Port behavior:** Either (a) keep the gate as prompt-text and continue automatically, or (b) implement a real filesystem pause (a localized interactive CLI confirmation) where the user must press Enter or enter 'yes' in the terminal before continuing to stage email and task edits.

### 11. Recipient Address Resolver (Step 7)

**General logic:** Resolve recipient names in the attendee roster to standard electronic addresses. Since the LLM extraction in Step 2 retrieves attendee email addresses automatically, these are used directly for staging-mail header generation.

### 12. Document Format Renderer (Steps 3, 4, 6)

**General logic:** Render structured markdown or text blocks into target local documents, standard emails, or visual tracking datasets.

### 13. Failure Strategy Registry (Step 1)

**General logic:** Trigger and proceed on newly deposited files. For local testing, any additions to the target paths execute immediately, logging skipped or non-compliant logs to stderr without halting the watcher loop.

---

## Issues & Caveats Carried Forward

1. **Bare "@" mention in Step 4:** The original instructions append a literal "@" with no mention target. The port should either remove it or replace with `@operator-email` or similar.
1. **HITL switch in Step 3 is off:** The "approve or request edits" prompt-text does not actually pause the run. Downstream staging (Steps 4–9) executes unconditionally.
1. **Model upgrades:** Traditional pipelines recommended older model endpoints. The open-source port utilizes high-capability models (such as `google/gemini-2.5-flash` and `openai/gpt-4o`) via OpenRouter to ensure robust, modern extractions.
1. **Connection and Environment Binding:** Modern runners must explicitly bind their local environment variables (including OpenRouter API keys) to the execution context.
1. **Step configurations requiring setup:** Setup parameters should be specified in a local environment or JSON config, including the watched folder path, the target email staging files, and targets for tasks and visual boards.
1. **Process notes scope:** The process diagram shows broader details (monitoring folder drops and syncing visual spreadsheets) that the logical steps implement natively via standard file IO and watcher events.
1. **Sender address hardcoded:** The sender email is set to a default value in Step 7. This should be made configurable using local environment files or configuration variables.
