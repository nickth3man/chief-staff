# Workflow 4: Meeting Follow-Up — Notes & Draft Follow-up Email (Local Open-Source Edition)

## Overview

**Purpose:** Automated meeting follow-up pipeline built for offline, sandbox execution. When a raw transcript file is dropped into a watched directory, the pipeline extracts meeting metadata, rewrites the raw transcript into client-ready meeting notes, saves the formatted markdown document as a per-meeting file, produces a draft email text buffer, appends action items as rows to a tasks CSV, and adds a kanban trace card for team visibility.

**Source Code Reference:** Managed locally in your code project, replacing the previous cloud workflow integrations.

**Step count:** 12

---

## Local Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Local Directory Watcher | Monitors file additions inside `assets/transcripts/` (Step 1) |
| OpenRouter LLM Schema Extractor | Extracts attendee rosters and emails using `google/gemini-2.5-flash` (Step 2) |
| OpenRouter LLM Transcription Refiner | Transforms messy text into clean Markdown notes using `openai/gpt-4o` (Step 3) |
| Per-Meeting Document Stager | Writes one file per meeting into `assets/meeting-documents/{slug}-{ts}.md` (Step 4) |
| Latest-Pointer Updater | Updates `outbox/meeting_notes/meeting_notes.md` as a "latest" symlink/pointer (Step 5) |
| OpenRouter LLM Email Composer | Drafts professional email recap blocks under 200 words (Step 6) |
| Text Draft Archiver | Appends draft blocks and recipient fields to `outbox/drafts/email_draft.txt` (Step 7) |
| Local Database Appender (Tasks) | Registers task rows inside `outbox/tasks.csv` (Step 8) |
| Local Visual Board Registrar | Appends structured Kanban lines to `outbox/kanban_cards.csv` (Step 9) |
| Run Log Writer | Records run state in `outbox/runs/{runId}.json` (Step 10) |
| Cost Appender | Adds the run to `metrics/cost.csv` (Step 11) |
| Run State Purger | Cleans up transient state files (Step 12) |

---

## Trigger

### Step 1: Local Directory Watcher

- **Step type:** Local Directory Watcher (using `chokidar` in Node.js)
- **Trigger condition:** Detection of new `.txt` file additions inside `assets/transcripts/`
- **Watched events:** `add` (new file). `change` is ignored to avoid duplicate processing.
- **Debounce:** 1 second debounce on the same path to absorb partial writes.
- **Input schema:**
  - File Name
  - File Path (absolute)
  - File Content (read on trigger)
  - Creation Timestamp (file mtime)

> **Note:** Previous version watched a singleton file `test_records/transcript.txt`. That has been replaced by a directory watcher. The first run after this change processes any pre-existing files in `assets/transcripts/` and then watches for new ones.

---

## Node Group 1: Metadata Extraction & Document Generation

### Step 2: OpenRouter Schema Extraction

- **Step type:** OpenRouter LLM Client (`google/gemini-2.5-flash`)
- **Action:** Scans raw transcript content and extracts structural metadata:
  - Meeting Name
  - Attendee names and email list (extracted from "Speaker Key:" header when present, otherwise inferred)
  - Meeting Date (when explicit; otherwise left for Step 3 to fill in)
- **Output:** `meetingMetadata` (object)

### Step 3: OpenRouter Transcription Polish

- **Step type:** OpenRouter LLM Client (`openai/gpt-4o`)
- **Prompt workflow:** Transforms raw transcripts into client-ready markdown notes
- **Template Layout (8 sections):**
  1. **Date** (from Step 2 or generated)
  2. **Meeting Name**
  3. **Attendees** (name + email in `name <email>` format)
  4. **Attachments** (auto-populated with the source transcript path)
  5. **Summary / Key Decisions**
  6. **Actions** (renders as a Markdown Table: `Action Item | Owner | Date`)
  7. **Details**
  8. **Ideas for later**

### Step 4: Per-Meeting Document Stager

- **Step type:** Local File Writer
- **Filename pattern:** `{slug}-{YYYYMMDDHHmmss}.md`
  - `{slug}` = meeting name lowercased, non-alphanumerics stripped, spaces → `-`
  - `{timestamp}` = file creation timestamp formatted in local time
- **Concrete path:** `assets/meeting-documents/{slug}-{ts}.md`
- **Format:** UTF-8 markdown, fully formatted per Step 3 template

### Step 5: Latest-Pointer Updater

- **Step type:** Local File Writer (overwrite)
- **Concrete path:** `outbox/meeting_notes/meeting_notes.md`
- **Mechanism:** Writes a small "latest" pointer file with a link to the per-meeting file plus a one-paragraph summary. Overwrites on each new meeting so the Web UI can render "the most recent meeting" trivially.

---

## Node Group 2: Downstream Task & Tracking Provisioning

### Step 6: OpenRouter Email Draft Compiler

- **Step type:** OpenRouter LLM Client (`anthropic/claude-3-5-sonnet-latest`)
- **Goal:** Drafts the professional email recap block (must be under 200 words) referencing the static document link
- **Structure:** Thank, Key Takeaways, Action Items, closing line ("Let me know if I missed anything. Looking forward to our next call.")

### Step 7: Draft Staging Storage

- **Step type:** Text Draft Archiver (append; one block per meeting separated by `---` lines)
- **Concrete path:** `outbox/drafts/email_draft.txt`
- **Format per block:**
  ```
  To: <attendees>
  Cc: <organizer if not in To>
  Subject: <Meeting Name> - Meeting Notes & Follow-up Actions
  Body:
  <200-word email>

  ---

  ```

### Step 8: Action Item Database Append

- **Step type:** Local Database Appender (Tasks)
- **Action:** Extracts the Action Items table generated in Step 3 and appends one row per action to `outbox/tasks.csv`
- **Columns:** `Task ID` (auto-generated `TSK-{n}`), `Title`, `Details`, `Status` (`Pending Review`), `Created Date` (today)

### Step 9: Visual Board Tracking

- **Step type:** Local Visual Board Registrar
- **Action:** Appends one visual trace card per meeting to `outbox/kanban_cards.csv`
- **Columns:** `Card ID` (auto-generated `KNB-{n}`), `Title`, `Description`, `List Name` (`Done` once the notes are persisted), `Created Date`

---

## Cross-cutting: Run Log, Cost, Cleanup

### Step 10: Run Log Writer

- **Step type:** Local JSON writer
- **Concrete path:** `outbox/runs/{runId}.json`
- **Schema:** `runId, workflow: "meeting-followup", sourceFile, startedAt, endedAt, tokensIn, tokensOut, costUsd, status, meetingSlug`

### Step 11: Cost Append

- **Step type:** Local CSV appender
- **Concrete path:** `metrics/cost.csv`
- **Schema:** `Date, Workflow, Model, TokensIn, TokensOut, CostUsd`

### Step 12: Run State Purger

- **Step type:** Ephemeral purger
- **Action:** Removes any transient `*.tmp` files in the watched directory. The source transcript is **not** deleted (it stays in `assets/transcripts/` for audit).

---

## Data Flow Summary

```text
Raw meeting transcript detected inside assets/transcripts/
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
    +---> [4] Per-Meeting Document Stager
    |       - Writes assets/meeting-documents/{slug}-{ts}.md
    |
    +---> [5] Latest-Pointer Updater
    |       - Overwrites outbox/meeting_notes/meeting_notes.md
    |
    +=== NODE GROUP 2: Downstream Task & Tracking Provisioning ===+
    |                                                              |
    +---> [6] OpenRouter Email Draft Compiler (anthropic/claude-3-5-sonnet-latest)
    |       - High-fidelity follow-up email (<200 words)
    |
    +---> [7] Draft Staging Storage
    |       - Appends email block to outbox/drafts/email_draft.txt
    |
    +---> [8] Local Database Task Appender
    |       - Records outstanding actions in outbox/tasks.csv
    |
    +---> [9] Local Visual Board Registrar
    |       - Tracks card lines inside outbox/kanban_cards.csv
    |
    +=== CROSS-CUTTING ===+
    +---> [10] Run log writer (outbox/runs/{runId}.json)
    +---> [11] Cost append (metrics/cost.csv)
    +---> [12] Cleanup (transient .tmp files)
```

---

## Pipeline Configuration Notes

- **Trigger source:** Watches the directory `assets/transcripts/` for new `.txt` file drops. Each new file triggers a separate workflow run with a unique `runId`.
- **Sequential LLM Chain:** Three sequential OpenRouter calls:
  - Step 2: Schema extraction (`google/gemini-2.5-flash`)
  - Step 3: Document formatting (`openai/gpt-4o`)
  - Step 6: Follow-up email drafting (`anthropic/claude-3-5-sonnet-latest`)
- **Document structure (8 sections):** Date, Meeting Name, Attendees, Attachments, Summary / Key Decisions, Actions (markdown table), Details, Ideas for Later.
- **Action items format:** Markdown table: `Action Item | Owner | Date`.
- **Email drafting constraints:** Must be under 200 words, start with a thank-you / review notice, conclude with: "Let me know if I missed anything. Looking forward to our next call."
- **Draft staging:** Appended (one block per meeting) to `outbox/drafts/email_draft.txt` for operator review. No direct transmissions occur.
- **Task log persistence:** Outstanding actions appended as new records within `outbox/tasks.csv`.
- **Visual Kanban tracking:** Meeting traces added as row records inside `outbox/kanban_cards.csv`.
- **Sender address:** Resolved from `config/sender.ts` (no longer hardcoded).
- **Run ID threading:** All writes are tagged with a `runId`; the per-meeting filename includes the run timestamp so multiple meetings on the same day do not collide.

---

## Issues & Caveats Carried Forward (Resolved in v2)

1. ~~Bare "@" mention in Step 4~~ — Resolved; the new Step 4 uses the auto-generated slug.
2. ~~HITL switch in Step 3 is off~~ — The "approve or request edits" prompt-text is preserved as an optional CLI flag (`--require-approval`); the default is still auto-continue.
3. ~~Model upgrades~~ — Resolved; model slugs are now canonical and live in `config/workflows.ts`.
4. ~~Connection and Environment Binding~~ — Resolved; `.env.example` documents all required variables.
5. ~~Step configurations requiring setup~~ — Resolved; all paths are now in `config/paths.ts`.
6. ~~Process notes scope~~ — Resolved; the process diagram is now the source of truth and matches the implementation.
7. ~~Sender address hardcoded~~ — Resolved; sender is resolved from `config/sender.ts`.

---

## Local Development & Testing Instructions

To run this meeting follow-up pipeline locally:

1. **Verify Files Structure:**
   Identify the presence of all active workspace resources:
   - Watched source: `assets/transcripts/`
   - Per-meeting output: `assets/meeting-documents/`
   - Latest pointer: `outbox/meeting_notes/meeting_notes.md`
   - Staged email drafts: `outbox/drafts/email_draft.txt`
   - Tasks register: `outbox/tasks.csv`
   - Board registrar: `outbox/kanban_cards.csv`
   - Run logs: `outbox/runs/`
   - Cost register: `metrics/cost.csv`

2. **Start the Watcher:**
   ```bash
   pnpm tsx src/workflows/meeting-followup/run.ts
   ```
   The watcher runs as a long-lived process. Stop with Ctrl-C.

3. **Drop a Transcript:**
   Copy a `.txt` file into `assets/transcripts/`. The watcher picks it up within 1 second.

4. **Verify Generated Staging Artifacts:**
   Check the output files to confirm:
   - Per-meeting notes: `assets/meeting-documents/{slug}-{ts}.md`
   - Latest pointer: `outbox/meeting_notes/meeting_notes.md`
   - Appended email draft block: `outbox/drafts/email_draft.txt`
   - Appended actions: `outbox/tasks.csv`
   - Visual board row: `outbox/kanban_cards.csv`
   - Run log: `outbox/runs/{runId}.json`

5. **Replay Existing Transcripts:**
   For replay (e.g., re-processing fixtures), pass `--once` and a path:
   ```bash
   pnpm tsx src/workflows/meeting-followup/run.ts --once assets/transcripts/acme-2026-06-07.txt
   ```
