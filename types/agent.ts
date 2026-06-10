export type ISODateTime = string;
export type UUID = string;

export type SubAgentName =
  | 'briefing-prep'
  | 'curation'
  | 'weekly-digest'
  | 'meeting-followup';

export type WorkflowName = SubAgentName;

export interface RunRecord {
  runId: UUID;
  workflow: WorkflowName;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  notes?: string;
}

export interface HandoffContext {
  sourceSubAgent?: SubAgentName;
  payload: Record<string, unknown>;
  summary: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface OrchestratorDecision {
  subAgent: SubAgentName;
  payload: Record<string, unknown>;
  rationale: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  subAgent?: SubAgentName;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: ISODateTime;
}
