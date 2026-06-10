# src/server/routes/

## Responsibility

Defines all REST API endpoints for the chief-staff HTTP server. The single file `api.ts` exports a Hono sub-application (`api`) mounted at `/api` that provides the web-facing interface for chat interaction, file browsing, CSV data access, run tracking, and human-in-the-loop prompt resolution. This is the thin HTTP adapter layer — all business logic is delegated to the orchestrator and shared services.

## Design

- **Single-file router**: All endpoints are defined in `api.ts` as a flat Hono instance. No route splitting or middleware chains — each handler is a self-contained async function.
- **Thin adapter pattern**: Routes perform minimal JSON parsing and response formatting. The `POST /chat` handler delegates entirely to `orchestrator.handleTurn()`. CSV routes delegate to `_shared/csv.readAll()`. Run tracking delegates to `_shared/runLog`.
- **Path-based file access with allowlist**: `GET /file` resolves absolute paths and validates them against a hardcoded set of allowed root directories (`paths.outbox.root`, `paths.assets.consultantX`, `paths.assets.transcripts`, `paths.assets.meetingDocuments`). Paths outside these roots return 403.
- **Prompt queue bridge**: `GET /prompt` and `POST /prompt/answer` expose the singleton `PromptQueue` for web-mode human-in-the-loop, enabling the UI to poll for pending prompts and submit answers.
- **CSV kind mapping**: `GET /csv` uses a string-to-path map (`tasks`, `kanban`, `context`, `feeds`) to resolve which CSV file to read, returning parsed rows as JSON.

## Flow

```
GET  /api/health         → { ok: true, time }
POST /api/chat           → parse body → enrich timestamps → handleTurn() → JSON result
GET  /api/prompt         → promptQueue.current() → { prompt }
POST /api/prompt/answer  → promptQueue.answer(value) → { ok }
GET  /api/files?kind=    → readdir(outbox/<kind>) → { dir, entries }
GET  /api/file?path=     → resolve + allowlist check → readFile → raw body
GET  /api/csv?which=     → map to path → readAll() → { rows }
GET  /api/runs           → readAll(runs/index.csv) → { rows }
POST /api/runs/track     → newRunId + writeRunLog + appendRunIndex → { runId }
```

## Integration

- **`../../orchestrator/orchestrator`** — `handleTurn()` is the core agentic turn processor called by `POST /chat`.
- **`../promptQueue`** — Singleton `PromptQueue` for web-mode HITL bridging.
- **`../../_shared/runLog`** — `newRunId()`, `writeRunLog()`, `appendRunIndex()` for run persistence.
- **`../../_shared/csv`** — `readAll()` for CSV file parsing.
- **`@config/paths`** — All filesystem path constants for outbox, assets, logs.
- **`hono`** — HTTP framework providing routing, JSON helpers, and static file serving.
