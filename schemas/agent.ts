import { z } from 'zod';

export const SubAgentNameSchema = z.enum([
  'briefing-prep',
  'curation',
  'weekly-digest',
  'meeting-followup',
]);

export const WorkflowNameSchema = SubAgentNameSchema;

export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const RunRecordSchema = z.object({
  runId: z.string().uuid(),
  workflow: WorkflowNameSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  status: RunStatusSchema,
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const ChatRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
  subAgent: SubAgentNameSchema.optional(),
  toolCall: z
    .object({
      tool: z.string(),
      args: z.record(z.unknown()),
    })
    .optional(),
  toolResult: z
    .object({
      ok: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
});

export const OrchestratorDecisionSchema = z.object({
  subAgent: SubAgentNameSchema,
  payload: z.record(z.unknown()),
  rationale: z.string(),
});
