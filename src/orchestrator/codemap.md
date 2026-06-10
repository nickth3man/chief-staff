# src/orchestrator/

## Responsibility

The orchestrator is the **central decision & dispatch hub** of the chief-staff agent system. It receives a user turn (chat history + attached files), classifies the intent via a stateless router, and either dispatches to one of four workflow sub-agents or falls back to a direct LLM chat. It owns the turn lifecycle: run-ID generation, structured telemetry logging, error capture, and result marshalling.

## Design

**Router–Dispatch pattern.** The module separates intent classification from execution:
- `route()` (imported from `@agents/orchestrator/router`) is a pure function that maps `{ messages, attachedFiles }` → `OrchestratorDecision { subAgent, payload, rationale }`. Classification uses keyword heuristics on the last user message and file-extension tests (`.txt` → transcript, `event.json` → briefing).
- `dispatch()` is an internal async function that maps `SubAgentName` → workflow entry point via a `switch` statement, extracting required payload fields (e.g. `eventPath`, `transcriptPath`, `configPath`) and injecting the shared `runId` for log correlation.

**Chat fallback.** When the router returns `{ subAgent: 'curation', payload: { hint: 'no-match' } }`, the orchestrator recognises a conversational query that does not fit any workflow. It calls `chatCompletion` with a chief-of-staff system prompt (`CHAT_SYSTEM`) and returns `{ kind: 'chat', content }` instead of dispatching. This prevents false-positive invocations of the curation pipeline.

**Run-ID correlation.** A single `uuidv4()` is generated per `handleTurn` call (`newRunId()`). This ID is:
1. Used by the orchestrator's own `LiveRunLogger` instance.
2. Threaded into every sub-agent dispatch (`{ runId, live }` context), so both log files (orchestrator + workflow) share the same identifier and can be correlated by timestamp.

**Live-log lifecycle.** Every turn opens a `LiveRunLogger` (JSONL file) with these milestone events:
- `init` — file opened
- `route-decision` — router output (sub-agent, rationale, payload, attached files)
- `chat-fallback` — only when no-match; records the LLM model used
- `llm-call` — records model, latency, token counts, cost, content preview (truncated to 500 chars)
- `dispatch` — sub-agent name and run ID
- `complete` / `failed` — terminal status with summary

**Error boundary.** `dispatch()` is wrapped in try/catch inside `handleTurn()`. On failure, `live.fail()` records the error before the exception propagates to the HTTP handler.

## Flow

```
POST /chat  (src/server/routes/api.ts)
  │
  ├─ messages timestamped
  └─ handleTurn(messages, attachedFiles)
       │
       ├─ route({ messages, attachedFiles })
       │    └─ lastUserText() + keyword/file-extension heuristics
       │    └─ returns OrchestratorDecision { subAgent, payload, rationale }
       │
       ├─ newRunId() → uuidv4
       ├─ createLiveLogger(runId, 'orchestrator') → LiveRunLogger
       ├─ live.open()
       ├─ live.event('route-decision', { subAgent, rationale, payload, attachedFiles })
       │
       ├─ [no-match branch]
       │   if subAgent === 'curation' && hint === 'no-match'
       │    ├─ live.event('chat-fallback')
       │    ├─ chatCompletion(MODELS.orchestrator, [system + messages])
       │    ├─ live.llmCall()
       │    ├─ live.complete({ kind: 'chat' })
       │    └─ return { decision, result: { kind: 'chat', content } }
       │
       ├─ [dispatch branch]
       │   ├─ live.event('dispatch', { subAgent, runId })
       │   ├─ dispatch(subAgent, payload, { runId, live })
       │   │    └─ switch(subAgent)
       │   │         ├─ 'briefing-prep'    → runBriefingPrep({ eventPath, bypassDelay, runId })
       │   │         ├─ 'curation'         → runCuration({ configPath, runId })
       │   │         ├─ 'weekly-digest'    → runWeeklyDigest({ configPath, runId })
       │   │         └─ 'meeting-followup' → runFollowup({ transcriptPath, runId })
       │   ├─ live.complete({ kind: 'dispatch', subAgent })
       │   └─ return { decision, result: { kind: 'dispatch', payload: dispatchResult } }
       │
       └─ [on error]
            ├─ live.fail(err, { kind: 'dispatch', subAgent })
            └─ throw err
```

## Integration

| Direction | Module | Role |
|-----------|--------|------|
| **Consumed by** | `src/server/routes/api.ts` | HTTP handler calls `handleTurn()` from the `POST /chat` endpoint; the returned `OrchestratorResult` is serialised as JSON. |
| **Router** | `agents/orchestrator/router.ts` (`@agents/orchestrator/router`) | Pure classification function `route()` — keyword heuristics + file-extension matching. Also exports `isConversational()` used by the orchestrator. |
| **Types** | `types/agent.ts` (`@apptypes/agent`) | Defines `SubAgentName` (union of the four workflows), `OrchestratorDecision`, `ChatMessage` — consumed as type-level imports only. |
| **Schemas** | `schemas/agent.ts` (`@schemas/agent`) | Zod runtime validators for `OrchestratorDecision`; the router uses `OrchestratorDecisionSchema.parse()` for structural validation. |
| **Config** | `@config/workflows` | Provides `MODELS.orchestrator` (the LLM model used in the chat-fallback path). |
| **Shared — LLM** | `src/_shared/llm.ts` | `chatCompletion()` invoked when the router returns a no-match. |
| **Shared — Logging** | `src/_shared/runLog.ts` | `newRunId()` (UUID generation) and `createLiveLogger()` factory. |
| **Shared — Live Log** | `src/_shared/liveLog.ts` | `LiveRunLogger` class for structured JSONL telemetry with milestone events (`init`, `route-decision`, `dispatch`, `llm-call`, `complete`, `failed`). |
| **Dispatched workflows** | `src/workflows/briefing-prep/steps.ts` | `runBriefingPrep()` — event ingestion, context assembly, briefing generation, TTS, email. |
| | `src/workflows/curation/steps.ts` | `runCuration()` — RSS fetch, chunk/dedupe/score, CSV export. |
| | `src/workflows/weekly-digest/steps.ts` | `runWeeklyDigest()` — feed fetch, LLM digest generation, markdown output. |
| | `src/workflows/meeting-followup/steps.ts` | `runFollowup()` — transcript parsing, metadata extraction, note polishing, email drafting, task CSV export. |
