import type { SubAgentName, ToolCall, ToolResult } from '../../types/agent.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any) => Promise<any>;
}

const TOOL_REGISTRY: Record<SubAgentName, ToolDefinition[]> = {
  'briefing-prep': [],
  curation: [],
  'weekly-digest': [],
  'meeting-followup': [],
};

export function registerTools(subAgent: SubAgentName, tools: ToolDefinition[]): void {
  TOOL_REGISTRY[subAgent] = tools;
}

export function getTools(subAgent: SubAgentName): ToolDefinition[] {
  return TOOL_REGISTRY[subAgent] ?? [];
}

export async function invokeTool(call: ToolCall): Promise<ToolResult> {
  for (const tools of Object.values(TOOL_REGISTRY)) {
    const tool = tools.find((t) => t.name === call.tool);
    if (tool) {
      try {
        const data = await tool.handler(call.args);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  return { ok: false, error: `Tool not found: ${call.tool}` };
}

export function listAllTools(): Array<{ subAgent: SubAgentName; tools: ToolDefinition[] }> {
  return (Object.keys(TOOL_REGISTRY) as SubAgentName[]).map((subAgent) => ({
    subAgent,
    tools: TOOL_REGISTRY[subAgent],
  }));
}
