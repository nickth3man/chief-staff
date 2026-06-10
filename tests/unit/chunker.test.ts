import { describe, it, expect } from 'vitest';
import { chunk, dedupe, filterRecent } from '@agents/curation/_shared/chunker';
import type { FeedItem } from '@apptypes/curation';

function makeItem(i: number, ageHours: number): FeedItem {
  const date = new Date(Date.now() - ageHours * 3600_000).toISOString();
  return {
    guid: `g${i}`,
    title: `Item ${i}`,
    description: `desc ${i}`,
    pubDate: date,
    url: `https://example.com/${i}`,
  };
}

describe('chunk', () => {
  it('returns a single chunk when items fit', () => {
    const chunks = chunk([makeItem(1, 1), makeItem(2, 1)], 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('splits into multiple chunks', () => {
    const items = Array.from({ length: 25 }, (_, i) => makeItem(i, 1));
    const chunks = chunk(items, 10);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(10);
    expect(chunks[1]).toHaveLength(10);
    expect(chunks[2]).toHaveLength(5);
  });
});

describe('dedupe', () => {
  it('removes duplicate URLs', () => {
    const urls = ['https://a', 'https://b', 'https://a', 'https://c'];
    expect(dedupe(urls)).toEqual(['https://a', 'https://b', 'https://c']);
  });
});

describe('filterRecent', () => {
  it('keeps items inside the window', () => {
    const items = [makeItem(1, 1), makeItem(2, 23), makeItem(3, 25)];
    const recent = filterRecent(items, 24);
    expect(recent).toHaveLength(2);
    expect(recent.map((i) => i.guid)).toEqual(['g1', 'g2']);
  });
});
