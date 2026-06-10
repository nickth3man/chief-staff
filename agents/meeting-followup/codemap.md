# agents/meeting-followup/

## Responsibility

The **Meeting Follow-Up** sub-agent processes a raw meeting transcript into a structured set of downstream artifacts: a per-meeting markdown notes file (archived in `assets/meeting-documents/`), a "latest" pointer file in the outbox, a draft follow-up email (<200 words), a CSV row per action item, and a kanban card per meeting. It is the post-meeting productivity engine of the chief-of-staff system.

## Design

- **11-step pipeline with human-in-the-loop gate**: The step sequence is read transcript → extract metadata → polish notes → write meeting doc → update latest pointer → conditional approval gate (if `requireApproval=true`) → draft email → append email → append tasks → append kanban → write run log + cost. The approval gate at step 6 allows the operator to review notes before downstream artifacts are generated.
- **Multi-model LLM orchestration**: Uses three different LLM providers for different pipeline stages — `google/gemini-2.5-flash` for metadata extraction (fast, cheap), `openai/gpt-4o` for note polishing (high quality), and `anthropic/claude-3-5-sonnet-latest` for email drafting (nuanced tone). Each model is selected for its strength in the specific task.
- **8-section meeting notes schema**: The polished notes follow a rigid structure: Date, Meeting Name, Attendees (`name <email>`), Attachments (auto-populated), Summary / Key Decisions, Actions (Markdown table), Details, Ideas for Later.
- **Email drafting rules**: Strict constraints — subject format `{Meeting Name} - Meeting Notes & Follow-up Actions`, under 200 words, sections (Thank, Key Takeaways, Action Items), exact closing line. Attendee routing logic: To = all non-organizer attendees, Cc = organizer if not already in To.
- **Deterministic filename pattern**: `{slug}-{YYYYMMDDHHmmss}.md` using slugified meeting name and UTC timestamp — consistent with the `agents/_shared/strings.ts` utilities.
- **Run accounting**: Every execution writes a run log entry and cost record into `outbox/runs/`, enabling tracking of token usage and dollar cost per meeting processed.
- **Failure modes with graceful degradation**: Empty transcripts are skipped with a warning. Missing attendees still process but email falls back to sender-only. LLM failures on notes trigger one retry then a minimal raw-transcript fallback. Email LLM failures log and skip email but preserve the notes.

## Flow

1. **Inputs**: `transcriptPath: string`, `requireApproval: boolean`.
2. **Read transcript**: Load content, modification time, and filename from the path.
3. **Extract metadata**: LLM call (`gemini-2.5-flash`) extracts meeting name, attendees list, and date from raw transcript.
4. **Polish notes**: LLM call (`gpt-4o`) transforms transcript + metadata into the 8-section meeting notes structure.
5. **Write meeting doc**: Save markdown to `assets/meeting-documents/{slug}-{ts}.md`.
6. **Update latest pointer**: Overwrite `outbox/meeting_notes/meeting_notes.md` with the latest notes.
7. **Approval gate** (conditional): If `requireApproval=true`, pause and wait for operator confirmation before proceeding.
8. **Draft email**: LLM call (`claude-3-5-sonnet-latest`) generates a <200-word follow-up email.
9. **Append email draft**: Append the email block to `outbox/drafts/email_draft.txt`.
10. **Append tasks**: Append one CSV row per action item to `outbox/tasks.csv`.
11. **Append kanban**: Append one kanban card row to `outbox/kanban_cards.csv`.
12. **Write run log + cost**: Append run metadata and cost records to `outbox/runs/`.

## Integration

- **`agents/_shared/strings.ts`** — Uses `slugify()` and `formatRunTimestamp()` for meeting filename generation `{slug}-{ts}.md`.
- **`agents/_shared/tools.ts`** — Registers its 11 tools via `registerTools('meeting-followup', ...)` for runtime invocation. The tool registry maps tool names to handler functions for each pipeline step.
- **`agents/orchestrator/`** — The orchestrator dispatches to meeting-followup when `router.ts` detects an attached `.txt` transcript file or keywords `(transcript|follow-up|meeting notes)`.
- **`assets/meeting-documents/`** — Writes archived per-meeting markdown files for long-term reference.
- **`assets/transcripts/`** — Reads raw transcript files from the assets store.
- **`outbox/meeting_notes/`** — Writes and updates the "latest" meeting notes pointer file.
- **`outbox/drafts/`** — Appends email drafts to `email_draft.txt`.
- **`outbox/tasks.csv`** — Appends action item rows.
- **`outbox/kanban_cards.csv`** — Appends kanban card rows.
- **`outbox/runs/`** — Writes run log and cost accounting records.
