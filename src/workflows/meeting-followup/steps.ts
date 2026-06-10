import { promises as fs } from 'node:fs';
import path from 'node:path';
import { paths } from '@config/paths';
import { appendRow } from '../../_shared/csv';
import { writeRunLog, appendRunIndex, newRunId, appendCost, createLiveLogger } from '../../_shared/runLog';
import type { LiveRunLogger } from '../../_shared/liveLog';
import { generateMeetingFilename } from '../../../agents/_shared/strings';
import { extractMetadata, polishNotes, draftEmail } from './prompts';
import { MODELS } from '@config/workflows';
import type { EmailDraft, MeetingNotes } from '@apptypes/meeting';

const TASKS_HEADER = ['Task ID', 'Title', 'Details', 'Status', 'Created Date'];
const KANBAN_HEADER = ['Card ID', 'Title', 'Description', 'List Name', 'Created Date'];

export interface FollowupOptions {
  transcriptPath: string;
  requireApproval?: boolean;
  /** Optional caller-supplied run id (e.g. from the orchestrator) for log correlation. */
  runId?: string;
}

export async function runFollowup(opts: FollowupOptions): Promise<{ notesPath: string; email: EmailDraft }> {
  const runId = opts.runId ?? newRunId();
  const startedAt = new Date().toISOString();
  const live: LiveRunLogger = createLiveLogger(runId, 'meeting-followup');
  await live.open();
  await writeRunLog({
    runId,
    workflow: 'meeting-followup',
    startedAt,
    status: 'running',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  });

  try {
    const transcript = await fs.readFile(opts.transcriptPath, 'utf8');
    const mtime = (await fs.stat(opts.transcriptPath)).mtime;
    const filename = path.basename(opts.transcriptPath);
    await live.event('transcript-loaded', { path: opts.transcriptPath, bytes: transcript.length });

    const metadata = await extractMetadata(transcript, { logger: live });
    const notes = await polishNotes(transcript, metadata, opts.transcriptPath, runId, { logger: live });

    const notesPath = path.join(
      paths.assets.meetingDocuments,
      generateMeetingFilename(metadata.meetingName, mtime)
    );
    await fs.mkdir(paths.assets.meetingDocuments, { recursive: true });

    const notesMarkdown = renderNotesMarkdown(notes);
    await fs.writeFile(notesPath, notesMarkdown, 'utf8');
    await live.event('notes-written', { path: notesPath });

    const latestPath = path.join(paths.outbox.meetingNotes, 'meeting_notes.md');
    await fs.mkdir(paths.outbox.meetingNotes, { recursive: true });
    await fs.writeFile(
      latestPath,
      `# Latest Meeting: ${notes.meetingName}\n\n_Per-meeting file: ${path.relative(paths.outbox.root, notesPath)}_\n\n${notes.summary}\n`,
      'utf8'
    );

    if (opts.requireApproval) {
      console.log('[wf4] notes staged at', notesPath, '— approval required.');
    }

    const email = await draftEmail(notes, undefined, { logger: live });
    const block = renderEmailBlock(email);
    await fs.mkdir(paths.outbox.drafts, { recursive: true });
    await fs.appendFile(path.join(paths.outbox.drafts, 'email_draft.txt'), block, 'utf8');
    await live.event('email-drafted', { path: paths.outbox.drafts, to: email.to });

    const today = new Date().toISOString().slice(0, 10);
    for (const action of notes.actions) {
      await appendRow(
        paths.outbox.tasks,
        {
          'Task ID': `TSK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          Title: action.action,
          Details: `Owner: ${action.owner} | Date: ${action.date}`,
          Status: 'Pending Review',
          'Created Date': today,
        },
        TASKS_HEADER
      );
    }
    await appendRow(
      paths.outbox.kanban,
      {
        'Card ID': `KNB-${Date.now()}`,
        Title: `Meeting: ${notes.meetingName}`,
        Description: notes.summary,
        'List Name': 'Done',
        'Created Date': today,
      },
      KANBAN_HEADER
    );
    await live.event('kanban-written', {
      tasks: notes.actions.length,
      path: paths.outbox.tasks,
    });

    const costEstimate = 0.01;
    const endedAt = new Date().toISOString();
    await writeRunLog({
      runId,
      workflow: 'meeting-followup',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
      notes: `notes=${notesPath}; emailTo=${email.to.join(',')}; source=${filename}`,
    });
    await appendRunIndex({
      runId,
      workflow: 'meeting-followup',
      startedAt,
      endedAt,
      status: 'completed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
    });
    await appendCost({
      date: today,
      workflow: 'meeting-followup',
      model: MODELS.wf4.llm,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: costEstimate,
    });

    await live.complete({
      notesPath,
      emailTo: email.to,
      costUsd: costEstimate,
      source: filename,
    });

    return { notesPath, email };
  } catch (err) {
    await writeRunLog({
      runId,
      workflow: 'meeting-followup',
      startedAt,
      endedAt: new Date().toISOString(),
      status: 'failed',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      notes: err instanceof Error ? err.message : String(err),
    });
    await live.fail(err);
    throw err;
  }
}

function renderNotesMarkdown(notes: MeetingNotes): string {
  const lines: string[] = [];
  lines.push(`# Meeting Notes: ${notes.meetingName}`);
  lines.push(`**Date:** ${notes.date}`);
  lines.push('');
  lines.push(`**Meeting Name:** ${notes.meetingName}`);
  lines.push('');
  lines.push('**Attendees:**');
  for (const a of notes.attendees) {
    lines.push(`- ${a.name} (${a.email})`);
  }
  lines.push('');
  lines.push('**Attachments:**');
  for (const att of notes.attachments) {
    lines.push(`- ${att}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary / Key Decisions');
  lines.push(notes.summary);
  lines.push('');
  lines.push('## Actions');
  lines.push('| Action Item | Owner | Date |');
  lines.push('| :--- | :--- | :--- |');
  for (const a of notes.actions) {
    lines.push(`| ${a.action} | ${a.owner} | ${a.date} |`);
  }
  lines.push('');
  lines.push('## Details');
  lines.push(notes.details);
  lines.push('');
  lines.push('## Ideas for Later');
  for (const i of notes.ideasForLater) {
    lines.push(`- ${i}`);
  }
  return lines.join('\n');
}

function renderEmailBlock(email: EmailDraft): string {
  return [
    `To: ${email.to.join(', ')}`,
    `Cc: ${email.cc.join(', ')}`,
    `Subject: ${email.subject}`,
    `Body:`,
    email.body,
    '',
    '---',
    '',
  ].join('\n');
}
