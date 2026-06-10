# Repository Atlas: chief-staff

## Project Responsibility

A local-first chief-of-staff agent system that orchestrates four specialized workflow sub-agents — **briefing-prep** (pre-meeting executive briefings), **curation** (daily RSS news scoring), **weekly-digest** (enterprise-tech intelligence), and **meeting-followup** (transcript processing + email drafts) — coordinated by a central orchestrator with keyword-based routing. Built on Hono (HTTP), OpenRouter (LLM gateway), Zod (validation), and TypeScript.

## System Entry Points

| Entry Point | Purpose |
|-------------|---------|
| `src/server/index.ts` | HTTP server startup (Hono, serves `public/`, mounts `/api`) |
| `src/orchestrator/orchestrator.ts` | Central turn handler: route → dispatch or chat fallback |
| `src/workflows/briefing-prep/run.ts` | CLI: `pnpm wf1 --event <path>` |
| `src/workflows/curation/run.ts` | CLI: `pnpm wf2 --config <feeds.json>` |
| `src/workflows/weekly-digest/run.ts` | CLI: `pnpm wf3 --config <feeds.json>` |
| `src/workflows/meeting-followup/run.ts` | CLI: `pnpm wf4 --once <transcript.txt>` or watcher mode |
| `package.json` | Dependencies, scripts, engine requirements |

## Architecture Overview

```
                    ┌─────────────────────┐
                    │   HTTP Server (Hono) │  src/server/
                    │   REST API + Static  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Orchestrator      │  src/orchestrator/
                    │  route() → dispatch  │  agents/orchestrator/
                    └──────────┬──────────┘
                               │
          ┌────────────┬───────┴───────┬────────────┐
          ▼            ▼               ▼            ▼
    ┌───────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐
    │ Briefing  │ │ Curation │ │   Weekly   │ │   Meeting    │
    │   Prep    │ │  (Daily) │ │   Digest   │ │  Follow-Up   │
    │   (WF1)   │ │  (WF2)   │ │   (WF3)    │ │    (WF4)     │
    └─────┬─────┘ └────┬─────┘ └─────┬──────┘ └──────┬───────┘
          │            │             │               │
          └────────────┴──────┬──────┴───────────────┘
                              ▼
                    ┌─────────────────────┐
                    │  Shared Infrastructure │  src/_shared/
                    │  LLM · TTS · CSV ·   │
                    │  Logging · HITL ·    │
                    │  Email · Context     │
                    └─────────────────────┘
```

## Directory Map

| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `agents/` | System prompts, routing logic, shared agent utilities, and sub-agent definitions | [View Map](agents/codemap.md) |
| `agents/_shared/` | Tool registry and string utilities shared across all sub-agents | [View Map](agents/_shared/codemap.md) |
| `agents/orchestrator/` | Keyword-based router and system prompt for the dispatch hub | [View Map](agents/orchestrator/codemap.md) |
| `agents/briefing-prep/` | System prompt for the briefing-prep sub-agent (11-step pipeline) | [View Map](agents/briefing-prep/codemap.md) |
| `agents/curation/` | System prompt for the curation sub-agent (9-step scoring pipeline) | [View Map](agents/curation/codemap.md) |
| `agents/curation/_shared/` | Pure utility functions: chunk, dedupe, filterRecent, mergeScores | [View Map](agents/curation/_shared/codemap.md) |
| `agents/meeting-followup/` | System prompt for the meeting-followup sub-agent (11-step pipeline) | [View Map](agents/meeting-followup/codemap.md) |
| `agents/weekly-digest/` | System prompt for the weekly-digest sub-agent (5-step pipeline) | [View Map](agents/weekly-digest/codemap.md) |
| `src/` | Application runtime: server, orchestrator, shared services, workflows | [View Map](src/codemap.md) |
| `src/_shared/` | Cross-cutting infrastructure: LLM, TTS, CSV, logging, HITL, email, context | [View Map](src/_shared/codemap.md) |
| `src/orchestrator/` | Central dispatch hub: route classification, chat fallback, run lifecycle | [View Map](src/orchestrator/codemap.md) |
| `src/server/` | HTTP server (Hono) with REST API and static file serving | [View Map](src/server/codemap.md) |
| `src/server/routes/` | REST endpoint definitions for chat, files, CSV, runs, HITL | [View Map](src/server/routes/codemap.md) |
| `src/workflows/` | Four workflow pipeline implementations | [View Map](src/workflows/codemap.md) |
| `src/workflows/briefing-prep/` | WF1: Pre-meeting executive briefing generation with TTS | [View Map](src/workflows/briefing-prep/codemap.md) |
| `src/workflows/curation/` | WF2: Daily RSS feed curation with chunked LLM scoring | [View Map](src/workflows/curation/codemap.md) |
| `src/workflows/weekly-digest/` | WF3: Weekly enterprise-tech intelligence digest | [View Map](src/workflows/weekly-digest/codemap.md) |
| `src/workflows/meeting-followup/` | WF4: Transcript processing with 3-stage LLM pipeline | [View Map](src/workflows/meeting-followup/codemap.md) |
| `config/` | Immutable, environment-driven constants for paths, models, and tunables | [View Map](config/codemap.md) |
| `types/` | Canonical TypeScript interfaces for all domain data structures | [View Map](types/codemap.md) |
| `schemas/` | Zod runtime validation schemas mirroring `types/` | [View Map](schemas/codemap.md) |

## Key Data Flows

### Chat Turn
```
POST /api/chat → server/routes/api.ts → orchestrator.handleTurn()
  → route() classifies intent → dispatch() to sub-agent OR chat fallback
  → sub-agent reads system.md prompt → calls tools via TOOL_REGISTRY
  → writes artifacts to outbox/ → returns result
```

### Artifact Output Structure
```
outbox/
  ├── briefings/          ← WF1: briefing markdown + audio
  ├── audio/              ← WF1: TTS audio files
  ├── confirmations/      ← WF1: confirmation receipts
  ├── feed_summaries.csv  ← WF2: scored article rows
  ├── feed_digest.html    ← WF2: human-readable digest
  ├── weekly_digest.md    ← WF3: weekly intelligence report
  ├── meeting_notes/      ← WF4: latest meeting notes pointer
  ├── meeting-documents/  ← WF4: archived per-meeting markdown
  ├── drafts/             ← WF4: email draft appends
  ├── tasks.csv           ← WF4: action item rows
  ├── kanban_cards.csv    ← WF4: kanban card rows
  └── runs/               ← All: run logs + index CSV
```

## Configuration

| Config Source | Purpose |
|---------------|---------|
| `.env` | Environment variables (API keys, ports, model overrides) |
| `config/paths.ts` | Filesystem layout constants (outbox, assets, logs, metrics) |
| `config/workflows.ts` | Model assignments, workflow tunables, TTS/HITL/server config |
| `test_records/industry_feeds.json` | Default RSS feed list for curation and weekly-digest |

## External Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework for the REST API server |
| `openai` | LLM and TTS API client (via OpenRouter gateway) |
| `zod` | Runtime schema validation for all domain types |
| `rss-parser` | RSS/Atom feed parsing for curation workflows |
| `chokidar` | Filesystem watcher for meeting-followup transcript ingestion |
| `luxon` | Date/time handling (minimal usage) |
| `uuid` | Run ID generation |
| `dotenv` | Environment variable loading |
