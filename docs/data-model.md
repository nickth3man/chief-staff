# Data Model

## Source of truth

All persistence is in plain CSV and Markdown files under `outbox/` and `assets/`. The TypeScript types in `types/` are the contract; the zod validators in `schemas/` mirror them at runtime.

## CSVs

| File | Columns | Vocab |
| --- | --- | --- |
| `outbox/context.csv` | `Invitee Electronic Address`, `Target Company Name`, `Industry`, `Size`, `Last Briefing Date`, `Context Notes` | free text |
| `outbox/feed_summaries.csv` | 19 columns: 18 LLM-extracted + `Timestamp` (last column) | `Action ∈ {READ, MAYBE, SKIP}`, `Shelf life? ∈ {Short Term, Medium Term, Long Term}` |
| `outbox/tasks.csv` | `Task ID`, `Title`, `Details`, `Status`, `Created Date` | `Status ∈ {Pending Review, Approved, Completed}` |
| `outbox/kanban_cards.csv` | `Card ID`, `Title`, `Description`, `List Name`, `Created Date` | `List Name ∈ {Backlog, In Progress, Done}` |
| `outbox/runs/index.csv` | `runId`, `workflow`, `startedAt`, `endedAt`, `status`, `costUsd` | `status ∈ {pending, running, completed, failed}` |
| `metrics/cost.csv` | `Date`, `Workflow`, `Model`, `TokensIn`, `TokensOut`, `CostUsd` | free text |

## Markdown

| Path | Purpose |
| --- | --- |
| `outbox/briefings/{slug}_notes.md` | WF1 written briefing (5 sections) |
| `outbox/briefings/{slug}_audio.mp3` | WF1 audio briefing |
| `outbox/audio/briefing_temp.mp3` | WF1 TTS temp file (cleaned up after copy) |
| `outbox/weekly_digest.md` | WF3 weekly digest output |
| `outbox/feed_digest.html` | WF2 HTML digest |
| `outbox/meeting_notes/meeting_notes.md` | WF4 latest-pointer (overwritten) |
| `assets/meeting-documents/{slug}-{ts}.md` | WF4 per-meeting notes |
| `outbox/drafts/email_draft.txt` | WF4 appended email blocks (one per meeting, separated by `---`) |
| `outbox/runs/{runId}.json` | Per-run log |

## Mapping: tasks.csv ↔ kanban_cards.csv

`tasks.csv` and `kanban_cards.csv` track different views of the same underlying work. The mapping:

| tasks.csv Status | kanban_cards.csv List Name | Meaning |
| --- | --- | --- |
| Pending Review | Backlog | New, not yet picked up |
| Approved | In Progress | Approved, in flight |
| Completed | Done | Finished |

When a meeting is processed, the workflow writes a `Pending Review` task for each action and a `Done` kanban card for the meeting itself (the meeting is "done" the moment the notes are persisted).

## Slug rules

All slugs are produced by `slugify()` in `agents/_shared/strings.ts`:

1. Lowercase.
2. Replace any non-alphanumeric run with a single `-`.
3. Trim leading and trailing `-`.

Meeting filenames append a `YYYYMMDDHHmmss` timestamp so multiple meetings on the same day do not collide.
