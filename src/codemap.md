# src/

## Responsibility

The application runtime layer of the chief-staff system. Contains the HTTP server, the central orchestrator, shared infrastructure services, and the four workflow pipeline implementations. This is where executable code lives — as opposed to `agents/` (prompts and routing definitions), `types/` (compile-time contracts), and `schemas/` (runtime validation).

## Design

- **Three-tier architecture**: `server/` (HTTP adapter) → `orchestrator/` (dispatch hub) → `workflows/` (pipeline implementations). Each tier delegates downward; no upward imports.
- **Shared infrastructure facade**: `_shared/` provides cross-cutting services (LLM communication, TTS, CSV I/O, logging, HITL, email, context discovery) consumed by all workflows and the orchestrator. All modules are stateless facades over I/O-bound resources.
- **Workflow isolation**: Each of the four workflows (`briefing-prep`, `curation`, `weekly-digest`, `meeting-followup`) is independently invocable via CLI with its own entry point. They share infrastructure but not state.
- **Run correlation**: A single `uuidv4` run ID threads through orchestrator → workflow → live logger → run log, enabling end-to-end observability per turn.

## Flow

```
HTTP request (POST /api/chat)
    │
    ▼
server/routes/api.ts  ──→  orchestrator/orchestrator.ts
    │                              │
    │                              ├─ route() → OrchestratorDecision
    │                              ├─ dispatch() → workflow entry
    │                              │     │
    │                              │     ▼
    │                              │  workflows/<name>/steps.ts
    │                              │     │
    │                              │     ├─ _shared/llm.ts (LLM calls)
    │                              │     ├─ _shared/csv.ts (CSV I/O)
    │                              │     ├─ _shared/tts.ts (audio)
    │                              │     ├─ _shared/runLog.ts (persistence)
    │                              │     └─ _shared/liveLog.ts (telemetry)
    │                              │
    │                              └─ chat fallback (no-match)
    │
    ▼
JSON response (OrchestratorResult)
```

## Integration

| Directory | Role | Codemap |
|-----------|------|---------|
| `src/_shared/` | Cross-cutting infrastructure: LLM, TTS, CSV, logging, HITL, email, context | [View Map](src/_shared/codemap.md) |
| `src/orchestrator/` | Central dispatch hub: route + dispatch + chat fallback | [View Map](src/orchestrator/codemap.md) |
| `src/server/` | HTTP server (Hono) with REST API and static serving | [View Map](src/server/codemap.md) |
| `src/server/routes/` | REST endpoint definitions for chat, files, CSV, runs, HITL | [View Map](src/server/routes/codemap.md) |
| `src/workflows/` | Four workflow pipelines: briefing-prep, curation, weekly-digest, meeting-followup | [View Map](src/workflows/codemap.md) |
| `src/workflows/briefing-prep/` | WF1: Pre-meeting executive briefing generation | [View Map](src/workflows/briefing-prep/codemap.md) |
| `src/workflows/curation/` | WF2: Daily RSS feed curation with LLM scoring | [View Map](src/workflows/curation/codemap.md) |
| `src/workflows/weekly-digest/` | WF3: Weekly enterprise-tech intelligence digest | [View Map](src/workflows/weekly-digest/codemap.md) |
| `src/workflows/meeting-followup/` | WF4: Transcript processing, note polishing, email drafting | [View Map](src/workflows/meeting-followup/codemap.md) |
