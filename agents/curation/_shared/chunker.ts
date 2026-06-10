import type { FeedItem } from '@apptypes/curation';

export function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function filterRecent(items: FeedItem[], hours: number, now: Date = new Date()): FeedItem[] {
  const cutoff = now.getTime() - hours * 3600_000;
  return items.filter((it) => {
    const t = Date.parse(it.pubDate);
    if (Number.isNaN(t)) return false;
    return t >= cutoff;
  });
}

export function mergeScores<T extends { Score: number }>(chunks: T[][]): T[] {
  return chunks.flat().sort((a, b) => b.Score - a.Score);
}
