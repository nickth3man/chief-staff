import { chatCompletion } from '../../_shared/llm';
import { MODELS } from '@config/workflows';
import { AttendeeSchema, MeetingNotesSchema, EmailDraftSchema } from '@schemas/meeting';
import type { Attendee, MeetingNotes, EmailDraft } from '@apptypes/meeting';
import type { LiveRunLogger } from '../../_shared/liveLog';

const METADATA_SYSTEM = `Extract meeting metadata from the provided transcript. Return strict JSON:
{
  "meetingName": "string",
  "attendees": [{"name": "string", "email": "string"}],
  "date": "string (ISO date or empty)"
}
Use the "Speaker Key:" header when present to extract names and emails. If a speaker is mentioned but no email is in the header, leave the email blank.`;

const METADATA_USER = (text: string) => `Extract metadata from this transcript:\n\n${text.slice(0, 6000)}`;

const NOTES_SYSTEM = `You are a meeting-notes editor. Given a raw transcript and metadata, produce client-ready Markdown meeting notes with EXACTLY these 8 sections in this order:

1. Date
2. Meeting Name
3. Attendees (each on its own line: "- Name (<email>)")
4. Attachments (auto-populated with the source transcript path)
5. Summary / Key Decisions
6. Actions (rendered as a Markdown table with columns: Action Item | Owner | Date)
7. Details
8. Ideas for Later

Output ONLY the Markdown. No preamble.`;

const NOTES_USER = (params: { transcript: string; metadata: object; sourcePath: string }) =>
  `Source transcript path: ${params.sourcePath}\n\nMetadata:\n${JSON.stringify(params.metadata, null, 2)}\n\nTranscript:\n${params.transcript.slice(0, 12000)}`;

const EMAIL_SYSTEM = `You are drafting a follow-up email for a meeting. Output strict JSON:
{
  "to": ["<email>", ...],
  "cc": ["<email>", ...],
  "subject": "<Meeting Name> - Meeting Notes & Follow-up Actions",
  "body": "<under 200 words>"
}
- "to" should include all non-organizer attendees.
- "cc" should include the organizer if not in "to".
- The body must start with a thank-you line and end with EXACTLY: "Let me know if I missed anything. Looking forward to our next call."
- Keep it under 200 words.`;

const EMAIL_USER = (params: { notes: string; attendees: Attendee[]; organizer?: Attendee }) =>
  `Notes:\n${params.notes}\n\nAttendees: ${JSON.stringify(params.attendees)}\n\nOrganizer: ${
    params.organizer ? JSON.stringify(params.organizer) : '(none)'
  }`;

export async function extractMetadata(
  transcript: string,
  opts: { logger?: LiveRunLogger } = {}
): Promise<{ meetingName: string; attendees: Attendee[]; date: string }> {
  if (opts.logger) {
    await opts.logger.event('step-1-extract-metadata', { model: MODELS.wf4.schema });
  }
  const t0 = Date.now();
  let r;
  try {
    r = await chatCompletion(
      MODELS.wf4.schema,
      [
        { role: 'system', content: METADATA_SYSTEM },
        { role: 'user', content: METADATA_USER(transcript) },
      ],
      { responseFormat: 'json', deadlineMs: 180_000 }
    );
  } catch (err) {
    if (opts.logger) {
      await opts.logger.llmCall(
        MODELS.wf4.schema,
        { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
        Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
    throw err;
  }
  if (opts.logger) {
    await opts.logger.llmCall(MODELS.wf4.schema, r, Date.now() - t0);
  }
  const parsed = JSON.parse(r.content);
  const attendees = (parsed.attendees ?? []).map((a: any) => AttendeeSchema.parse(a));
  return { meetingName: parsed.meetingName ?? 'Untitled Meeting', attendees, date: parsed.date ?? '' };
}

export async function polishNotes(
  transcript: string,
  metadata: { meetingName: string; attendees: Attendee[]; date: string },
  sourcePath: string,
  runId: string,
  opts: { logger?: LiveRunLogger } = {}
): Promise<MeetingNotes> {
  if (opts.logger) {
    await opts.logger.event('step-2-polish-notes', { model: MODELS.wf4.llm });
  }
  const t0 = Date.now();
  let r;
  try {
    r = await chatCompletion(
      MODELS.wf4.llm,
      [
        { role: 'system', content: NOTES_SYSTEM },
        { role: 'user', content: NOTES_USER({ transcript, metadata, sourcePath }) },
      ],
      { deadlineMs: 180_000 }
    );
  } catch (err) {
    if (opts.logger) {
      await opts.logger.llmCall(
        MODELS.wf4.llm,
        { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
        Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
    throw err;
  }
  if (opts.logger) {
    await opts.logger.llmCall(MODELS.wf4.llm, r, Date.now() - t0);
  }
  const markdown = r.content.trim();

  const today = metadata.date || new Date().toISOString().slice(0, 10);
  const actions = extractActionsFromMarkdown(markdown);
  const details = extractSection(markdown, 'Details');
  const ideas = extractBulletSection(markdown, 'Ideas for Later');
  const summary = extractSection(markdown, 'Summary / Key Decisions');

  return MeetingNotesSchema.parse({
    date: today,
    meetingName: metadata.meetingName,
    attendees: metadata.attendees,
    attachments: [sourcePath],
    summary,
    actions,
    details,
    ideasForLater: ideas,
    sourceTranscriptPath: sourcePath,
    generatedAt: new Date().toISOString(),
    runId,
  });
}

export async function draftEmail(
  notes: MeetingNotes,
  organizer?: Attendee,
  opts: { logger?: LiveRunLogger } = {}
): Promise<EmailDraft> {
  if (opts.logger) {
    await opts.logger.event('step-3-draft-email', { model: MODELS.wf4.email });
  }
  const t0 = Date.now();
  let r;
  try {
    r = await chatCompletion(
      MODELS.wf4.email,
      [
        { role: 'system', content: EMAIL_SYSTEM },
        {
          role: 'user',
          content: EMAIL_USER({ notes: notes.summary + '\n\nActions:\n' + notes.actions.map((a) => `- ${a.action} (${a.owner}, ${a.date})`).join('\n'), attendees: notes.attendees, organizer }),
        },
      ],
      { responseFormat: 'json', deadlineMs: 180_000 }
    );
  } catch (err) {
    if (opts.logger) {
      await opts.logger.llmCall(
        MODELS.wf4.email,
        { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
        Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
    throw err;
  }
  if (opts.logger) {
    await opts.logger.llmCall(MODELS.wf4.email, r, Date.now() - t0);
  }
  const parsed = JSON.parse(r.content);
  return EmailDraftSchema.parse({
    to: parsed.to ?? [],
    cc: parsed.cc ?? [],
    subject: parsed.subject ?? `${notes.meetingName} - Meeting Notes & Follow-up Actions`,
    body: parsed.body ?? '',
    meetingName: notes.meetingName,
    generatedAt: new Date().toISOString(),
    runId: notes.runId,
  });
}

function extractActionsFromMarkdown(md: string): { action: string; owner: string; date: string }[] {
  const section = extractSection(md, 'Actions');
  const lines = section.split('\n').filter((l) => l.includes('|'));
  return lines
    .filter((l) => !/^\s*\|?\s*-+\s*\|/.test(l))
    .filter((l) => !/^\s*\|?\s*Action Item\s*\|/.test(l))
    .map((l) => {
      const cells = l
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      return { action: cells[0] ?? '', owner: cells[1] ?? '', date: cells[2] ?? '' };
    })
    .filter((a) => a.action.length > 0);
}

function extractSection(md: string, name: string): string {
  const re = new RegExp(`^#+\\s*${escapeRe(name)}\\s*$`, 'im');
  const match = md.match(re);
  if (!match || match.index === undefined) return '';
  const after = md.slice(match.index + match[0].length);
  const nextHeader = after.search(/^#+\s+/m);
  return nextHeader === -1 ? after.trim() : after.slice(0, nextHeader).trim();
}

function extractBulletSection(md: string, name: string): string[] {
  const section = extractSection(md, name);
  return section
    .split('\n')
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
