class ToolRegistry {
    tools = new Map();
    register(tool) {
        if ("definition" in tool) {
            this.tools.set(tool.definition.name, tool);
        }
        else {
            // Simplified format
            const { name, description, inputSchema, category, execute } = tool;
            this.tools.set(name, {
                definition: { name, description, inputSchema, ...(category ? { category } : {}) },
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
    get(name) {
        return this.tools.get(name);
    }
    getAll() {
        return Array.from(this.tools.values());
    }
    getDefinitions() {
        return this.getAll().map((t) => t.definition);
    }
    getDefinitionsByNames(names) {
        return names
            .map((n) => this.tools.get(n)?.definition)
            .filter((d) => d != null);
    }
    async execute(name, input, signal) {
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
        }
        catch (err) {
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
