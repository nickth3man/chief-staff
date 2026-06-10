# agents/briefing-prep/

## Responsibility

The **Briefing-Prep** sub-agent produces a structured 5-section executive briefing for an upcoming meeting. It synthesizes information from the historical client file (`assets/consultant_x/{Company}/`), event metadata, and optional supplemental context provided by the operator. The output includes a markdown briefing document, a synthesized audio file, and a confirmation file — all written to the `outbox/`.

## Design

- **11-step sequential pipeline**: The `system.md` defines a strict step sequence: validate event → write confirmation → lookup org context → conditional delay → find client file → read → summarize → generate briefing → synthesize audio → write files → return paths. Each step is a discrete tool call with clear preconditions and error handling.
- **Delayed execution**: `delay_until(eventStart)` pauses execution when the meeting is more than 24 hours away (bypassed in test mode via `bypassDelay: boolean`). This supports the "prepare briefing in advance, deliver at the right time" chief-of-staff pattern.
- **Multi-LLM orchestration**: Uses three separate LLM models — `openai/gpt-4o` for document summarization and briefing generation, `openai/gpt-4o-mini-tts` for audio synthesis. Different providers and models are assigned to specific pipeline stages.
- **5-section briefing schema**: The output follows a rigid structure enforced by `BriefingSectionsSchema` (Zod): Key Briefing Items, Briefing Structure & Approach, Exception Handling Strategy (question/response/bridge triples), Stakeholder-Specific Considerations, and Risk Mitigation.
- **Failure modes with graceful degradation**: TTS failures log and continue (markdown briefing still written). LLM timeouts retry with exponential backoff (1s, 4s). Missing org context or client file produce clear surface errors rather than silent failures.
- **Human-in-the-loop**: The `supplementalContext` input allows the operator to inject additional context after a triage prompt; if the operator declines, an empty context is used.

## Flow

1. **Inputs**: `Event` (validated via `EventSchema`), optional `SupplementalContext`, `bypassDelay: boolean`.
2. **Validate** the event payload via Zod. Return error if invalid.
3. **Write confirmation** file to `outbox/confirmations/{event-name}.txt`.
4. **Look up org context** via `lookup_org_context(inviteeEmail)`. If null, HITL prompt asks user.
5. **Conditional delay**: If `bypassDelay` is false AND event is >24h away, suspend via `delay_until(eventStart)`.
6. **Find client file** under `assets/consultant_x/{Company}/` matching invitee name. Error if absent.
7. **Read** the client markdown file content.
8. **Summarize** the document using `openai/gpt-4o`.
9. **Generate briefing**: Compose summary, raw text, and supplemental context into a 5-section briefing via `openai/gpt-4o`.
10. **Synthesize audio**: Convert briefing text to speech via `openai/gpt-4o-mini-tts`.
11. **Write outputs**: Briefing markdown to `outbox/briefings/`, audio to `outbox/audio/`.
12. **Return** `{ notesPath, audioPath }`.

## Integration

- **`schemas/event.ts`** — Consumes `EventSchema`, `OrgContextSchema`, `SupplementalContextSchema`, `BriefingSchema`, and `BriefingSectionsSchema` for input validation and output structure.
- **`types/agent.ts`** — The sub-agent name `'briefing-prep'` is one of the four `SubAgentName` literals used by the orchestrator for dispatch.
- **`agents/_shared/strings.ts`** — Uses `generateBriefingSlug()` for filename generation.
- **`agents/_shared/tools.ts`** — Registers its 9 tools via `registerTools('briefing-prep', ...)` for runtime invocation.
- **`assets/consultant_x/`** — Reads client context files organized by company directory then invitee name.
- **`outbox/briefings/`** — Writes the generated briefing markdown document.
- **`outbox/audio/`** — Writes the synthesized audio file.
- **`outbox/confirmations/`** — Writes a confirmation receipt file.
- **Orchestrator** — Dispatched to when `router.ts` detects a meeting-related request (`brief|prepare|meeting|consultation|assessment` or attached `event.json`).
