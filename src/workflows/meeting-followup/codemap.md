# src/workflows/meeting-followup/

## Responsibility
Meeting follow-up automation (WF4). Monitors a transcripts directory for new `.txt` files, processes each through a 3-stage LLM pipeline — metadata extraction, note polishing, and email drafting — and produces structured outputs: a Markdown meeting notes file, an email draft appended to the outbox, task rows appended to a CSV, and a Kanban card entry. Supports both one-shot (`--once <path>`) and long-running watcher modes.

## Design
- **4-module architecture**: `run.ts` (CLI entry), `watcher.ts` (filesystem watcher), `steps.ts` (orchestration + Markdown/email renderers), `prompts.ts` (LLM prompt templates + extraction/parsing logic).
- **Dual execution modes**:
  - `--once <path>`: Process a single transcript file synchronously, then exit.
  - No `--once`: Start a `chokidar` watcher on `paths.assets.transcripts`, processing every `.txt` file as it appears (including existing files at startup via `ignoreInitial: false`). Runs indefinitely until SIGINT.
- **3-stage LLM pipeline with specialised models**: Each stage uses a distinct model from `MODELS.wf4`:
  1. **Metadata extraction** (`MODELS.wf4.schema`): Extracts `meetingName`, `attendees[]` (with email), and `date` from the transcript header via `responseFormat: 'json'`. 180s deadline.
  2. **Note polishing** (`MODELS.wf4.llm`): Produces an 8-section Markdown document (Date, Meeting Name, Attendees, Attachments, Summary/Key Decisions, Actions table, Details, Ideas for Later). 180s deadline.
  3. **Email drafting** (`MODELS.wf4.email`): Generates a structured email JSON (to, cc, subject, body) for follow-up distribution. 180s deadline.
- **Markdown section parsing**: After the LLM returns polished Markdown, `polishNotes()` parses it with regex-based section extractors (`extractSection`, `extractBulletSection`, `extractActionsFromMarkdown`) to populate the typed `MeetingNotes` schema. This dual approach (LLM writes Markdown, code re-parses it) provides a human-readable artifact while still producing structured data.
- **Approval gating**: When `--require-approval` is passed, notes are written to disk but flagged for manual review before any downstream actions.
- **Idempotent output**: Meeting notes are written to a timestamped path via `generateMeetingFilename(meetingName, mtime)`. A symlink-style `meeting_notes.md` in the outbox always points to the latest.
- **Watcher resilience**: The chokidar watcher uses `awaitWriteFinish` (1s stability threshold) to avoid processing partially-written files, and skips empty files.

## Flow
1. `run.ts` parses `--require-approval` (flag) and `--once <path>` (optional).
2. If `--once` is set, `watchTranscripts()` calls `runFollowup()` directly and returns.
3. Otherwise, `chokidar.watch(paths.assets.transcripts)` starts. On each `add` event for `.txt` files with non-zero size, `runFollowup()` is called.
4. `runFollowup()` generates a run ID, opens live logger, writes `running` run log.
5. The transcript file is read from disk; filename and modification time are captured.
6. **Stage 1**: `extractMetadata(transcript, { logger })` calls `chatCompletion(MODELS.wf4.schema, ..., { responseFormat: 'json', deadlineMs: 180_000 })`. Attendees are validated with `AttendeeSchema`.
7. **Stage 2**: `polishNotes(transcript, metadata, sourcePath, runId, { logger })` calls `chatCompletion(MODELS.wf4.llm, ..., { deadlineMs: 180_000 })`. The returned Markdown is parsed to extract `summary`, `actions[]`, `details`, and `ideasForLater[]`. The result is validated with `MeetingNotesSchema`.
8. Notes Markdown is rendered via `renderNotesMarkdown()` and written to a timestamped path in `paths.assets.meetingDocuments`.
9. A "latest" symlink copy is written to `paths.outbox.meetingNotes/meeting_notes.md`.
10. **Stage 3**: `draftEmail(notes, organizer, { logger })` calls `chatCompletion(MODELS.wf4.email, ..., { responseFormat: 'json', deadlineMs: 180_000 })`. Result is validated with `EmailDraftSchema`.
11. The email block (To, Cc, Subject, Body) is appended to `paths.outbox.drafts/email_draft.txt`.
12. Each action item is appended as a row to `paths.outbox.tasks` CSV with columns: Task ID, Title, Details, Status, Created Date.
13. A Kanban card row is appended to `paths.outbox.kanban` CSV.
14. Cost is estimated at a flat `0.01` per run.
15. Run log, run index, and cost are persisted; live logger is completed.
16. On failure, run log is set to `failed`; in watcher mode, individual file failures are caught and logged without crashing the watcher.

## Integration
- **Consumers**: CLI (one-shot or watched daemon). The `runId` parameter in `FollowupOptions` supports future orchestration integration.
- **Dependencies**: `@config/paths` (transcripts, meetingDocuments, outbox paths), `@config/workflows` (MODELS.wf4.schema/.llm/.email), `@schemas/meeting` (AttendeeSchema, MeetingNotesSchema, EmailDraftSchema), `@apptypes/meeting` (Attendee, MeetingNotes, EmailDraft).
- **Shared modules**: `../../_shared/llm` (chatCompletion), `../../_shared/csv` (appendRow), `../../_shared/runLog` (writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger), `../../_shared/liveLog` (LiveRunLogger).
- **Agent-level helpers**: `../../../agents/_shared/strings` (generateMeetingFilename).
- **External libraries**: `chokidar` (filesystem watcher).
- **Outputs**: Per-meeting Markdown notes, latest `meeting_notes.md`, email draft, tasks CSV, Kanban CSV.
