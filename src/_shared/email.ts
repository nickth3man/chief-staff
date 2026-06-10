import { promises as fs } from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths';
import { generateBriefingSlug } from '../../agents/_shared/strings';

export async function writeConfirmation(event: {
  'Event Name': string;
  'Invitee Name': string;
  'Invitee Electronic Address': string;
  'Event Start': string;
  'Event Duration': string;
  'Organizer Name': string;
  Guests: string[];
}): Promise<string> {
  const slug = generateBriefingSlug(event['Event Name']);
  const file = path.join(paths.outbox.confirmations, `${slug}.txt`);
  const body = `Hi ${event['Invitee Name']},

Your free SaaS Performance Assessment debrief, and consultation call is successfully scheduled. We are looking forward to helping you with the right insights for your success.

Event Name: ${event['Event Name']}
Event Start: ${event['Event Start']}
Duration: ${event['Event Duration']}

Regards,
${event['Organizer Name']}
`;
  await fs.mkdir(paths.outbox.confirmations, { recursive: true });
  await fs.writeFile(file, body, 'utf8');
  return file;
}
