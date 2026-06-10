# agents/_shared/

## Responsibility

Provides cross-cutting shared utilities used by the orchestrator and all four sub-agents. Contains two modules: a **tool registry system** (`tools.ts`) for agent tool lifecycle management, and **string formatting helpers** (`strings.ts`) for filename and slug generation. This directory ensures consistent tool invocation and string normalization across the agent system without duplicating logic.

## Design

- **Static tool registry**: `tools.ts` implements a module-level `TOOL_REGISTRY` — a `Record<SubAgentName, ToolDefinition[]>` that maps each of the four sub-agents to an array of tool definitions. Tools are registered imperatively via `registerTools(subAgent, tools)` and retrieved via `getTools(subAgent)`.
- **Uniform tool interface**: Each tool is defined as a `ToolDefinition` with `name`, `description`, `inputSchema`, and `handler` — an async function `(args: any) => Promise<any>`. This enables the agent runtime to discover, document, and invoke tools through a single abstraction.
- **Dispatch-by-name invocation**: `invokeTool(call: ToolCall)` iterates all sub-agent registries sequentially to find a matching tool name, calls its handler, and returns a `ToolResult` — either `{ ok: true, data }` or `{ ok: false, error }`. This allows any agent runtime to invoke any registered tool without knowing which sub-agent registered it.
- **Utility functions**: `listAllTools()` enables introspection of the full tool surface across all sub-agents.
- **String utilities**: `strings.ts` provides pure functions — `slugify` (lowercase, alphanumeric + hyphens), `formatRunTimestamp` (UTC-padded datetime string `YYYYMMDDHHmmss`), `generateMeetingFilename` (composes slug + timestamp + `.md`), and `generateBriefingSlug` (slugified event name).

## Flow

1. **Initialization**: At startup, each sub-agent module calls `registerTools(subAgent, [...])` to populate its entry in `TOOL_REGISTRY`.
2. **Execution**: During a sub-agent run, the agent runtime calls `getTools(subAgent)` to present available tools to the LLM, or calls `invokeTool(call)` to execute a chosen tool.
3. **Resolution**: `invokeTool` performs a linear scan across all four sub-agent registries. The first match wins. If no match is found, it returns `{ ok: false, error: "Tool not found: ..." }`.
4. **Error handling**: Handler exceptions are caught and wrapped into `{ ok: false, error: string }` results; the caller is responsible for interpreting the error.
5. **Filename generation**: Sub-agents call `slugify`, `formatRunTimestamp`, `generateMeetingFilename`, or `generateBriefingSlug` during artifact-writing steps to produce deterministic, sortable filenames.

## Integration

- **`types/agent.ts`** — Provides the `SubAgentName` union type, `ToolCall`, and `ToolResult` interfaces consumed by `tools.ts`. Establishes the type contract for the entire tool registry.
- **All sub-agent runtimes** — Call `registerTools()` during initialization and `getTools()`/`invokeTool()` during execution. The registry design means sub-agents can share tools (though currently each sub-agent defines its own set).
- **Orchestrator** — The orchestrator does not directly use tool functions but dispatches to sub-agents that do. The `isConversational()` function in the router determines whether a dispatch is needed or a chat response suffices.
- The string utilities are pure functions with zero dependencies, usable anywhere in the system.
