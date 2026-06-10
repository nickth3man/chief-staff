# CHANGELOG

All notable changes to the chief-staff system are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- WF1: collapsed Path A and Path B into one parameterized path. The HITL gate in Step 4 short-circuits Step 5 when the operator says "No". Net: 19 nodes → 15 nodes, no behavioral change.
- WF1: changed the file pattern keyword from `SaaS Company Performance Assessment` to `SaaS Performance Assessment` (dropped the `Company`).
- WF1: replaced the percent-encoded example filename `Debrief%20-%20Jane%20Doe%20Consulting.txt` with a slug function.
- WF1: changed Step 15 audio destination from `outbox/briefings/briefing_temp.mp3` to `outbox/audio/briefing_temp.mp3` (per the original diagram and the new path).
- WF2: changed Step 10 path from `outbox/news_digest.html` to `outbox/feed_digest.html` (matches reality).
- WF2: removed the duplicate feed `https://aiin5.substack.com/feed` from the canonical 20-feed list (it is still in `test_records/feeds.json` so the dedup test is meaningful).
- WF2: added chunking (10 items/chunk, configurable) and optional tier-confirmation pass to keep LLM context windows in check.
- WF3: changed link style to absolute-only.
- WF3: broadened the audience line to "Enterprise Consultants, ML Engineers, and Architects".
- WF4: changed Step 1 to watch a directory `assets/transcripts/` instead of a singleton file.
- WF4: changed Step 4 output from a singleton `outbox/meeting_notes/meeting_notes.md` to a per-meeting file `assets/meeting-documents/{slug}-{ts}.md` plus a "latest" pointer at `outbox/meeting_notes/meeting_notes.md`.
- WF4: resolved the hardcoded sender via `config/sender.ts`.
- All workflows: canonicalized model IDs. `gpt-4.1` → `openai/gpt-4o`; `claude-haiku-4-5` → `anthropic/claude-3-5-haiku-latest`; `gemini-3-flash` → `google/gemini-2.5-flash`; `claude-sonnet-4-6` → `anthropic/claude-3-5-sonnet-latest`; TTS `openai/gpt-4o-audio-preview` / `openai/gpt-audio` → `openai/gpt-4o-mini-tts`.
- Fixtures: pinned the scenario date to 2026-06-07 across `tasks.csv`, `kanban_cards.csv`, `email_draft.txt`, `meeting_notes.md`, `feed_digest.html`, `feed_summaries.csv`, `weekly_digest.md`.
- Fixtures: reconciled `tasks.csv` and `kanban_cards.csv` vocabularies and removed duplicate description in kanban.

### Added
- `test_records/event.json`, `event-acme.json`, `event-globex.json`.
- `assets/consultant_x/{Company}/{Invitee} SaaS Performance Assessment.md` for 4 invitees.
- `assets/transcripts/acme-2026-06-07.txt`, `globex-2026-06-07.txt`, `acme-parser-eval-2026-06-05.txt`.
- `outbox/confirmations/`, `outbox/briefings/`, `outbox/audio/`, `outbox/runs/`, `outbox/meeting_notes/` directories (with `.gitkeep`).
- `config/paths.ts` — single source of truth for filesystem layout.
- `config/workflows.ts` — single source of truth for model IDs and knobs.
- `agents/orchestrator/system.md` and `agents/orchestrator/router.ts`.
- `agents/briefing-prep/system.md`, `agents/curation/system.md`, `agents/weekly-digest/system.md`, `agents/meeting-followup/system.md`.
- `agents/_shared/strings.ts` (slugify, run timestamp).
- `agents/curation/_shared/chunker.ts` (chunk, dedupe, filterRecent).
- `types/event.ts`, `types/curation.ts`, `types/meeting.ts`, `types/agent.ts`.
- `schemas/event.ts`, `schemas/curation.ts`, `schemas/meeting.ts`, `schemas/agent.ts`.
- TS implementations for all 4 workflows (`src/workflows/*`) plus the orchestrator (`src/orchestrator/`), the Hono server (`src/server/`), and the static Web UI (`public/`).
- Vitest harness with unit tests for schemas, router, chunker, strings, and CSV.
- `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, `vitest.config.ts`.
- `README.md`, `docs/architecture.md`, `docs/data-model.md`.

### Changed
- `tasks.csv` and `kanban_cards.csv` now share a 2026-06-07 scenario date and consistent vocabularies.
- `feed_digest.html` header now distinguishes "Configured Feeds" (21) from "Articles Rendered" (the actual count).

### Notes
- OpenRouter's `openai/gpt-4o-mini-tts` is the chosen TTS model. It is dedicated TTS (faster, cheaper than `gpt-4o-audio-preview`). Voice defaults to `alloy`; configurable via `TTS_VOICE`.
- Per the user's instruction, Firecrawl is reserved for ad-hoc project research by the agent, not used inside the workflows. RSS stays the in-workflow feed source.
- Per the user's instruction, the Web UI is all-TypeScript (Hono server + static HTML/JS frontend) — not FastAPI.
