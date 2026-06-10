import { describe, it, expect } from 'vitest';
import { EventSchema, OrgContextSchema, TriageResponseSchema, SupplementalContextSchema } from '@schemas/event';

describe('EventSchema', () => {
  it('accepts a valid event', () => {
    const result = EventSchema.safeParse({
      'Event Name': 'Test Event',
      'Event Start': '2026-06-15T15:00:00Z',
      'Event Duration': '30',
      'Invitee Name': 'Jane Doe',
      'Invitee Electronic Address': 'jane@example.com',
      'Organizer Name': 'Org',
      'Organizer Electronic Address': 'org@example.com',
      Guests: [],
      'Event Type': 'Consultation',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = EventSchema.safeParse({
      'Event Name': 'Test',
      'Event Start': '2026-06-15T15:00:00Z',
      'Event Duration': '30',
      'Invitee Name': 'X',
      'Invitee Electronic Address': 'not-an-email',
      'Organizer Name': 'O',
      'Organizer Electronic Address': 'o@example.com',
      Guests: [],
      'Event Type': 'X',
    });
    expect(result.success).toBe(false);
  });
});

describe('OrgContextSchema', () => {
  it('requires Target Company Name', () => {
    const result = OrgContextSchema.safeParse({ 'Target Company Name': 'Acme' });
    expect(result.success).toBe(true);
  });
});

describe('TriageResponseSchema', () => {
  it('accepts Yes and No', () => {
    expect(TriageResponseSchema.safeParse({ 'Additional Input?': 'Yes' }).success).toBe(true);
    expect(TriageResponseSchema.safeParse({ 'Additional Input?': 'No' }).success).toBe(true);
  });
  it('rejects anything else', () => {
    expect(TriageResponseSchema.safeParse({ 'Additional Input?': 'Maybe' }).success).toBe(false);
  });
});

describe('SupplementalContextSchema', () => {
  it('accepts an empty object', () => {
    expect(SupplementalContextSchema.safeParse({}).success).toBe(true);
  });
  it('accepts a fully populated object', () => {
    const result = SupplementalContextSchema.safeParse({
      'Free Text (Additional Information)': 'Notes',
      'Additional Files (Contextual)': [{ filename: 'a.md', path: '/tmp/a.md' }],
      'Any reference URLs:': ['https://example.com'],
    });
    expect(result.success).toBe(true);
  });
});
