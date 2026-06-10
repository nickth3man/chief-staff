# src/server/

## Responsibility

Provides the **HTTP server layer** for the chief-staff agent system, built with the [Hono](https://hono.dev/) framework. It serves as the **web-facing interface** between external consumers (UI, CLI, scripts) and the core orchestrator logic. Responsibilities include:

- Exposing a RESTful API for chat interaction, file browsing, prompt-based human-in-the-loop (HITL) resolution, CSV data retrieval, and run tracking.
- Serving static front-end assets from `./public/`.
- Hosting a **singleton `PromptQueue`** that bridges the orchestrator's synchronous HITL blocking calls with asynchronous web-driven human responses.
- Delegating all agentic turn processing to `orchestrator.handleTurn()`.

## Design

### Architecture Pattern
**Thin HTTP adapter** — routes perform minimal translation; business logic lives outside this directory in `orchestrator/` and `_shared/`. The server is stateless aside from the in-memory `PromptQueue` singleton.

### Key Types & Interfaces

| File | Export | Role |
|------|--------|------|
| `index.ts` | `default` object `{ port, fetch }` | Hono app export for adapter-hosted deployment (e.g., `bun run`, `node --import tsx`) |
| `routes/api.ts` | `api` (sub-`Hono` instance) | Mounted at `/api`; contains all REST endpoints |
| `promptQueue.ts` | `class PromptQueue`, singleton `promptQueue` | One-slot promise-based queue for orchestrator ↔ web HITL |

### Configuration Injection
- `@config/paths` (`config/paths.ts`): Resolves all filesystem path constants (outbox, assets, logs, metrics) relative to the project root, overridable via environment variables.
- `@config/workflows` (`config/workflows.ts`): Supplies `SERVER.port` and `SERVER.nodeEnv`. The `HITL.mode` config (`cli` | `web`) determines whether the orchestrator uses `promptQueue` (web) or `stdin` (CLI).

### Error Handling
- File access errors (`GET /file`, `GET /csv`, `GET /runs`) are caught and return JSON error responses with appropriate HTTP status codes (400, 403) or empty fallback arrays.
- Missing routes fall through to static file serving via `serveStatic`.

## Flow

### Server Initialisation
```
index.ts
  ├── dotenv/config (loads .env)
  ├── new Hono() app
  ├── app.route('/api', api)          ← mount REST routes
  ├── app.use('/*', serveStatic)      ← fallback to public/
  ├── app.get('/', serveStatic)       ← explicit index.html
  └── export default { port, fetch }  ← adapter-agnostic export
```

### Chat Turn (primary flow)
```
POST /api/chat
  ├── c.req.json() → { messages, attachedFiles? }
  ├── messages.map(m => { ...m, timestamp })   ← enrich with ISO timestamp
  ├── orchestrator.handleTurn(messages, attachedFiles)
  │     └── may call promptQueue.waitForAnswer(prompt)  ← blocks if HITL required
  │           └── resolved by POST /api/prompt/answer
  └── c.json(result)  ← OrchestratorResult
```

### Human-in-the-Loop (HITL) Resolution
```
Orchestrator ──→ promptQueue.waitForAnswer(prompt)
                       │
                       │ (blocks Promise)
                       │
  GET /api/prompt  ────┘ returns { prompt }  (polled by UI)
  POST /api/prompt/answer  ──→ promptQueue.answer(value)  → resolves Promise → orchestrator continues
```

### File & Data Access
```
GET /api/files?kind=<briefings|audio|meeting-notes|meeting-docs|drafts|runs>
  └── fs.readdir(paths.outbox.<kind>) → JSON directory listing

GET /api/file?path=<absolute-path>
  └── path.resolve() + allowed-root check → fs.readFile() → raw body

GET /api/csv?which=<tasks|kanban|context|feeds>
  └── _shared/csv.readAll(file) → JSON { rows }

GET /api/runs
  └── _shared/csv.readAll(outbox/runs/index.csv) → JSON { rows }

POST /api/runs/track
  └── newRunId() + writeRunLog() + appendRunIndex() → JSON { runId }
```

### Health
```
GET /api/health → { ok: true, time: "<ISO timestamp>" }
```

## Integration

### Dependencies (modules consumed by this directory)

| Source Module | Imported By | What it provides |
|---------------|-------------|------------------|
| `../../orchestrator/orchestrator` | `routes/api.ts` | `handleTurn()` — core agentic turn processing, dispatches to 4 sub-agents |
| `../../_shared/runLog` | `routes/api.ts` | `newRunId()`, `writeRunLog()`, `appendRunIndex()` — structured run persistence |
| `../../_shared/csv` | `routes/api.ts` | `readAll()` — CSV file parsing to `Record<string, string>[]` |
| `../promptQueue` | `routes/api.ts` | Singleton `promptQueue` for web-mode HITL |
| `@config/paths` | `index.ts`, `routes/api.ts` | `paths` object — resolved filesystem path constants for outbox/assets/logs/metrics |
| `@config/workflows` | `index.ts` | `SERVER` config — `port` and `nodeEnv` |
| `hono` | `index.ts`, `routes/api.ts` | `Hono` class — HTTP framework with routing, JSON helpers, middleware |
| `hono/serve-static` | `index.ts`, `routes/api.ts` | `serveStatic()` — static file serving middleware |
| `dotenv/config` | `index.ts` | Side-effect import — loads `.env` into `process.env` |

### Consumers (modules that import from this directory)

- **UI / Front-end** (browser) — `GET /`, static assets in `./public/`, `POST /api/chat`, polling `GET /api/prompt`, `POST /api/prompt/answer`.
- **CLI / Scripts** — May import `default.fetch` for programmatic usage or call HTTP endpoints directly.
- **Adapter hosts** (`bun`, `node --import tsx`) — Consume the default export `{ port, fetch }` to start the server.

### Boundary & State

- **Stateless** — No database, no session store. The `PromptQueue` is a single-entry in-memory resolver; it is lost on restart.
- **Filesystem as persistence** — All persistent state (run logs, CSVs, outbox artifacts) lives on disk via `paths` constants. The server reads/writes these files directly.

### Config Surface (environment variables)

| Variable | Default | Used In |
|----------|---------|---------|
| `PORT` | `3000` | `index.ts` via `SERVER.port` |
| `NODE_ENV` | `development` | `index.ts` via `SERVER.nodeEnv` |
| `HITL_MODE` | `cli` | Config — `web` mode enables `promptQueue` path |
| `OUTBOX_DIR` | `outbox` | `routes/api.ts` file listing paths |
| `ASSETS_CONSULTANT_DIR`, `ASSETS_TRANSCRIPTS_DIR`, `ASSETS_MEETING_DOCS_DIR` | `assets/*` | `GET /api/file` allowed root paths |
