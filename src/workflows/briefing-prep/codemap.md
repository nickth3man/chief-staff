# src/workflows/briefing-prep/

## Responsibility
Generates pre-meeting executive briefings (WF1). Given a calendar event JSON file, it reads the associated client performance document, produces a summarised briefing in a strict 5-section JSON schema, renders it as Markdown, optionally synthesises an audio version via TTS, and delays writing the final artifacts until 24 hours before the meeting start time. The briefing covers key items, meeting structure, exception handling, stakeholder considerations, and risk mitigation.

## Design
- **3-module architecture**: `run.ts` (CLI entry), `steps.ts` (orchestration), `prompts.ts` (prompt templates + Markdown renderer).
- **Two-phase LLM pipeline**: Phase 1 produces a concise summary of the client document via `SUMMARIZE_SYSTEM`/`SUMMARIZE_USER`. Phase 2 feeds that summary plus the full raw document and optional supplemental context into `BRIEFING_SYSTEM`/`BRIEFING_USER` with `responseFormat: 'json'` to produce a structured 5-section briefing object.
- **Human-in-the-loop (HITL) hook**: Before LLM processing, the workflow interactively prompts the user via `askUser()` for supplemental context (free-text notes, reference URLs) unless `HITL.mode === 'web'` or supplemental context was already provided programmatically.
- **TTS as non-fatal side effect**: Audio synthesis via `synthesizeSpeech()` is attempted but failures are caught and logged as warnings — the markdown briefing is still written. This resilience handles the case where OpenRouter does not host the requested TTS model.
- **Scheduled delay loop**: After generation, the workflow sleeps until 24 hours before `event['Event Start']`, polling every 60s. This ensures the briefing is delivered fresh at a useful pre-meeting interval. The `--bypass-delay` flag skips this for testing.
- **Artifact naming**: Uses `generateBriefingSlug(eventName)` to produce a deterministic, human-readable slug for both `_notes.md` and `_audio.mp3` files in `paths.outbox.briefings`.

## Flow
1. `run.ts` parses `--event <path>` (required) and `--bypass-delay` (optional).
2. `runBriefingPrep()` is invoked with the event path and options.
3. A run ID is generated, live logger opened, and initial `running` status written to the run log.
4. The event JSON is read from disk and validated against `EventSchema` (Zod).
5. A confirmation email text is written to the outbox via `writeConfirmation(event)`.
6. Org context is looked up by the invitee's email address (`findOrgContextByEmail`); a warning is logged if none is found.
7. If no supplemental context was provided and HITL is in CLI mode, the user is interactively prompted for additional notes and URLs.
8. The client file is resolved via `findClientFile` using the company name from org context; the workflow fails hard if not found.
9. **Phase 1 (summarise)**: `chatCompletion(MODELS.wf1.llm, ...)` with `SUMMARIZE_SYSTEM` + `SUMMARIZE_USER(rawText)`.
10. **Phase 2 (briefing JSON)**: `chatCompletion(MODELS.wf1.llm, ..., { responseFormat: 'json' })` with `BRIEFING_SYSTEM` + `BRIEFING_USER({ summary, rawText, supplementalContext })`.
11. The parsed JSON is rendered to Markdown via `RENDER_MARKDOWN()`.
12. Token/cost totals are aggregated from both LLM calls.
13. The result is validated with `BriefingSchema.parse()`.
14. If not bypassed, enters the delay loop waiting until T-24h from meeting start.
15. TTS is attempted (non-fatal); on failure, `audioPath` remains null.
16. Artifacts (notes Markdown, optionally audio MP3) are written to `paths.outbox.briefings/`.
17. Cost is appended, run log is updated to `completed`, run index is appended, live logger is closed with summary.
18. On any error, run log is set to `failed`, live logger records the failure, and the error is rethrown.

## Integration
- **Consumers**: CLI invocations (manual or cron). The `runId` parameter in `BriefingRunOptions` suggests future orchestration integration for log correlation.
- **Dependencies**: `@schemas/event` (EventSchema, BriefingSchema), `@apptypes/event` (Briefing, Event, OrgContext, SupplementalContext types), `@config/paths` (outbox, assets paths), `@config/workflows` (MODELS.wf1.llm/.tts, TTS, HITL).
- **Shared modules**: `../../_shared/llm` (chatCompletion), `../../_shared/tts` (synthesizeSpeech), `../../_shared/context` (findOrgContextByEmail, findClientFile), `../../_shared/email` (writeConfirmation), `../../_shared/runLog` (writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger), `../../_shared/liveLog` (LiveRunLogger), `../../_shared/hitl` (askUser).
- **Agent-level helpers**: `../../../agents/_shared/strings` (generateBriefingSlug).
- **Outputs**: Markdown briefing notes + optional MP3 file in `paths.outbox.briefings/`.
