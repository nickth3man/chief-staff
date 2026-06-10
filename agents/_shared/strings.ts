export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatRunTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

export function generateMeetingFilename(meetingName: string, date: Date = new Date()): string {
  return `${slugify(meetingName)}-${formatRunTimestamp(date)}.md`;
}

export function generateBriefingSlug(eventName: string): string {
  return slugify(eventName);
}
