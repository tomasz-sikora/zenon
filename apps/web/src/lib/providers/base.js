/** Convert internal Message[] to OpenAI-compatible format */
export function messagesToOpenAI(messages) {
    return messages
        .filter((m) => m.role !== "system")
        .map((m) => {
        if (m.role === "tool") {
            const toolResult = m.content.find((c) => c.type === "tool_result");
            if (toolResult?.type === "tool_result") {
                return {
                    role: "tool",
                    tool_call_id: toolResult.toolCallId,
                    content: toolResult.content,
                };
            }
        }
        if (m.role === "assistant") {
            const toolUse = m.content.filter((c) => c.type === "tool_use");
            const textBlocks = m.content.filter((c) => c.type === "text");
            if (toolUse.length > 0) {
                return {
                    role: "assistant",
                    content: textBlocks.length > 0
                        ? textBlocks.map((b) => b.type === "text" ? b.text : "").join("")
                        : null,
                    tool_calls: toolUse
                        .filter((c) => c.type === "tool_use")
                        .map((c) => {
                        if (c.type !== "tool_use")
                            return null;
                        return {
                            id: c.toolCallId,
                            type: "function",
                            function: {
                                name: c.toolName,
                                arguments: JSON.stringify(c.toolInput),
                            },
                        };
                    })
                        .filter(Boolean),
                };
            }
        }
        const content = buildOpenAIContent(m.content);
        return { role: m.role, content };
    });
}
function buildOpenAIContent(blocks) {
    const textBlocks = blocks.filter((b) => b.type === "text");
    const imageBlocks = blocks.filter((b) => b.type === "image");
    if (imageBlocks.length === 0) {
        return textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("");
    }
    return [
        ...textBlocks.map((b) => b.type === "text" ? { type: "text", text: b.text } : null),
        ...imageBlocks.map((b) => b.type === "image"
            ? {
                type: "image_url",
                image_url: { url: b.url },
            }
            : null),
    ].filter(Boolean);
}
/** Extract system prompt from messages */
export function extractSystemPrompt(messages) {
    return messages
        .filter((m) => m.role === "system")
        .map((m) => m.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("\n"))
        .join("\n");
}
/** Convert tool definitions to OpenAI function format */
export function toolsToOpenAI(tools) {
    return tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
        },
    }));
}
