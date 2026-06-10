# types/

## Responsibility
Defines the canonical TypeScript type system for the chief-staff application. Every domain-level data structure — agent identity, orchestration decisions, chat messages, feed curation items, calendar events, meeting notes, email drafts, tasks, and kanban cards — is declared here as an interface or type alias. This directory is the sole source of truth for in-memory shapes consumed by all agents, services, and tools. No runtime validation or I/O formatting is performed; types/ expresses only compile-time contracts.

## Design

### patterns
- **Domain-per-file** — Each major bounded context gets its own file: `agent.ts` (orchestration core), `curation.ts` (RSS feed processing), `event.ts` (calendar events & briefings), `meeting.ts` (meeting follow-up artifacts). This mirrors the sub-agent decomposition.
- **Branded primitives** — `ISODateTime` and `UUID` are declared as type aliases over `string`, providing semantic narrowing without runtime overhead.
- **Discriminated union for SubAgentName** — `SubAgentName` is a string literal union (`'briefing-prep' | 'curation' | 'weekly-digest' | 'meeting-followup'`) that flows into `WorkflowName`, `HandoffContext`, `ChatMessage.subAgent`, and `OrchestratorDecision.subAgent`. This ensures compile-time exhaustiveness checking across the entire codebase.
- **Flat spreadsheet-friendly interfaces** — `ScoredItem`, `Event`, `TaskRow`, and `KanbanCard` use string-keyed property names with spaces and punctuation (`'So what?'`, `'Has Numbers?'`, `'Shelf life?'`). This is a deliberate concession to CSV/display alignment; the corresponding Zod schemas reuse identical keys for seamless serialization.
- **Minimal inheritance** — Interfaces are standalone (no `extends` chains), favouring composition. `Briefing` embeds `Event` and `OrgContext` directly. `MeetingNotes` embeds `Attendee[]` and `ActionItem[]`.

### abstractions

#### agent.ts — Orchestration core
- **`SubAgentName`** / **`WorkflowName`** — Literal union identifying the four sub-agents. `WorkflowName` is aliased to `SubAgentName` (every workflow is tied to exactly one sub-agent).
- **`RunRecord`** — Tracks a single workflow execution: identity, timing, status (`pending | running | completed | failed`), token consumption, and cost in USD.
- **`HandoffContext`** — Carries summary and payload when one sub-agent delegates to another; optionally identifies the source sub-agent.
- **`ToolCall`** / **`ToolResult<T>`** — Generic LLM function-calling shape; `ToolResult.ok` discriminates success from failure.
- **`OrchestratorDecision`** — The router output: which sub-agent to invoke, with what payload and rationale.
- **`ChatMessage`** — A full conversational turn with role, content, optional sub-agent attribution, tool invocation/result, and timestamp.

#### curation.ts — Feed curation domain
- **`FeedItem`** — Raw RSS/Atom entry with guid, title, description, publication date, optional author/thumbnail, and URL.
- **`ScoredItem`** — Annotated and scored feed item after LLM evaluation. Contains numerical score (0–10), action (`READ | MAYBE | SKIP`), category, summary, and structured response fields (`'So what?'`, `'Who cares?'`, `'What now?'`). Optional fields capture prompt provenance (`'Prompts Referenced'`, `'Original Prompts'`), evidence metadata (`'Evidence Type'`, `'Has Numbers?'`, `'Has Real Use Case?'`, `'Has Clear Action?'`), source links, and shelf life.
- **`ShelfLife`** / **`Action`** — String literal unions for classification.
- **`CurationConfig`** — Simple list of feed URLs.

#### event.ts — Event briefing domain
- **`Event`** — Calendar event with names, addresses, guests, duration, and type. String-keyed for spreadsheet alignment.
- **`OrgContext`** — Target company metadata for briefing context.
- **`TriageResponse`** — Simple yes/no answer from triage.
- **`SupplementalFile`** / **`SupplementalContext`** — Free-text notes, file attachments, and reference URLs that augment a briefing.
- **`BriefingSections`** — Structured briefing content with key items, approach, exception-handling QA pairs, stakeholder considerations, and risk mitigation.
- **`Briefing`** — Aggregate root combining event, org context, summary, sections, rendered markdown, and run metadata.

#### meeting.ts — Meeting follow-up domain
- **`Attendee`** — Name + email.
- **`ActionItem`** — Action string, owner, due date.
- **`MeetingNotes`** — Full meeting output: metadata, attendees, attachments, summary, actions, details, ideas for later, source transcript path, run ID.
- **`EmailDraft`** — Outbound email with to/cc, subject, body (implied 2000-char constraint enforced at schema layer), associated meeting name.
- **`TaskRow`** / **`KanbanCard`** — Flat CSV-ready shapes for task tracking and kanban board export. Status is a literal union.

### interface / type surface
All exports are pure types; there are no values, enums, or classes. The full export list:

```typescript
// agent.ts
export type ISODateTime = string;
export type UUID = string;
export type SubAgentName = ...;
export type WorkflowName = SubAgentName;
export interface RunRecord { ... }
export interface HandoffContext { ... }
export interface ToolCall { ... }
export interface ToolResult<T = unknown> { ... }
export interface OrchestratorDecision { ... }
export interface ChatMessage { ... }

// curation.ts
export interface FeedItem { ... }
export type ShelfLife = ...;
export type Action = ...;
export interface ScoredItem { ... }
export interface CurationConfig { ... }

// event.ts
export type ISODateTime = string;
export interface Event { ... }
export interface OrgContext { ... }
export type TriageAnswer = ...;
export interface TriageResponse { ... }
export interface SupplementalFile { ... }
export interface SupplementalContext { ... }
export interface BriefingSections { ... }
export interface Briefing { ... }

// meeting.ts
export interface Attendee { ... }
export interface ActionItem { ... }
export interface MeetingNotes { ... }
export interface EmailDraft { ... }
export type TaskStatus = ...;
export interface TaskRow { ... }
export type KanbanListName = ...;
export interface KanbanCard { ... }
```

## Flow

### Data-flow direction
```
External input (RSS feeds, calendar API, transcripts, user input)
    │
    ▼
Runtime validation ───► schemas/ (Zod parse)
    │
    ▼
In-memory typed data ──► types/ interfaces
    │
    ▼
Processing (agents, services, tools)
    │
    ▼
Serialisation ──────────► CSV / Markdown / JSON / Email
```

Types are consumed by `schemas/` (which defines Zod counterparts) and by every agent/service/tool. No runtime flow originates in `types/`; types are purely descriptive contracts.

### Cross-file type relationships
- `SubAgentName` (agent.ts) flows into `ChatMessage.subAgent`, `HandoffContext.sourceSubAgent`, `OrchestratorDecision.subAgent`.
- `WorkflowName` (alias of `SubAgentName`) is used in `RunRecord.workflow`.
- `Event` and `OrgContext` are embedded in `Briefing` (event.ts).
- `Attendee` and `ActionItem` are embedded in `MeetingNotes` (meeting.ts).
- `ScoredItem` is an array element used in the curation pipeline (curation.ts).
- `ISODateTime` is redeclared in both `agent.ts` and `event.ts` (no shared import — intentional to avoid cross-domain coupling at the type level).

## Integration

### Dependencies
- **`luxon`** — Only `event.ts` imports `DateTime` from luxon, but does not use it in any exported interface (the import appears vestigial or reserved for future use). No other file in `types/` imports external packages.
- **No project-internal imports** — Every file is self-contained; there are no cross-imports between `agent.ts`, `curation.ts`, `event.ts`, or `meeting.ts`. The directory is intentionally a flat namespace.

### Consumers
- **`schemas/`** — Each `schemas/*.ts` file mirrors the corresponding `types/*.ts` file, defining Zod schemas that validate and produce the same shapes. This is the primary downstream consumer.
- **Agent implementations** (`agents/`) — Type their inputs, outputs, and internal state with these interfaces.
- **Service layer** (`services/`) — Types function parameters and return values.
- **Tool implementations** (`tools/`) — Use `ToolCall` / `ToolResult` generics and domain-specific types.
- **CLI / web entry points** — Use `OrchestratorDecision`, `ChatMessage`, etc. for user interaction.
- **Output serializers** — Read `Briefing.markdown`, `MeetingNotes`, `EmailDraft`, `TaskRow`, `KanbanCard` to produce files.

### boundary / contract
`types/` is a zero-runtime-cost abstraction — all exports are erased at compile time. It has no side effects, no dependencies on project code, and minimal external dependencies (luxon import is unused in the type surface). Every interface uses primitive types or other interfaces from the same file. Consumers must pair compile-time types with runtime validation from `schemas/` for untrusted data.
