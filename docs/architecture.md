# Architecture

## High-level

```
                ┌──────────────────────────────┐
                │   Web UI (public/)           │
                │   + Hono API (src/server)    │
                └──────────────┬───────────────┘
                               │ HTTP
                ┌──────────────▼───────────────┐
                │  Orchestrator (src/orchestrator)
                │   - router.ts (intent → sub-agent)
                │   - orchestrator.ts (dispatch loop)
                └──────────────┬───────────────┘
                               │
       ┌─────────────┬─────────┴─────────┬──────────────┐
       ▼             ▼                   ▼              ▼
   briefing-prep  curation        weekly-digest    meeting-followup
   (WF1)          (WF2)           (WF3)            (WF4)
       │             │                   │              │
       └─────────────┴─────────┬─────────┴──────────────┘
                             │
                  ┌──────────┴──────────┐
                  │   src/_shared/      │
                  │  csv llm tts hitl   │
                  │  runLog context     │
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │  config/ + paths.ts │
                  │  types/ + schemas/  │
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         OpenRouter     assets/        outbox/
         (LLM+TTS)    (source data)   (generated)
```

## A user message → a workflow run

1. The user types in the Web UI (or hits a workflow CLI).
2. The Hono API receives a POST to `/api/chat` with the message history.
3. The orchestrator's `router.ts` inspects the last user message and any attached files. It produces an `OrchestratorDecision` (validated by zod).
4. The orchestrator dispatches to the chosen sub-agent's `run` function. Each sub-agent:
   - Validates its input payload.
   - Runs its steps in order.
   - Calls LLM/TTS through the shared OpenRouter client.
   - Writes its outputs to `outbox/`.
   - Writes a per-run log to `outbox/runs/{runId}.json` and appends to `outbox/runs/index.csv`.
   - Appends a cost row to `metrics/cost.csv`.
5. The orchestrator returns the result to the Web UI, which updates the chat transcript and refreshes the outbox sidebar.

## Why a hybrid orchestrator + sub-agents?

- The user talks to one persona (the chief of staff) — no need to know which sub-agent is doing the work.
- Each sub-agent is a small, focused module with a single system prompt and a single tool surface.
- New workflows are added by writing a sub-agent's system.md and `run.ts`, then registering it in the orchestrator's tool registry.

## Run threading

Every workflow writes a `runId` (UUID v4) into:
- the per-meeting filename (WF4)
- the briefing slug (WF1)
- a `outbox/runs/{runId}.json` log
- a `outbox/runs/index.csv` row
- a `metrics/cost.csv` row

This gives you a complete audit trail per run and makes the Web UI's "show me what happened" trivial.
