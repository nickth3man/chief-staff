# Chief of Staff — Local-First Agent System

A local-first agent system that coordinates four specialized sub-agents through a chief-of-staff orchestrator. The system runs entirely on your machine, routes LLM calls through OpenRouter, and persists state to plain CSV/Markdown files you control.

## Sub-agents

| Sub-agent | Workflow | What it does |
| --- | --- | --- |
| `briefing-prep` | WF1 | Prepares a 5-section executive briefing for an upcoming meeting |
| `curation` | WF2 | Runs daily news curation with a 4-question rubric, chunked LLM scoring |
| `weekly-digest` | WF3 | Compiles the weekly enterprise-tech digest (no time filter) |
| `meeting-followup` | WF4 | Processes a meeting transcript into notes, email draft, tasks, and kanban card |

See `agents/*/system.md` for each sub-agent's system prompt and `workflows/workflow-*.md` for the data-flow doc.

## Quick start

```bash
pnpm install
cp .env.example .env
# add your OPENROUTER_API_KEY to .env

# Run the web UI (chat + outbox)
pnpm dev

# Run a workflow directly
pnpm wf1 -- --event test_records/event.json --bypass-delay
pnpm wf2 -- --config test_records/feeds.json
pnpm wf3 -- --config test_records/industry_feeds.json
pnpm wf4   # watcher mode; drop a .txt into assets/transcripts/
```

Open <http://localhost:3000> to use the chat UI.

## Project structure

```
.
├── agents/                  # Sub-agent system prompts + shared router
├── assets/                  # Source material (consultant_x, transcripts)
├── config/                  # paths.ts, workflows.ts
├── docs/                    # Architecture, data model
├── outbox/                  # Generated artifacts (CSV, MD, HTML, MP3)
├── public/                  # Static Web UI
├── schemas/                 # zod validators mirroring types/
├── src/
│   ├── _shared/             # csv, llm, tts, runLog, hitl, email, context
│   ├── orchestrator/        # the chief-of-staff orchestrator
│   ├── server/              # Hono API + static server
│   └── workflows/           # WF1-WF4 implementations
├── tests/                   # vitest specs + fixtures
├── types/                   # TypeScript types
└── workflows/               # Authoritative workflow documentation
```

## Configuration

All config is via environment variables (see `.env.example`). The canonical model IDs are in `config/workflows.ts` and mirrored in `workflows/ALL_WORKFLOWS_DIAGRAM.md`.

## Testing

```bash
pnpm test
```

Unit tests cover the schema validators, the orchestrator router, the chunker helpers, and the CSV utilities. End-to-end tests for each workflow live in `tests/integration/` and require a valid `OPENROUTER_API_KEY` to run against the live LLM.

## License

Private scaffold. Add a license before public release.
