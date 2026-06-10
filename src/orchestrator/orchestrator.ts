import { route } from '@agents/orchestrator/router';
import { chatCompletion } from '../_shared/llm';
import { MODELS } from '@config/workflows';
import { runBriefingPrep } from '../workflows/briefing-prep/steps';
import { runCuration } from '../workflows/curation/steps';
import { runWeeklyDigest } from '../workflows/weekly-digest/steps';
import { runFollowup } from '../workflows/meeting-followup/steps';
import { createLiveLogger, newRunId } from '../_shared/runLog';
import type { LiveRunLogger } from '../_shared/liveLog';
import type { ChatMessage, OrchestratorDecision, SubAgentName } from '@apptypes/agent';

const CHAT_SYSTEM = `You are the Chief of Staff Orchestrator. The user has asked something that doesn't map cleanly to a workflow. Respond conversationally in a professional, concise chief-of-staff tone. You can ask a clarifying question. Do not invoke any sub-agent for this turn.`;

export interface OrchestratorResult {
  decision: OrchestratorDecision;
  result: { kind: 'dispatch' | 'chat'; content?: string; payload?: unknown };
}

export async function handleTurn(messages: ChatMessage[], attachedFiles: string[] = []): Promise<OrchestratorResult> {
  const decision = route({ messages, attachedFiles });

  // One live log per orchestrator turn. The same runId is reused by any
  // dispatched sub-agent so the two log files can be correlated by ts.
  const runId = newRunId();
  const live: LiveRunLogger = createLiveLogger(runId, 'orchestrator');
  await live.open();
  await live.event('route-decision', {
    subAgent: decision.subAgent,
    rationale: decision.rationale,
    payload: decision.payload,
    attachedFiles,
  });

  if (decision.subAgent === 'curation' && (decision.payload as { hint?: string }).hint === 'no-match') {
    await live.event('chat-fallback', { model: MODELS.orchestrator });
    const t0 = Date.now();
    const chatResult = await chatCompletion(MODELS.orchestrator, [
      { role: 'system', content: CHAT_SYSTEM },
      ...messages.map((m) => ({
        role: (m.role === 'tool' ? 'user' : m.role) as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ]);
    await live.llmCall(MODELS.orchestrator, chatResult, Date.now() - t0);
    await live.complete({ kind: 'chat' });
    return {
      decision,
      result: { kind: 'chat', content: chatResult.content },
    };
  }

  await live.event('dispatch', { subAgent: decision.subAgent, runId });
  try {
    const dispatchResult = await dispatch(decision.subAgent, decision.payload, { runId, live });
    await live.complete({ kind: 'dispatch', subAgent: decision.subAgent });
    return { decision, result: { kind: 'dispatch', payload: dispatchResult } };
  } catch (err) {
    await live.fail(err, { kind: 'dispatch', subAgent: decision.subAgent });
    throw err;
  }
}

async function dispatch(
  subAgent: SubAgentName,
  payload: Record<string, unknown>,
  ctx: { runId: string; live: LiveRunLogger }
): Promise<unknown> {
  // The orchestrator's runId is threaded into the sub-agent so both log files
  // (orchestrator + workflow) share the same identifier and can be correlated
  // by ts.
  switch (subAgent) {
    case 'briefing-prep': {
      const eventPath = (payload.eventPath as string) ?? (payload.event as string) ?? '';
      if (!eventPath) throw new Error('briefing-prep requires an eventPath');
      return runBriefingPrep({ eventPath, bypassDelay: true, runId: ctx.runId });
    }
    case 'curation': {
      const configPath = (payload.configPath as string) ?? 'test_records/feeds.json';
      return runCuration({ configPath, runId: ctx.runId });
    }
    case 'weekly-digest': {
      const configPath = (payload.configPath as string) ?? 'test_records/industry_feeds.json';
      return runWeeklyDigest({ configPath, runId: ctx.runId });
    }
    case 'meeting-followup': {
      const transcriptPath =
        (payload.transcriptPath as string) ?? (typeof payload === 'string' ? (payload as string) : '');
      if (!transcriptPath) throw new Error('meeting-followup requires a transcriptPath');
      return runFollowup({ transcriptPath, runId: ctx.runId });
    }
    default:
      throw new Error(`Unknown sub-agent: ${subAgent}`);
  }
}
