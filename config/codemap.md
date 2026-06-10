# config/

## Responsibility
Serves as the single source of truth for all application-level configuration in the chief-staff system. Exports immutable, environment-driven constants for filesystem layout, LLM model assignment per sub-agent, workflow tuning parameters, TTS settings, sender identity, HITL mode, HTTP server configuration, and log verbosity. Every module that needs a path, a model name, or a tunable constant imports from this directory.

## Design

### patterns
- **`as const` assertions** — Every exported object is declared `as const`, yielding deeply-readonly literal types that enable type narrowing and prevent accidental mutation at the type level. Paired with companion types (`Paths = typeof paths`) for import.
- **Environment variable override with fallback** — Every configurable value reads `process.env.<VAR>` and falls back to a hard-coded default. This makes the system configurable via `.env` or runtime env without changing code.
- **Hierarchical / namespaced objects** — Configuration is grouped into nested objects (`paths.assets`, `paths.outbox`, `MODELS.wf1`, `WORKFLOW_KNOBS.wf2`) rather than flat exports. This provides self-documenting namespaces and enables destructuring imports.
- **Computed-at-import-time** — Values are computed once at module-evaluation time (e.g., `path.join` in `paths.ts`, `Number()` coercion in `workflows.ts`). No lazy initialization or config-reload mechanism is present.

### abstractions
- **`paths`** (`paths.ts`) — Abstract filesystem layout with four top-level domains: `assets` (input data), `outbox` (generated outputs), `logs`, `metrics`, `testRecords`. Each domain is further subdivided; for example `outbox` has `confirmations`, `briefings`, `audio`, `meetingNotes`, `drafts`, `runs`, and flat CSV/MD files. All paths are absolute, rooted at `PROJECT_ROOT` (one level above `config/`).
- **`MODELS`** (`workflows.ts`) — Model assignment for the chief orchestrator and four workflow sub-agents (`wf1`–`wf4`). Each sub-agent can specify an LLM model; `wf1` also specifies a TTS model; `wf4` further distinguishes between a `schema` model, an `llm` model, and an `email` model.
- **`WORKFLOW_KNOBS`** (`workflows.ts`) — Tunable numeric/boolean parameters for workflow behaviour, currently scoped to `wf2` (RSS curation: chunk size, tier confirmation flag, fetch cap, time window) and `wf3` (fetch cap).
- **`TTS`, `SENDER`, `HITL`, `SERVER`** (`workflows.ts`) — Leaf configuration objects for voice synthesis, outbound email identity, human-in-the-loop mode (cli/web), HTTP server binding, and environment label.

### interface / type surface
```typescript
// paths.ts
export type Paths = typeof paths;

// No explicit config-validator or config-reader abstraction — raw objects are consumed directly.
```

## Flow

### Normal consumption flow
```
process.env              (loaded by dotenv or shell)
    │
    ▼
config/paths.ts ───────► module-scoped path.resolve() / path.join()
config/workflows.ts ───► module-scoped env-read + Number()/string coercion
    │                           │
    │     as const              │
    ▼                           ▼
exports: paths, PROJECT_ROOT    exports: MODELS, WORKFLOW_KNOBS, TTS, SENDER, HITL, SERVER, LOG_LEVEL
    │                           │
    └───────────┬───────────────┘
                ▼
      Importer modules (agents, workflows, tools, services)
```

### Call sequences
1. `paths.ts` calls `fileURLToPath(import.meta.url) → path.dirname → path.resolve('..')` to derive `PROJECT_ROOT`. This is a one-time ESM-compatible __dirname replacement.
2. Each sub-path is computed with `path.join(PROJECT_ROOT, process.env.VAR ?? 'default')`. If the env var is unset, the default relative path is used.
3. `workflows.ts` performs in-line type coercion: `Number(process.env.X ?? fallback)` and string-literal casts like `'mp3' | 'wav' | 'opus'`.

## Integration

### Dependencies
- **`node:path`** — Used in `paths.ts` for platform-safe path construction.
- **`node:url`** — Used in `paths.ts` for ESM-compatible `__filename` derivation.
- **`process.env`** — The implicit global dependency for all overridable values.
- **No application-internal imports** — `config/` is a leaf module; it does not import from `types/`, `schemas/`, or any other project directory.

### Consumers
- **Orchestrator agent** — Reads `MODELS.chief`, `MODELS.orchestrator`, `HITL`, `SERVER`, `LOG_LEVEL`.
- **Briefing-prep agent (wf1)** — Reads `MODELS.wf1`, `paths.outbox.briefings`, `paths.assets.transcripts`.
- **Curation agent (wf2)** — Reads `MODELS.wf2`, `WORKFLOW_KNOBS.wf2`, `paths.outbox.feedSummaries`, `paths.assets.consultantX`.
- **Weekly-digest agent (wf3)** — Reads `MODELS.wf3`, `WORKFLOW_KNOBS.wf3`, `paths.outbox.feedDigest`, `paths.outbox.weeklyDigest`.
- **Meeting-followup agent (wf4)** — Reads `MODELS.wf4`, `paths.outbox.meetingNotes`, `paths.outbox.drafts`, `paths.outbox.tasks`, `paths.outbox.kanban`, `paths.outbox.confirmations`, `paths.outbox.audio`.
- **Metrics / logging services** — Read `paths.logs`, `paths.metrics`.
- **Test setup** — Reads `paths.testRecords` for fixture files.

### boundary / contract
`config/` is a pure constant-emitter. It has no runtime side effects beyond module evaluation. All exports are synchronous, immutable, and available at import time. Any consumer that needs to write to a path composes the full path from these constants rather than constructing its own.
