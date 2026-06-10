# agents/orchestrator/

## Responsibility

The orchestrator is the entry-point classifier and dispatcher for the chief-of-staff system. It receives user chat messages with optional file attachments, applies rule-based routing to determine which sub-agent should handle the request, and returns an `OrchestratorDecision` containing the selected sub-agent name, payload, and rationale. It also provides a conversational fallback for requests that do not match any workflow.

## Design

- **Rule-based classifier**: `route()` in `router.ts` implements a deterministic decision tree using regex keyword matching against the last user message and filename-extension heuristics on attached files. No ML or LLM is involved in routing — it is pure pattern matching.
- **Routing precedence**: The decision tree evaluates in priority order:
  1. **meeting-followup** — Attached `.txt` transcript file OR keywords `(transcript|follow-up|meeting notes)`.
  2. **briefing-prep** — Attached `event.json` file OR keywords `(brief|prepare|meeting|consultation|assessment)`.
  3. **weekly-digest** — Keywords `(weekly|this week|research digest|enterprise)`.
  4. **curation** — Keywords `(daily|news|today|curation|24h)`.
  5. **Default fallback** — curation with `payload: { hint: 'no-match' }` signaling conversational mode.
- **Conversational detection**: The `isConversational()` function inspects the decision payload for `hint === 'no-match'` to distinguish genuine curation requests from unclassifiable queries.
- **System prompt**: `system.md` defines the LLM-facing orchestrator behavior — it mirrors the `router.ts` logic but in natural language with an additional `ask_user` output kind for human-in-the-loop clarification. The system prompt is the authoritative specification; `router.ts` is the code-based implementation.
- **Payload forwarding**: The `OrchestratorDecision.payload` is an opaque `Record<string, unknown>` that carries sub-agent-specific parameters (e.g., `transcriptPath`, `eventPath`, `hint`).

## Flow

1. **Input**: `RouterInput` with `messages: ChatMessage[]` and optional `attachedFiles: string[]`.
2. **Extract**: `lastUserText()` scans `messages` in reverse order to find the most recent user message.
3. **Classify**: The router applies regex tests in precedence order against the extracted text and filename list.
4. **Decide**: Returns an `OrchestratorDecision` validated through `OrchestratorDecisionSchema.parse()` via Zod.
5. **Post-route**: The caller (agent runner) checks `isConversational(decision)` — if true, it responds directly to the user rather than dispatching to a sub-agent.

## Integration

- **`types/agent.ts`** — Provides `SubAgentName`, `OrchestratorDecision`, `ChatMessage`, and the `RouterInput` shape used by `router.ts`.
- **`schemas/agent.ts`** — `OrchestratorDecisionSchema` (Zod) validates the output of `route()` before it is returned to the caller.
- **Agent runner** — The runtime that calls `route()`, interprets the decision, and either dispatches to the selected sub-agent or generates a conversational response.
- **Web UI** — May display the `rationale` field from the decision to explain why a particular sub-agent was selected.
- **`agents/_shared/tools.ts`** — Not directly consumed by the orchestrator, but the sub-agents it dispatches to rely on the tool registry.
- **All four sub-agent directories** — Each is a potential target of an orchestrator dispatch, identified by `SubAgentName`.
