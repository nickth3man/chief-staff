# agents/

## Responsibility

The `agents/` directory houses the system prompts (system.md), routing logic, shared utilities, and sub-agent orchestration for the chief-of-staff agent system. It defines four specialized workflow sub-agents — **briefing-prep**, **curation**, **weekly-digest**, and **meeting-followup** — and the **orchestrator** that dispatches to them. Each sub-agent directory contains a `system.md` file that serves as the LLM system prompt for that agent's role, tool definitions, step sequences, and output schemas.

## Design

- **Prompt-as-configuration**: Each sub-agent's behavior is defined entirely by its `system.md` file, which includes role definition, tool interface specifications, step sequences, output schemas, failure modes, and voice/tone guidelines. No executable code lives in these prompt files — they are consumed by the agent runner at runtime.
- **Sub-agent homogeneity**: All four sub-agents follow the same architectural pattern — receive typed inputs, call a defined set of tools in a sequential pipeline, write artifacts to `outbox/` and `assets/`, and return file paths or structured results. The `system.md` files enforce this contract.
- **Orchestrator layer**: The orchestrator (`agents/orchestrator/`) implements a keyword- and file-extension-based classifier (`route()`) that maps user messages to a sub-agent via `OrchestratorDecision`. It does not execute workflows itself — only dispatches.
- **Shared utilities**: `agents/_shared/` provides cross-cutting helpers: a tool registry (`ToolDefinition`, `TOOL_REGISTRY`, `registerTools`, `getTools`, `invokeTool`) for sub-agent tool management, and string formatting utilities (`slugify`, `formatRunTimestamp`, `generateMeetingFilename`, `generateBriefingSlug`).
- **Curation-specific shared logic**: `agents/curation/_shared/` contains pure utility functions (`chunk`, `dedupe`, `filterRecent`, `mergeScores`) used exclusively by the curation sub-agent's data pipeline.
- **Zod validation boundary**: All external-facing data structures (agent decisions, event schemas, briefing schemas) are validated via Zod schemas defined in `schemas/`, consumed by the agent runner and routing logic.

## Flow

1. **Inbound message** arrives with `ChatMessage[]` and optional `attachedFiles[]`.
2. **Orchestrator** calls `route(input)` which applies regex-based pattern matching against the last user message and attached filenames.
3. **Result** is an `OrchestratorDecision` with `subAgent`, `payload`, and `rationale`.
4. If `isConversational()` returns true (curation with `hint: 'no-match'`), the orchestrator responds directly; otherwise the decision is dispatched to the selected sub-agent's runtime.
5. **Sub-agent execution** reads its `system.md` prompt, validates inputs via Zod, then runs the defined step sequence calling tools via the `TOOL_REGISTRY`.
6. **Tool calls** are resolved through `invokeTool(call)` which iterates the per-agent `TOOL_REGISTRY` to find a matching `ToolDefinition.handler`.
7. **Outputs** are written to `outbox/` (CSV, HTML, markdown, text) and `assets/` (per-meeting documents, client files) depending on the sub-agent.

## Integration

- **`types/agent.ts`** — Defines `SubAgentName`, `OrchestratorDecision`, `ChatMessage`, `ToolCall`, `ToolResult`, `HandoffContext`, `RunRecord`. Consumed by `router.ts`, `tools.ts`, and all sub-agent runtimes.
- **`schemas/agent.ts`** — Zod schemas (`OrchestratorDecisionSchema`, `SubAgentNameSchema`, `ChatMessageSchema`) used by the orchestrator router for runtime validation.
- **`schemas/event.ts`** — Zod schemas (`EventSchema`, `OrgContextSchema`, `BriefingSchema`, `SupplementalContextSchema`) consumed by the briefing-prep sub-agent.
- **`types/curation.ts`** — Defines `FeedItem`, `ScoredItem`, `CurationConfig`, `Action`, `ShelfLife`. Consumed by curation sub-agent and its shared chunker.
- **`outbox/`** — Destination for all sub-agent output artifacts: briefings, meeting notes, email drafts, task CSVs, kanban cards, feed digests, run logs.
- **`assets/`** — Persistent storage for meeting documents (`assets/meeting-documents/`), transcripts (`assets/transcripts/`), and client context files (`assets/consultant_x/`).
- **`test_records/industry_feeds.json`** — Default feed list consumed by the weekly-digest sub-agent.
