import type { Message, ToolDefinition, TokenUsage } from "@zenon/shared-types";
export interface CompletionOptions {
    messages: Message[];
    modelId: string;
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    signal?: AbortSignal;
}
export interface CompletionChunk {
    type: "text" | "thinking" | "tool_call_start" | "tool_call_delta" | "tool_call_end" | "done";
    text?: string;
    /** Incremental thinking/reasoning text */
    thinkingText?: string;
    toolCallId?: string;
    toolName?: string;
    toolInputDelta?: string;
    toolInput?: Record<string, unknown>;
    usage?: TokenUsage;
}
export type StreamCallback = (chunk: CompletionChunk) => void;
export interface AIProvider {
    id: string;
    name: string;
    complete(opts: CompletionOptions, onChunk: StreamCallback): Promise<void>;
}
/** Convert internal Message[] to OpenAI-compatible format */
export declare function messagesToOpenAI(messages: Message[]): Array<{
    role: string;
    content: unknown;
}>;
/** Extract system prompt from messages */
export declare function extractSystemPrompt(messages: Message[]): string | undefined;
/** Convert tool definitions to OpenAI function format */
export declare function toolsToOpenAI(tools: ToolDefinition[]): {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, import("@zenon/shared-types").JsonSchemaProperty>;
            required?: string[];
        };
    };
}[];
