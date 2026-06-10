import type { ChatMessage, OrchestratorDecision, SubAgentName } from '@apptypes/agent';
import { OrchestratorDecisionSchema } from '@schemas/agent';

interface RouterInput {
  messages: ChatMessage[];
  attachedFiles?: string[];
}

const TRANSCRIPT_HINT = /\.(txt)$/i;
const EVENT_HINT = /event\.json$/i;
const BRIEFING_KEYWORDS = /(brief|prepare|meeting|consultation|assessment)/i;
const CURATION_KEYWORDS = /(daily|news|today|curation|24h)/i;
const WEEKLY_KEYWORDS = /(weekly|this week|research digest|enterprise)/i;
const MEETING_FOLLOWUP_KEYWORDS = /(transcript|follow-?up|meeting notes)/i;

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

function hasAttachedTranscript(attachedFiles?: string[]): boolean {
  return Boolean(attachedFiles?.some((f) => TRANSCRIPT_HINT.test(f)));
}

function hasAttachedEvent(attachedFiles?: string[]): boolean {
  return Boolean(attachedFiles?.some((f) => EVENT_HINT.test(f)));
}

export function route(input: RouterInput): OrchestratorDecision {
  const text = lastUserText(input.messages);
  const lower = text.toLowerCase();
  const files = input.attachedFiles ?? [];

  if (hasAttachedTranscript(files) || MEETING_FOLLOWUP_KEYWORDS.test(lower)) {
    return OrchestratorDecisionSchema.parse({
      subAgent: 'meeting-followup' satisfies SubAgentName,
      payload: { transcriptPath: files.find((f) => TRANSCRIPT_HINT.test(f)) ?? text.trim() },
      rationale: 'User mentioned a transcript or attached a .txt file.',
    });
  }

  if (hasAttachedEvent(files) || BRIEFING_KEYWORDS.test(lower)) {
    return OrchestratorDecisionSchema.parse({
      subAgent: 'briefing-prep' satisfies SubAgentName,
      payload: { eventPath: files.find((f) => EVENT_HINT.test(f)) },
      rationale: 'User mentioned a meeting or attached an event.json.',
    });
  }

  if (WEEKLY_KEYWORDS.test(lower)) {
    return OrchestratorDecisionSchema.parse({
      subAgent: 'weekly-digest' satisfies SubAgentName,
      payload: {},
      rationale: 'User asked for the weekly digest.',
    });
  }

  if (CURATION_KEYWORDS.test(lower)) {
    return OrchestratorDecisionSchema.parse({
      subAgent: 'curation' satisfies SubAgentName,
      payload: {},
      rationale: 'User asked for the daily news curation.',
    });
  }

  return OrchestratorDecisionSchema.parse({
    subAgent: 'curation' satisfies SubAgentName,
    payload: { hint: 'no-match' },
    rationale: 'No clear workflow match; defaulting to a chat response.',
  });
}

export function isConversational(decision: OrchestratorDecision): boolean {
  return decision.subAgent === 'curation' && decision.payload.hint === 'no-match';
}
