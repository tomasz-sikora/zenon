import type {
  Message,
  MessageContent,
  ToolDefinition,
  TokenUsage,
} from "@zenon/shared-types";

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
export function messagesToOpenAI(
  messages: Message[],
): Array<{ role: string; content: unknown }> {
  return messages
    .filter((m) => m.role !== "system")
    .flatMap((m) => {
      if (m.role === "tool") {
        // OpenAI requires one `role:"tool"` message per tool call.
        // Our internal store may pack multiple tool_result items into one message,
        // so expand them here.
        const toolResults = m.content.filter((c) => c.type === "tool_result");
        if (toolResults.length > 0) {
          return toolResults.map((c) => ({
            role: "tool" as const,
            tool_call_id: c.type === "tool_result" ? c.toolCallId : "",
            content: c.type === "tool_result" ? c.content : "",
          }));
        }
      }

      if (m.role === "assistant") {
        const toolUse = m.content.filter((c) => c.type === "tool_use");
        const textBlocks = m.content.filter((c) => c.type === "text");

        if (toolUse.length > 0) {
          return [
            {
              role: "assistant" as const,
              content: textBlocks.length > 0
                ? textBlocks.map((b) => b.type === "text" ? b.text : "").join("")
                : null,
              tool_calls: toolUse
                .filter((c) => c.type === "tool_use")
                .map((c) => {
                  if (c.type !== "tool_use") return null;
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
            },
          ];
        }
      }

      return [{ role: m.role, content: buildOpenAIContent(m.content) }];
    });
}

function buildOpenAIContent(blocks: MessageContent[]): unknown {
  const textBlocks = blocks.filter((b) => b.type === "text");
  const imageBlocks = blocks.filter((b) => b.type === "image");

  if (imageBlocks.length === 0) {
    return textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  return [
    ...textBlocks.map((b) =>
      b.type === "text" ? { type: "text", text: b.text } : null,
    ),
    ...imageBlocks.map((b) =>
      b.type === "image"
        ? {
            type: "image_url",
            image_url: { url: b.url },
          }
        : null,
    ),
  ].filter(Boolean);
}

/** Extract system prompt from messages */
export function extractSystemPrompt(messages: Message[]): string | undefined {
  return messages
    .filter((m) => m.role === "system")
    .map((m) =>
      m.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("\n"),
    )
    .join("\n");
}

/** Convert tool definitions to OpenAI function format */
export function toolsToOpenAI(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}
