import type { AIProvider, CompletionOptions, StreamCallback } from "./base";
import { extractSystemPrompt } from "./base";
import type { Message, MessageContent, ToolDefinition } from "@zenon/shared-types";

export class GeminiProvider implements AIProvider {
  id = "gemini";
  name = "Google Gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(
    opts: CompletionOptions,
    onChunk: StreamCallback,
  ): Promise<void> {
    const systemPrompt = extractSystemPrompt(opts.messages);
    const contents = messagesToGemini(opts.messages);
    const modelId =
      opts.messages.find((m) => m.role === "assistant")?.modelId ??
      "gemini-2.5-flash";

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
      },
    };

    if (systemPrompt) {
      body["systemInstruction"] = { parts: [{ text: systemPrompt }] };
    }

    if (opts.tools && opts.tools.length > 0) {
      body["tools"] = [{ functionDeclarations: toolsToGemini(opts.tools) }];
    }

    const stream = opts.stream !== false;
    const endpoint = stream ? "streamGenerateContent" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${endpoint}?key=${this.apiKey}${stream ? "&alt=sse" : ""}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal ?? null,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini API error ${resp.status}: ${err}`);
    }

    if (!stream) {
      const data = (await resp.json()) as GeminiResponse;
      emitGeminiResponse(data, onChunk);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6)) as GeminiResponse;
          emitGeminiResponse(data, onChunk);
        } catch {
          // ignore
        }
      }
    }

    onChunk({ type: "done" });
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args: Record<string, unknown> };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function emitGeminiResponse(data: GeminiResponse, onChunk: StreamCallback) {
  const candidate = data.candidates?.[0];
  if (!candidate) return;

  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      onChunk({ type: "text", text: part.text });
    }
    if (part.functionCall) {
      const id = crypto.randomUUID();
      onChunk({
        type: "tool_call_end",
        toolCallId: id,
        toolName: part.functionCall.name,
        toolInput: part.functionCall.args,
      });
    }
  }

  if (data.usageMetadata) {
    onChunk({
      type: "done",
      usage: {
        inputTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      },
    });
  }
}

function messagesToGemini(
  messages: Message[],
): Array<{ role: string; parts: unknown[] }> {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: buildGeminiParts(m.content),
    }));
}

function buildGeminiParts(blocks: MessageContent[]): unknown[] {
  const parts: unknown[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push({ text: block.text });
    } else if (block.type === "image") {
      if (block.url.startsWith("data:")) {
        const [header, data] = block.url.split(",");
        const mimeType = header?.split(":")[1]?.split(";")[0] ?? "image/jpeg";
        parts.push({ inlineData: { mimeType, data } });
      }
    }
  }
  return parts;
}

function toolsToGemini(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}
