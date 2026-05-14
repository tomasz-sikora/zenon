import type { ToolDefinition, ToolResult } from "@zenon/shared-types";

export type ToolExecutor = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/** Simplified registration format with inline execute function */
export interface SimpleToolRegistration {
  name: string;
  description: string;
  inputSchema: ToolDefinition["inputSchema"];
  category?: string;
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
}

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool | SimpleToolRegistration): void {
    if ("definition" in tool) {
      this.tools.set(tool.definition.name, tool);
    } else {
      // Simplified format
      const { name, description, inputSchema, category, execute } = tool;
      this.tools.set(name, {
        definition: { name, description, inputSchema, ...(category ? { category } : {}) } as ToolDefinition,
        executor: async (input, signal) => {
          const result = await execute(input, signal);
          return {
            toolCallId: "",
            toolName: name,
            isError: false,
            content: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          };
        },
      });
    }
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map((t) => t.definition);
  }

  getDefinitionsByNames(names: string[]): ToolDefinition[] {
    return names
      .map((n) => this.tools.get(n)?.definition)
      .filter((d): d is ToolDefinition => d != null);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolCallId: "",
        toolName: name,
        isError: true,
        content: `Tool "${name}" not found in registry.`,
      };
    }
    try {
      return await tool.executor(input, signal);
    } catch (err) {
      return {
        toolCallId: "",
        toolName: name,
        isError: true,
        content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
