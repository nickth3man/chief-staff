import type { DateTime } from 'luxon';

export type ISODateTime = string;

export interface Event {
  'Event Name': string;
  'Event Start': ISODateTime;
  'Event Duration': string;
  'Invitee Name': string;
  'Invitee Electronic Address': string;
  'Organizer Name': string;
  'Organizer Electronic Address': string;
  Guests: string[];
  'Event Type': string;
}

export interface OrgContext {
  'Target Company Name': string;
  Industry?: string;
  Size?: string;
  'Last Briefing Date'?: string;
  'Context Notes'?: string;
}

export type TriageAnswer = 'Yes' | 'No';

export interface TriageResponse {
  'Additional Input?': TriageAnswer;
}

export interface SupplementalFile {
  filename: string;
  path: string;
  content?: string;
}

export interface SupplementalContext {
  'Free Text (Additional Information)'?: string;
  'Additional Files (Contextual)'?: SupplementalFile[];
  'Any reference URLs:'?: string[];
}

export interface BriefingSections {
  'Key Briefing Items': string[];
  'Briefing Structure & Approach': string;
  'Exception Handling Strategy': Array<{ question: string; response: string; bridge: string }>;
  'Stakeholder-Specific Considerations': string;
  'Risk Mitigation': string;
}

export interface Briefing {
  event: Event;
  orgContext: OrgContext | null;
  summary: string;
  sections: BriefingSections;
  markdown: string;
  generatedAt: ISODateTime;
  runId: string;
}
