# src/workflows/

## Responsibility
Orchestration layer for the four sub-agent workflow pipelines — briefing-prep (WF1), curation (WF2), weekly-digest (WF3), and meeting-followup (WF4). Each subdirectory is a standalone runnable workflow with its own entry point (`run.ts`), step orchestration (`steps.ts`), and domain-specific helpers. The parent directory does not contain shared workflow logic; it delegates entirely into the four subdirectories. No direct `.ts` files exist at this level — only subdirectory modules and this codemap.

## Design
- **Sub-agent decomposition**: Each workflow is independently invocable via `pnpm tsx src/workflows/<name>/run.ts` with CLI args. There is no central orchestrator that dispatches to all four — they are designed to be triggered individually (cron, manual, file-watcher).
- **Uniform scaffolding**: Every workflow follows the same internal module convention:
  - `run.ts` — CLI entry point, argument parsing, `main()` with forced `process.exit(0)` to prevent OpenAI SDK keep-alive sockets from hanging.
  - `steps.ts` — core orchestration function (exported as `run<Workflow>`) containing all step logic, live-logging, run-log persistence, cost tracking, and error handling.
  - `prompts.ts` — LLM system/user prompt templates and response parsers (WF1, WF4).
  - `fetch.ts` — RSS/feed fetching (WF2 only; reused by WF3).
  - `score.ts` — LLM-based article scoring (WF2 only).
  - `watcher.ts` — filesystem watcher for transcript ingestion (WF4 only).
- **Shared infrastructure**: All workflows import from `../../_shared/` (llm, runLog, liveLog, csv, email, context, tts, hitl) and from `@config/workflows` (MODELS, WORKFLOW_KNOBS, TTS, HITL). Workflows do not share state at runtime; they are horizontally isolated.
- **Run-log persistence**: Every workflow writes structured run records (status, token counts, cost, notes) to a shared run-log index. Cost entries are appended per-date/workflow for cumulative billing.
- **Live logging**: Each workflow instantiates a `LiveRunLogger` (via `createLiveLogger(runId, workflowName)`) for streaming JSON events to a per-run log file, covering lifecycle events, LLM calls, and completion/failure summaries.
- **Type safety**: Workflows parse and validate IO through Zod schemas (`@schemas/event`, `@schemas/curation`, `@schemas/meeting`) and typed interfaces (`@apptypes/event`, `@apptypes/curation`, `@apptypes/meeting`).

## Flow
1. A sub-agent workflow is invoked via CLI (`--event`, `--config`, `--once`, etc.).
2. `run.ts` parses arguments, calls the exported `run<Workflow>` function from `steps.ts`.
3. `steps.ts` generates a `runId`, initialises live logger, writes a `running` run-log record.
4. The core pipeline executes — reading input files, calling the LLM via `chatCompletion()` (with `responseFormat: 'json'` where structured output is required), applying business logic (chunking, scoring, filtering, delay-loops).
5. Artifacts are written to the filesystem under `paths.outbox.*` (briefings, feed summaries, digests, meeting notes, email drafts, task CSVs).
6. On completion, cost and token tallies are persisted via `appendCost`, `writeRunLog`, `appendRunIndex`, and `live.complete()`.
7. On failure, the error is caught, logged via `live.fail()` and `writeRunLog` with `status: 'failed'`, and rethrown.
8. `run.ts` calls `process.exit(0)` to force-terminate despite lingering socket handles.

## Integration
- **Consumers**: External triggers (cron jobs, file-watcher daemons, CLI invocations by the user). The `orchestrator` model (`@config/workflows`) is reserved for future use.
- **Dependencies**: `@config/paths` (filesystem layout), `@config/workflows` (model selection, tunables, TTS/HITL configuration), `@schemas/*` (Zod validation), `@apptypes/*` (TypeScript interfaces).
- **Shared modules**: `../../_shared/llm` (OpenRouter-backed `chatCompletion`), `../../_shared/runLog` (run-index + cost CSV writers), `../../_shared/liveLog` (streaming per-run JSON logs), `../../_shared/csv` (append-only CSV), `../../_shared/email` (confirmation email writing), `../../_shared/context` (org context + client file lookup), `../../_shared/tts` (TTS synthesis via OpenRouter), `../../_shared/hitl` (human-in-the-loop CLI prompts).
- **Cross-workflow reuse**: WF3 (`weekly-digest`) imports `fetchAllFeeds` from `../curation/fetch` and `dedupe` from `../../../agents/curation/_shared/chunker`. No other cross-workflow imports exist.
