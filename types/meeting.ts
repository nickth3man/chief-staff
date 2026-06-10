export interface Attendee {
  name: string;
  email: string;
}

export interface ActionItem {
  action: string;
  owner: string;
  date: string;
}

export interface MeetingNotes {
  date: string;
  meetingName: string;
  attendees: Attendee[];
  attachments: string[];
  summary: string;
  actions: ActionItem[];
  details: string;
  ideasForLater: string[];
  sourceTranscriptPath: string;
  generatedAt: string;
  runId: string;
}

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  meetingName: string;
  generatedAt: string;
  runId: string;
}

export type TaskStatus = 'Pending Review' | 'Approved' | 'Completed';

export interface TaskRow {
  'Task ID': string;
  Title: string;
  Details: string;
  Status: TaskStatus;
  'Created Date': string;
}

export type KanbanListName = 'Backlog' | 'In Progress' | 'Done';

export interface KanbanCard {
  'Card ID': string;
  Title: string;
  Description: string;
  'List Name': KanbanListName;
  'Created Date': string;
}
