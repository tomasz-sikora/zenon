import { extractSystemPrompt, toolsToOpenAI } from "./base";
export class AnthropicProvider {
    id;
    name;
    apiKey;
    /** Proxy base path — defaults to "/api/anthropic" (local nginx proxy) to avoid CORS */
    proxyUrl;
    constructor(opts) {
        this.id = opts.id;
        this.name = opts.name;
        this.apiKey = opts.apiKey;
        this.proxyUrl = opts.proxyUrl ?? "/api/anthropic";
    }
    async complete(opts, onChunk) {
        const system = extractSystemPrompt(opts.messages);
        const messages = messagesToAnthropic(opts.messages);
        const body = {
            model: opts.messages.find((m) => m.role === "assistant")?.modelId ?? "claude-sonnet-4-5",
            max_tokens: opts.maxTokens ?? 8192,
            messages,
            stream: opts.stream !== false,
            temperature: opts.temperature,
        };
        if (system)
            body["system"] = system;
        if (opts.tools && opts.tools.length > 0) {
            body["tools"] = toolsToOpenAI(opts.tools).map((t) => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters,
            }));
        }
        const url = `${this.proxyUrl}/messages`;
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify(body),
            signal: opts.signal ?? null,
        });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Anthropic API error ${resp.status}: ${err}`);
        }
        if (opts.stream === false) {
            const data = (await resp.json());
            for (const block of data.content) {
                if (block.type === "text" && block.text) {
                    onChunk({ type: "text", text: block.text });
                }
                else if (block.type === "tool_use") {
                    onChunk({
                        type: "tool_call_end",
                        toolCallId: block.id,
                        toolName: block.name,
                        toolInput: block.input,
                    });
                }
            }
            onChunk({
                type: "done",
                usage: {
                    inputTokens: data.usage.input_tokens,
                    outputTokens: data.usage.output_tokens,
                },
            });
            return;
        }
        const reader = resp.body?.getReader();
        if (!reader)
            throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";
        const toolBlocks = {};
        // Track thinking blocks by index → accumulated text
        const thinkingBlocks = {};
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            let eventType = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    eventType = line.slice(7).trim();
                }
                else if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (eventType === "content_block_start") {
                            const block = data["content_block"];
                            const idx = data["index"];
                            if (block.type === "tool_use" && block.id && block.name) {
                                toolBlocks[idx] = { id: block.id, name: block.name, inputJson: "" };
                                onChunk({ type: "tool_call_start", toolCallId: block.id, toolName: block.name });
                            }
                            else if (block.type === "thinking") {
                                thinkingBlocks[idx] = "";
                            }
                        }
                        else if (eventType === "content_block_delta") {
                            const delta = data["delta"];
                            const idx = data["index"];
                            if (delta.type === "text_delta" && delta.text) {
                                onChunk({ type: "text", text: delta.text });
                            }
                            else if (delta.type === "input_json_delta" && delta.partial_json) {
                                const tb = toolBlocks[idx];
                                if (tb) {
                                    tb.inputJson += delta.partial_json;
                                    onChunk({ type: "tool_call_delta", toolInputDelta: delta.partial_json });
                                }
                            }
                            else if (delta.type === "thinking_delta" && delta.thinking) {
                                if (thinkingBlocks[idx] !== undefined) {
                                    thinkingBlocks[idx] += delta.thinking;
                                }
                                onChunk({ type: "thinking", thinkingText: delta.thinking });
                            }
                        }
                        else if (eventType === "content_block_stop") {
                            const idx = data["index"];
                            const tb = toolBlocks[idx];
                            if (tb) {
                                try {
                                    onChunk({
                                        type: "tool_call_end",
                                        toolCallId: tb.id,
                                        toolName: tb.name,
                                        toolInput: JSON.parse(tb.inputJson),
                                    });
                                }
                                catch {
                                    // malformed JSON from tool input
                                }
                            }
                        }
                        else if (eventType === "message_delta") {
                            const usage = data["usage"] ?? {};
                            if (usage.output_tokens != null) {
                                onChunk({
                                    type: "done",
                                    usage: { inputTokens: 0, outputTokens: usage.output_tokens },
                                });
                            }
                        }
                    }
                    catch {
                        // ignore parse errors
                    }
                }
            }
        }
    }
}
function messagesToAnthropic(messages) {
    return messages
        .filter((m) => m.role !== "system")
        .map((m) => {
        if (m.role === "tool") {
            const result = m.content.find((c) => c.type === "tool_result");
            if (result?.type === "tool_result") {
                return {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: result.toolCallId,
                            content: result.content,
                            is_error: result.isError,
                        },
                    ],
                };
            }
        }
        const content = buildAnthropicContent(m.content);
        return { role: m.role === "assistant" ? "assistant" : "user", content };
    });
}
function buildAnthropicContent(blocks) {
    const parts = [];
    for (const block of blocks) {
        if (block.type === "text") {
            parts.push({ type: "text", text: block.text });
        }
        else if (block.type === "image") {
            if (block.url.startsWith("data:")) {
                const [header, data] = block.url.split(",");
                const mediaType = header?.split(":")[1]?.split(";")[0] ?? "image/jpeg";
                parts.push({
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data },
                });
            }
            else {
                parts.push({
                    type: "image",
                    source: { type: "url", url: block.url },
                });
            }
        }
        else if (block.type === "tool_use") {
            parts.push({
                type: "tool_use",
                id: block.toolCallId,
                name: block.toolName,
                input: block.toolInput,
            });
        }
    }
    if (parts.length === 1 && parts[0].type === "text") {
        return parts[0].text;
    }
    return parts;
}
