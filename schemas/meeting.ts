import { z } from 'zod';

export const AttendeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const ActionItemSchema = z.object({
  action: z.string().min(1),
  owner: z.string().min(1),
  date: z.string().min(1),
});

export const MeetingNotesSchema = z.object({
  date: z.string().min(1),
  meetingName: z.string().min(1),
  attendees: z.array(AttendeeSchema),
  attachments: z.array(z.string()),
  summary: z.string(),
  actions: z.array(ActionItemSchema),
  details: z.string(),
  ideasForLater: z.array(z.string()),
  sourceTranscriptPath: z.string(),
  generatedAt: z.string().datetime(),
  runId: z.string().uuid(),
});

export const EmailDraftSchema = z.object({
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()),
  subject: z.string(),
  body: z.string().max(2000),
  meetingName: z.string(),
  generatedAt: z.string().datetime(),
  runId: z.string().uuid(),
});

export const TaskStatusSchema = z.enum(['Pending Review', 'Approved', 'Completed']);

export const TaskRowSchema = z.object({
  'Task ID': z.string(),
  Title: z.string(),
  Details: z.string(),
  Status: TaskStatusSchema,
  'Created Date': z.string(),
});

export const KanbanListNameSchema = z.enum(['Backlog', 'In Progress', 'Done']);

export const KanbanCardSchema = z.object({
  'Card ID': z.string(),
  Title: z.string(),
  Description: z.string(),
  'List Name': KanbanListNameSchema,
  'Created Date': z.string(),
});
