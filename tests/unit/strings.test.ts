import { describe, it, expect } from 'vitest';
import { slugify, generateMeetingFilename, formatRunTimestamp } from '@agents/_shared/strings';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips non-alphanumerics', () => {
    expect(slugify('SaaS Performance & Infrastructure Review!')).toBe('saas-performance-infrastructure-review');
  });
  it('collapses multiple dashes', () => {
    expect(slugify('Foo  ---  Bar')).toBe('foo-bar');
  });
});

describe('generateMeetingFilename', () => {
  it('produces {slug}-{ts}.md', () => {
    const date = new Date('2026-06-07T15:30:00Z');
    expect(generateMeetingFilename('SaaS Performance Review', date)).toMatch(
      /^saas-performance-review-\d{14}\.md$/
    );
  });
});

describe('formatRunTimestamp', () => {
  it('formats YYYYMMDDHHmmss', () => {
    const date = new Date('2026-06-07T15:30:45Z');
    expect(formatRunTimestamp(date)).toBe('20260607153045');
  });
});
