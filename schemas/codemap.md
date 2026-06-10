# schemas/

## Responsibility
Provides runtime validation and parsing for every domain data structure in the chief-staff system. Each file in `schemas/` mirrors its counterpart in `types/`, exposing Zod schemas that enforce the same shapes at runtime. This is the mandatory validation layer between untrusted external input (RSS feeds, calendar API payloads, LLM-generated JSON, user-provided context) and the typed in-memory interfaces consumed by agents, services, and tools.

## Design

### patterns
- **Mirror layout of `types/`** — Every file in `types/` has a corresponding file in `schemas/` with identical basename (`agent.ts`, `curation.ts`, `event.ts`, `meeting.ts`). The naming convention for schemas appends `Schema` to the type name: `RunRecord → RunRecordSchema`, `ScoredItem → ScoredItemSchema`. This establishes a predictable one-to-one mapping between compile-time types and runtime validators.
- **Zod-first authoring** — Schemas are defined as Zod objects, and the corresponding TypeScript interfaces in `types/` could theoretically be derived via `z.infer<typeof Schema>`. However, the codebase maintains separate interface declarations, which provides explicit documentation surface and avoids coupling the type definitions to the Zod library.
- **String-keyed property names** — Schemas for spreadsheet-aligned types (`ScoredItemSchema`, `EventSchema`, `TaskRowSchema`, `KanbanCardSchema`) use property keys with spaces and punctuation that match their CSV column headers and LLM prompt instructions exactly.
- **Nullable vs optional** — The codebase consistently uses `.optional()` for fields that may be absent and `.nullish()` (`.nullable().optional()`) for fields that may be explicitly null. This distinction is visible in `ScoredItemSchema` where `'Prompts Referenced'` is `.nullish()` while `Category` is required.
- **Relaxed bounds with documentation** — Zod constraints are tuned for production robustness. For example, `'Key Briefing Items'` accepts `min(1).max(10)` even though the prompt asks for 3–7 items, with an explicit comment explaining that reasoning-heavy models sometimes produce fewer items after consuming tokens during chain-of-thought.

### abstractions

#### agent.ts — Orchestration schemas
- **`SubAgentNameSchema`** / **`WorkflowNameSchema`** — `z.enum` over the four sub-agent names. `WorkflowNameSchema` is aliased.
- **`RunStatusSchema`** — `z.enum(['pending', 'running', 'completed', 'failed'])`.
- **`RunRecordSchema`** — Object with UUID, workflow enum, datetime strings, status enum, non-negative integer tokens, non-negative cost, optional notes.
- **`ChatRoleSchema`** — `z.enum(['user', 'assistant', 'system', 'tool'])`.
- **`ChatMessageSchema`** — Full conversational turn with optional nested `toolCall` (tool name + unknown-typed args) and `toolResult` (ok boolean + unknown-typed data or error string).
- **`OrchestratorDecisionSchema`** — Sub-agent enum + unknown-typed payload + rationale string.

#### curation.ts — Feed curation schemas
- **`FeedItemSchema`** — Validates raw RSS entries; `url` requires a valid URL format.
- **`ScoredItemSchema`** — Full LLM-evaluation output with `Score` bounded `min(0).max(10)`, `Action` enum, and optional/nullable metadata fields. Notably enforces URL format on `'Source Link'` and `'Secondary Source'`.
- **`ScoredItemsSchema`** — `z.array(ScoredItemSchema)` for batch validation.
- **`CurationConfigSchema`** — Array of URL-validated feed strings.

#### event.ts — Event briefing schemas
- **`EventSchema`** — Validates calendar event with `min(1)` constraints on name fields, email format on addresses, datetime format on start.
- **`OrgContextSchema`** — Company metadata with all non-key fields optional.
- **`TriageResponseSchema`** — Simple yes/no enum.
- **`SupplementalFileSchema`** / **`SupplementalContextSchema`** — File attachment and free-text context with optional URL arrays.
- **`BriefingSectionsSchema`** — Structured briefing content with bounded array lengths (1–10) for key items and exception-handling QA pairs.
- **`BriefingSchema`** — Aggregate root embedding `EventSchema`, nullable `OrgContextSchema`, summary, sections, markdown, datetime, and UUID run ID.

#### meeting.ts — Meeting follow-up schemas
- **`AttendeeSchema`** — Name (min 1) + email (validated format).
- **`ActionItemSchema`** — Action, owner, date (all min 1).
- **`MeetingNotesSchema`** — Full meeting output with array of attendees, attachments string array, actions array, ideas-for-later array, datetime, UUID.
- **`EmailDraftSchema`** — To/cc as email-validated string arrays, subject string, body capped at `max(2000)`, meeting name, datetime, UUID.
- **`TaskStatusSchema`** — Enum `'Pending Review' | 'Approved' | 'Completed'`.
- **`TaskRowSchema`** — Flat task record with string fields.
- **`KanbanListNameSchema`** — Enum `'Backlog' | 'In Progress' | 'Done'`.
- **`KanbanCardSchema`** — Flat card record with string fields.

### schema / type correspondence table

| types/ interface   | schemas/ schema            | Key constraints                                     |
|--------------------|----------------------------|------------------------------------------------------|
| `SubAgentName`     | `SubAgentNameSchema`       | Enum of 4 literals                                   |
| `RunRecord`        | `RunRecordSchema`          | uuid, datetime, ints, nonnegative                    |
| `ChatMessage`      | `ChatMessageSchema`        | Nested toolCall/toolResult, datetime                 |
| `OrchestratorDecision` | `OrchestratorDecisionSchema` | Sub-agent enum + unknown payload                  |
| `FeedItem`         | `FeedItemSchema`           | url() format on `url` field                          |
| `ScoredItem`       | `ScoredItemSchema`         | Score [0,10], Action enum, nullish metadata, url()   |
| `Event`            | `EventSchema`              | email() on addresses, min(1) on names, datetime()    |
| `OrgContext`       | `OrgContextSchema`         | All non-key fields optional                         |
| `Briefing`         | `BriefingSchema`           | Nullable orgContext, bounded arrays [1,10]           |
| `MeetingNotes`     | `MeetingNotesSchema`       | Nested AttendeeSchema[], ActionItemSchema[], datetime |
| `EmailDraft`       | `EmailDraftSchema`         | email() arrays, body max(2000), uuid                 |
| `TaskRow`          | `TaskRowSchema`            | String-typed, no numeric constraints                 |
| `KanbanCard`       | `KanbanCardSchema`         | String-typed, enum on `List Name`                    |

## Flow

### Typical validation pipeline
```
External / LLM-generated data (JSON)
    │
    ▼
schema.parse(data)            ───► validated typed data   ───► consumer (agent/service/tool)
       │                               or
schema.safeParse(data)        ───► { success: true, data } | { success: false, error }
       │
   [ZodError reported / handled]
```

- All schemas are used with `.parse()` or `.safeParse()` — never with `.passthrough()` or `.strip()` (unknown keys cause validation failure by default, since Zod `.object()` strips unknown keys by default, but the codebase relies on the default `strip` behaviour for flexibility in LLM output where extra keys may appear).

### Cross-schema references
- `BriefingSchema` imports and embeds `EventSchema` and `OrgContextSchema` from the same file (event.ts).
- `MeetingNotesSchema` embeds `AttendeeSchema` and `ActionItemSchema` from the same file (meeting.ts).
- `ScoredItemsSchema` wraps `ScoredItemSchema` as an array.
- No inter-file schema references exist — each file is self-contained (mirroring the `types/` convention).

## Integration

### Dependencies
- **`zod`** — Sole external dependency. All files import `{ z } from 'zod'`.
- **No project-internal imports** — Schemas do not import from `types/` or `config/`. They are independently authored and mirror the type shapes manually.

### Consumers
- **Agent implementations** — Parse LLM-structured outputs (e.g., `ScoredItemSchema` for curation agent, `BriefingSchema` for briefing-prep agent, `MeetingNotesSchema` / `EmailDraftSchema` for meeting-followup agent).
- **Service layer** — Validate incoming webhook payloads, API responses, and file-read data against the corresponding schema.
- **Tool implementations** — Validate tool-call arguments and results.
- **CLI / entry points** — Parse user-supplied configuration and context files.
- **Test fixtures** — Use schemas to generate valid test data via `schema.parse()`.

### boundary / contract
`schemas/` is a pure validation layer. It never writes to I/O, mutates state, or calls agent/service code. Every schema performs a single responsibility: accept unknown JSON, return either fully-typed data or a structured error. The Zod error messages are the contract's error-reporting mechanism. Consumers are expected to handle `ZodError` by logging, retrying with corrected prompts (for LLM output), or rejecting the input (for external API data).
