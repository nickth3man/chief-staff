import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventSchema, BriefingSchema } from '@schemas/event';
import { paths } from '@config/paths';
import { chatCompletion } from '../../_shared/llm';
import { synthesizeSpeech } from '../../_shared/tts';
import { findOrgContextByEmail, findClientFile } from '../../_shared/context';
import { writeConfirmation } from '../../_shared/email';
import { writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger } from '../../_shared/runLog';
import type { LiveRunLogger } from '../../_shared/liveLog';
import { askUser } from '../../_shared/hitl';
import { generateBriefingSlug } from '../../../agents/_shared/strings';
import { MODELS, TTS, HITL } from '@config/workflows';
import { BRIEFING_SYSTEM, BRIEFING_USER, RENDER_MARKDOWN, SUMMARIZE_SYSTEM, SUMMARIZE_USER } from './prompts';
import type { Briefing, Event, OrgContext, SupplementalContext } from '@apptypes/event';

export interface BriefingRunOptions {
  eventPath: string;
  bypassDelay?: boolean;
  supplementalContext?: SupplementalContext;
  /** Optional caller-supplied run id (e.g. from the orchestrator) for log correlation. */
  runId?: string;
}

export async function runBriefingPrep(opts: BriefingRunOptions): Promise<Briefing> {
  const runId = opts.runId ?? newRunId();
  const startedAt = new Date().toISOString();
  const tokensIn = 0;
  const tokensOut = 0;
  const costUsd = 0;

  const live: LiveRunLogger = createLiveLogger(runId, 'briefing-prep');
  await live.open();

  await writeRunLog({
    runId,
    workflow: 'briefing-prep',
    startedAt,
    status: 'running',
    tokensIn,
    tokensOut,
    costUsd,
  });

  try {
    const eventRaw = await fs.readFile(opts.eventPath, 'utf8');
    const event = EventSchema.parse(JSON.parse(eventRaw));
    await live.event('event-loaded', { eventPath: opts.eventPath });

    const confirmationPath = await writeConfirmation(event);
    console.log(`[wf1] confirmation written: ${confirmationPath}`);
    await live.event('confirmation-written', { confirmationPath });

    const orgContext = await findOrgContextByEmail(paths.outbox.context, event['Invitee Electronic Address']);
    if (!orgContext) {
      console.warn(`[wf1] no org context for ${event['Invitee Electronic Address']}`);
    }
    await live.event('org-context', { found: Boolean(orgContext), email: event['Invitee Electronic Address'] });

    let supplementalContext: SupplementalContext = opts.supplementalContext ?? {};
    if (!opts.supplementalContext && HITL.mode !== 'web') {
      const triage = await askUser({
        question: 'Any new input or additional details to be considered?',
        options: ['Yes', 'No'],
      });
      if (triage.answer === 'Yes') {
        const freeText = await askUser({ question: 'Free-text additional information (or empty):' });
        const urlsText = await askUser({ question: 'Any reference URLs? (comma-separated, or empty):' });
        supplementalContext = {
          'Free Text (Additional Information)': freeText.answer,
          'Any reference URLs:': urlsText.answer
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }
    }

    const company = orgContext?.['Target Company Name'] ?? '';
    if (!company) {
      throw new Error('No org context found; cannot resolve client file.');
    }

    const clientFile = await findClientFile(paths.assets.consultantX, company, event['Invitee Name']);
    if (!clientFile) {
      throw new Error(`No client file found for ${event['Invitee Name']} in ${company}.`);
    }
    await live.event('client-file', { path: clientFile });

    const targetFileContent = await fs.readFile(clientFile, 'utf8');

    await live.event('step-1-summarize', { model: MODELS.wf1.llm });
    const t0 = Date.now();
    const summaryResult = await chatCompletion(MODELS.wf1.llm, [
      { role: 'system', content: SUMMARIZE_SYSTEM },
      { role: 'user', content: SUMMARIZE_USER(targetFileContent) },
    ]);
    await live.llmCall(MODELS.wf1.llm, summaryResult, Date.now() - t0);
    const summary = summaryResult.content;

    await live.event('step-2-briefing-json', { model: MODELS.wf1.llm });
    const t1 = Date.now();
    const briefingJsonResult = await chatCompletion(
      MODELS.wf1.llm,
      [
        { role: 'system', content: BRIEFING_SYSTEM },
        { role: 'user', content: BRIEFING_USER({ summary, rawText: targetFileContent, supplementalContext }) },
      ],
      { responseFormat: 'json' }
    );
    await live.llmCall(MODELS.wf1.llm, briefingJsonResult, Date.now() - t1);

    const parsed = JSON.parse(briefingJsonResult.content);
    const markdown = RENDER_MARKDOWN(parsed);

    const totalTokensIn = summaryResult.tokensIn + briefingJsonResult.tokensIn;
    const totalTokensOut = summaryResult.tokensOut + briefingJsonResult.tokensOut;
    const totalCost = summaryResult.costUsd + briefingJsonResult.costUsd;

    const briefing: Briefing = BriefingSchema.parse({
      event,
      orgContext,
      summary,
      sections: parsed,
      markdown,
      generatedAt: new Date().toISOString(),
      runId,
    });

    if (!opts.bypassDelay) {
      const target = new Date(event['Event Start']).getTime() - 24 * 3600_000;
      while (Date.now() < target) {
        const remaining = target - Date.now();
        if (remaining > 60_000) {
          await new Promise((r) => setTimeout(r, 60_000));
        } else {
          await new Promise((r) => setTimeout(r, Math.max(remaining, 0)));
        }
      }
    }

    let audioPath: string | null = null;
    try {
      audioPath = path.join(paths.outbox.audio, 'briefing_temp.mp3');
      await synthesizeSpeech(markdown, audioPath, { voice: TTS.voice, model: MODELS.wf1.tts });
      await live.event('tts-done', { audioPath, model: MODELS.wf1.tts });
    } catch (ttsErr) {
      // Per the sub-agent's failure-mode spec: TTS failure is non-fatal.
      // The markdown briefing is still written; the operator can review the
      // generated text and decide whether to retry TTS separately. This
      // matters because OpenRouter does not currently host openai/gpt-4o-mini-tts
      // (or any TTS model as of 2026-06-02) — the TTS step will 400 unless
      // we find a working alternative.
      const ttsErrMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
      console.warn(`[wf1] TTS failed (non-fatal): ${ttsErrMsg}`);
      await live.event('tts-failed', { error: ttsErrMsg, model: MODELS.wf1.tts });
      audioPath = null;
    }

    const slug = generateBriefingSlug(event['Event Name']);
    const notesPath = path.join(paths.outbox.briefings, `${slug}_notes.md`);
    const finalAudioPath = path.join(paths.outbox.briefings, `${slug}_audio.mp3`);
    await fs.mkdir(paths.outbox.briefings, { recursive: true });
    await fs.writeFile(notesPath, markdown, 'utf8');
    if (audioPath) {
      try {
        await fs.copyFile(audioPath, finalAudioPath);
        await fs.unlink(audioPath).catch(() => {});
      } catch (copyErr) {
        console.warn(`[wf1] failed to copy audio: ${(copyErr as Error).message}`);
      }
    }
    await live.event('artifacts-written', {
      notesPath,
      audioPath: audioPath ? finalAudioPath : null,
    });

    await appendCost({
      date: new Date().toISOString().slice(0, 10),
      workflow: 'briefing-prep',
      model: MODELS.wf1.llm,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: totalCost,
    });

    const endedAt = new Date().toISOString();
    await writeRunLog({
      runId,
      workflow: 'briefing-prep',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: totalCost,
      notes: `notes=${notesPath}; audio=${finalAudioPath}`,
    });
    await appendRunIndex({
      runId,
      workflow: 'briefing-prep',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: totalCost,
    });

    await live.complete({
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: totalCost,
      notesPath,
      audioPath: finalAudioPath,
    });

    return briefing;
  } catch (err) {
    await writeRunLog({
      runId,
      workflow: 'briefing-prep',
      startedAt,
      endedAt: new Date().toISOString(),
      status: 'failed',
      tokensIn,
      tokensOut,
      costUsd,
      notes: err instanceof Error ? err.message : String(err),
    });
    await live.fail(err, { tokensIn, tokensOut, costUsd });
    throw err;
  }
}
