import type { Message, AgentDefinition, ToolCall, ToolResult } from "@zenon/shared-types";
export interface AgentRunOptions {
    conversation: {
        id: string;
        messages: Message[];
    };
    agent: AgentDefinition;
    /** Override which global skills to inject (by id). If omitted, all enabled skills are used. */
    selectedSkillIds?: string[];
    onChunk: (text: string) => void;
    /** Called when the model emits extended reasoning/thinking text */
    onThinking?: (text: string) => void;
    onToolCall: (toolCall: ToolCall) => void;
    onToolResult: (result: ToolResult) => void;
    onComplete: (usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }) => void;
    onError: (error: Error) => void;
    /** Called when a transient error triggers a retry */
    onRetry?: (attempt: number, maxAttempts: number, error: Error) => void;
    signal?: AbortSignal;
}
/**
 * Main agent run loop (ReAct pattern):
 * 1. Send messages + tools to LLM
 * 2. Stream response; collect tool calls + thinking
 * 3. Execute tool calls in parallel
 * 4. Add results to messages; loop back to step 1
 * 5. When no tool calls, or on last round (tools stripped to force text), done
 */
export declare function runAgent(opts: AgentRunOptions): Promise<void>;
